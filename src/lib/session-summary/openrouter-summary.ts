import type { Fetcher } from "@openrouter/sdk";
import type { ChatResult } from "@openrouter/sdk/models";
import { getOpenRouterSummaryConfig, resolveSummaryModel } from "./env";
import {
  buildOpenRouterReasoningParameter,
  buildOpenRouterTokenLimitParameter,
  isOpenRouterGemini35FlashModel,
  isOpenRouterGemini37FlashModel,
  supportsOpenRouterTemperature,
} from "@/lib/session-ai/openrouter-request-params";
import { OpenRouterChatError, sendOpenRouterChat } from "@/lib/openrouter/sdk-chat";
import type { OpenRouterNonStreamingChatRequest } from "@/lib/openrouter/sdk-chat";
import { SessionSummaryError } from "./errors";
import { buildSessionSummaryMessages } from "./summary-prompt";
import type {
  GenerateSessionSummaryInput,
  SessionSummaryFinishReason,
  SessionSummaryProviderMetadata,
  SessionSummaryResponse,
  SessionSummaryPromptMessage,
  SessionSummaryTokenUsage,
} from "./types";

const OPENROUTER_SUMMARY_TIMEOUT_MS = 12_000;
const OPENROUTER_SUMMARY_MAX_COMPLETION_TOKENS = 320;
const OPENROUTER_GEMINI_3_5_FLASH_SUMMARY_MAX_COMPLETION_TOKENS = 800;
const OPENROUTER_GEMINI_3_7_FLASH_SUMMARY_MAX_COMPLETION_TOKENS = 1_600;
const OPENROUTER_SUMMARY_TEMPERATURE = 0.2;

interface OpenRouterSummaryOptions {
  apiKey?: string;
  model?: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

type OpenRouterSummaryRequestBody = OpenRouterNonStreamingChatRequest & {
  model: string;
  messages: SessionSummaryPromptMessage[];
  temperature?: number;
  maxCompletionTokens?: number;
  maxTokens?: number;
  reasoning?: {
    effort: "minimal" | "medium";
  };
  stream: false;
  provider: {
    requireParameters: true;
  };
};

export { resolveSummaryModel } from "./env";

export async function generateSessionSummaryWithOpenRouter(
  input: GenerateSessionSummaryInput,
  options: OpenRouterSummaryOptions = {},
): Promise<SessionSummaryResponse> {
  const config = getOpenRouterSummaryConfig();
  const apiKey = options.apiKey ?? config.apiKey;
  const model = resolveSummaryModel(options.model ?? config.model);

  try {
    const response = await sendOpenRouterChat({
      apiKey,
      chatRequest: buildOpenRouterSummaryRequest(input, model),
      fetcher: options.fetcher,
      timeoutMs: resolveTimeoutMs(options.timeoutMs),
    });

    return {
      summaryText: extractSummaryText(response),
      providerMetadata: buildProviderMetadata(response, model),
    };
  } catch (error) {
    if (error instanceof SessionSummaryError) {
      throw error;
    }

    if (error instanceof OpenRouterChatError) {
      throw new SessionSummaryError(error.category);
    }

    throw new SessionSummaryError("provider_unavailable");
  }
}

export function buildOpenRouterSummaryRequest(
  input: GenerateSessionSummaryInput,
  model: string,
): OpenRouterSummaryRequestBody {
  return {
    model,
    messages: [...buildSessionSummaryMessages(input)],
    ...buildOptionalSamplingParameters(model),
    ...buildOpenRouterReasoningParameter(model),
    ...buildOpenRouterTokenLimitParameter(model, resolveSummaryMaxCompletionTokens(model)),
    stream: false,
    provider: {
      requireParameters: true,
    },
  };
}

/**
 * Reasoning models bill hidden thinking against the same completion budget as
 * the visible answer, and they think *before* writing. Gemini 3.7 Flash spent
 * 304 of 320 tokens reasoning and came back with `finish_reason: "length"`,
 * which `assertCompleteSummaryResponse` rejects — every summary failed. Keep
 * this branch in step with `resolveSessionMaxCompletionTokens` in session-ai.
 */
function resolveSummaryMaxCompletionTokens(model: string) {
  if (isOpenRouterGemini37FlashModel(model)) {
    return OPENROUTER_GEMINI_3_7_FLASH_SUMMARY_MAX_COMPLETION_TOKENS;
  }

  if (isOpenRouterGemini35FlashModel(model)) {
    return OPENROUTER_GEMINI_3_5_FLASH_SUMMARY_MAX_COMPLETION_TOKENS;
  }

  return OPENROUTER_SUMMARY_MAX_COMPLETION_TOKENS;
}

function buildOptionalSamplingParameters(model: string): Pick<OpenRouterSummaryRequestBody, "temperature"> {
  if (!supportsOpenRouterTemperature(model)) {
    return {};
  }

  return {
    temperature: OPENROUTER_SUMMARY_TEMPERATURE,
  };
}

function resolveTimeoutMs(timeoutMs: number | undefined) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return OPENROUTER_SUMMARY_TIMEOUT_MS;
  }

  return Math.round(timeoutMs);
}

function extractSummaryText(responseBody: ChatResult) {
  assertCompleteSummaryResponse(responseBody);

  const choice = extractFirstChoice(responseBody);
  const content: unknown = choice.message.content;

  if (typeof content !== "string") {
    throw new SessionSummaryError("invalid_provider_response");
  }

  const summaryText = content.trim();

  if (!summaryText) {
    throw new SessionSummaryError("invalid_provider_response");
  }

  return summaryText;
}

function assertCompleteSummaryResponse(responseBody: ChatResult) {
  const finishReason = parseFinishReason(responseBody);

  if (finishReason === "length" || finishReason === "content_filter" || finishReason === "tool_calls") {
    throw new SessionSummaryError("invalid_provider_response");
  }
}

function buildProviderMetadata(responseBody: ChatResult, fallbackModel: string): SessionSummaryProviderMetadata {
  const finishReason = parseFinishReason(responseBody);
  const usage = parseUsage(responseBody);

  return {
    provider: "openrouter",
    model: parseResponseModel(responseBody) ?? fallbackModel,
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
  };
}

function extractFirstChoice(responseBody: ChatResult) {
  const { choices } = responseBody;

  if (choices.length === 0) {
    throw new SessionSummaryError("invalid_provider_response");
  }

  return choices[0];
}

function parseResponseModel(responseBody: ChatResult) {
  const model = responseBody.model.trim();

  return model.length > 0 ? model : undefined;
}

function parseFinishReason(responseBody: ChatResult): SessionSummaryFinishReason | undefined {
  const choice = extractFirstChoice(responseBody);
  // The SDK types finishReason as a branded Unrecognized<string> union that
  // equality checks cannot narrow; widen to plain string first.
  const finishReason = choice.finishReason as string | undefined;

  if (finishReason === "stop" || finishReason === "length" || finishReason === "content_filter") {
    return finishReason;
  }

  if (finishReason === "tool_calls") {
    return finishReason;
  }

  return typeof finishReason === "string" && finishReason.trim().length > 0 ? "unknown" : undefined;
}

function parseUsage(responseBody: ChatResult): SessionSummaryTokenUsage | undefined {
  if (!responseBody.usage) {
    return undefined;
  }

  const usage = {
    ...parseTokenCount(responseBody.usage.promptTokens, "promptTokens"),
    ...parseTokenCount(responseBody.usage.completionTokens, "completionTokens"),
    ...parseTokenCount(responseBody.usage.totalTokens, "totalTokens"),
  };

  return Object.keys(usage).length > 0 ? usage : undefined;
}

function parseTokenCount<K extends keyof SessionSummaryTokenUsage>(
  value: unknown,
  key: K,
): Pick<SessionSummaryTokenUsage, K> | Record<string, never> {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return {};
  }

  return {
    [key]: Math.round(value),
  } as Pick<SessionSummaryTokenUsage, K>;
}
