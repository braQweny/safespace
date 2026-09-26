import { getAiProviderEnv } from "@/lib/ai-provider/env";
import type { AiProviderName } from "@/lib/ai-provider/types";
import { sendAiChat } from "@/lib/ai-provider/chat";
import { buildChatProviderMetadata, readCompleteChoiceContent } from "@/lib/ai-provider/chat-response";
import type { Fetcher } from "@openrouter/sdk";
import type { ChatResult } from "@openrouter/sdk/models";
import { resolveSummaryModel } from "./env";
import {
  buildOpenRouterReasoningParameter,
  buildOpenRouterTokenLimitParameter,
  isOpenRouterGemini35FlashModel,
  isOpenRouterGemini37FlashModel,
  isOpenRouterGptLunaModel,
  isOpenRouterOxAlphaModel,
  supportsOpenRouterTemperature,
  usesOpenRouterReasoningBudget,
} from "@/lib/session-ai/openrouter-request-params";
import type { OpenRouterReasoningEffort } from "@/lib/openrouter/env";
import { OpenRouterChatError } from "@/lib/openrouter/sdk-chat";
import type { OpenRouterNonStreamingChatRequest } from "@/lib/openrouter/sdk-chat";
import {
  getOpenRouterPrivateProviderPreferences,
  type OpenRouterPrivateProviderPreferences,
} from "@/lib/openrouter/privacy";
import { SessionSummaryError } from "./errors";
import { buildSessionSummaryMessages } from "./summary-prompt";
import type { GenerateSessionSummaryInput, SessionSummaryResponse, SessionSummaryPromptMessage } from "./types";

const OPENROUTER_SUMMARY_TIMEOUT_MS = 12_000;
// A model that thinks before it writes needs longer than a plain chat model;
// nothing in the session budget constrains a summary, so it can wait.
const OPENROUTER_REASONING_SUMMARY_TIMEOUT_MS = 25_000;
const OPENROUTER_SUMMARY_MAX_COMPLETION_TOKENS = 320;
const OPENROUTER_GEMINI_3_5_FLASH_SUMMARY_MAX_COMPLETION_TOKENS = 800;
const OPENROUTER_GEMINI_3_7_FLASH_SUMMARY_MAX_COMPLETION_TOKENS = 1_600;
const OPENROUTER_OX_ALPHA_SUMMARY_MAX_COMPLETION_TOKENS = 2_400;
const OPENROUTER_GPT_LUNA_SUMMARY_MAX_COMPLETION_TOKENS = 2_400;
const OPENROUTER_SUMMARY_TEMPERATURE = 0.2;

interface OpenRouterSummaryOptions {
  provider?: AiProviderName;
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
    effort: OpenRouterReasoningEffort;
  };
  stream: false;
  provider: OpenRouterPrivateProviderPreferences;
};

export { resolveSummaryModel } from "./env";

export function generateSessionSummaryWithOpenRouter(
  input: GenerateSessionSummaryInput,
  options: OpenRouterSummaryOptions = {},
): Promise<SessionSummaryResponse> {
  return generateSessionSummaryWithAiProvider(input, { ...options, provider: "openrouter" });
}

export async function generateSessionSummaryWithAiProvider(
  input: GenerateSessionSummaryInput,
  options: OpenRouterSummaryOptions = {},
): Promise<SessionSummaryResponse> {
  const config = getAiProviderEnv(options.provider);
  const apiKey = options.apiKey ?? config.apiKey;
  const model = resolveSummaryModel(options.model ?? config.summaryModel);

  try {
    const response = await sendAiChat({
      provider: config.provider,
      apiKey,
      chatRequest: buildOpenRouterSummaryRequest(input, model),
      fetcher: options.fetcher,
      timeoutMs: resolveTimeoutMs(options.timeoutMs, model),
    });

    return {
      summaryText: extractSummaryText(response),
      providerMetadata: buildChatProviderMetadata(response, model, config.provider),
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
    ...buildOpenRouterReasoningParameter(model, resolveSummaryReasoningEffort(model)),
    ...buildOpenRouterTokenLimitParameter(
      model,
      input.continuityMemory !== undefined
        ? Math.max(4000, resolveSummaryMaxCompletionTokens(model))
        : resolveSummaryMaxCompletionTokens(model),
    ),
    stream: false,
    provider: getOpenRouterPrivateProviderPreferences(model),
  };
}

/**
 * Reasoning models bill hidden thinking against the same completion budget as
 * the visible answer, and they think *before* writing. Gemini 3.7 Flash spent
 * 304 of 320 tokens reasoning and came back with `finish_reason: "length"`,
 * which `readCompleteChoiceContent` rejects — every summary failed. Keep
 * this branch in step with `resolveSessionMaxCompletionTokens` in session-ai.
 */
export function resolveSummaryMaxCompletionTokens(model: string) {
  if (isOpenRouterOxAlphaModel(model)) {
    return OPENROUTER_OX_ALPHA_SUMMARY_MAX_COMPLETION_TOKENS;
  }

  if (isOpenRouterGptLunaModel(model)) {
    return OPENROUTER_GPT_LUNA_SUMMARY_MAX_COMPLETION_TOKENS;
  }

  if (isOpenRouterGemini37FlashModel(model)) {
    return OPENROUTER_GEMINI_3_7_FLASH_SUMMARY_MAX_COMPLETION_TOKENS;
  }

  if (isOpenRouterGemini35FlashModel(model)) {
    return OPENROUTER_GEMINI_3_5_FLASH_SUMMARY_MAX_COMPLETION_TOKENS;
  }

  return OPENROUTER_SUMMARY_MAX_COMPLETION_TOKENS;
}

/**
 * A summary is a short, factual condensation — the Luna family gets `low`
 * instead of its `medium` session default, which keeps hidden thinking (and
 * the bill) small without dropping the parameter that pins the budget.
 */
export function resolveSummaryReasoningEffort(model: string): OpenRouterReasoningEffort | undefined {
  return isOpenRouterGptLunaModel(model) ? "low" : undefined;
}

function buildOptionalSamplingParameters(model: string): Pick<OpenRouterSummaryRequestBody, "temperature"> {
  if (!supportsOpenRouterTemperature(model)) {
    return {};
  }

  return {
    temperature: OPENROUTER_SUMMARY_TEMPERATURE,
  };
}

function resolveTimeoutMs(timeoutMs: number | undefined, model: string) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return usesOpenRouterReasoningBudget(model, resolveSummaryReasoningEffort(model))
      ? OPENROUTER_REASONING_SUMMARY_TIMEOUT_MS
      : OPENROUTER_SUMMARY_TIMEOUT_MS;
  }

  return Math.round(timeoutMs);
}

// `length`, `content_filter` and `tool_calls` are incomplete replies: rejected,
// never trimmed into a summary.
function extractSummaryText(responseBody: ChatResult) {
  return readCompleteChoiceContent(responseBody, throwInvalidProviderResponse).trim();
}

function throwInvalidProviderResponse(): never {
  throw new SessionSummaryError("invalid_provider_response");
}
