import type { Fetcher } from "@openrouter/sdk";
import type { ChatResult } from "@openrouter/sdk/models";
import { getOpenRouterSummaryConfig, resolveSummaryModel } from "./env";
import {
  buildOpenRouterReasoningParameter,
  buildOpenRouterTokenLimitParameter,
  isOpenRouterGemini35FlashModel,
  isOpenRouterGemini37FlashModel,
  isOpenRouterGpt56LunaModel,
  isOpenRouterOxAlphaModel,
  supportsOpenRouterTemperature,
  usesOpenRouterReasoningBudget,
} from "@/lib/session-ai/openrouter-request-params";
import type { OpenRouterReasoningEffort } from "@/lib/openrouter/env";
import { OpenRouterChatError, sendOpenRouterChat } from "@/lib/openrouter/sdk-chat";
import type { OpenRouterNonStreamingChatRequest } from "@/lib/openrouter/sdk-chat";
import {
  getOpenRouterPrivateProviderPreferences,
  type OpenRouterPrivateProviderPreferences,
} from "@/lib/openrouter/privacy";
import { SessionSummaryError } from "./errors";
import { assertCompleteSummaryResponse, buildSummaryProviderMetadata, extractFirstChoice } from "./provider-response";
import { buildSessionSummaryMessages } from "./summary-prompt";
import type { GenerateSessionSummaryInput, SessionSummaryResponse, SessionSummaryPromptMessage } from "./types";

export { assertCompleteSummaryResponse, buildSummaryProviderMetadata } from "./provider-response";

const OPENROUTER_SUMMARY_TIMEOUT_MS = 12_000;
// A model that thinks before it writes needs longer than a plain chat model;
// nothing in the session budget constrains a summary, so it can wait.
const OPENROUTER_REASONING_SUMMARY_TIMEOUT_MS = 25_000;
const OPENROUTER_SUMMARY_MAX_COMPLETION_TOKENS = 320;
const OPENROUTER_GEMINI_3_5_FLASH_SUMMARY_MAX_COMPLETION_TOKENS = 800;
const OPENROUTER_GEMINI_3_7_FLASH_SUMMARY_MAX_COMPLETION_TOKENS = 1_600;
const OPENROUTER_OX_ALPHA_SUMMARY_MAX_COMPLETION_TOKENS = 2_400;
const OPENROUTER_GPT_5_6_LUNA_SUMMARY_MAX_COMPLETION_TOKENS = 2_400;
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
    effort: OpenRouterReasoningEffort;
  };
  stream: false;
  provider: OpenRouterPrivateProviderPreferences;
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
      timeoutMs: resolveTimeoutMs(options.timeoutMs, model),
    });

    return {
      summaryText: extractSummaryText(response),
      providerMetadata: buildSummaryProviderMetadata(response, model),
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
 * which `assertCompleteSummaryResponse` rejects — every summary failed. Keep
 * this branch in step with `resolveSessionMaxCompletionTokens` in session-ai.
 */
export function resolveSummaryMaxCompletionTokens(model: string) {
  if (isOpenRouterOxAlphaModel(model)) {
    return OPENROUTER_OX_ALPHA_SUMMARY_MAX_COMPLETION_TOKENS;
  }

  if (isOpenRouterGpt56LunaModel(model)) {
    return OPENROUTER_GPT_5_6_LUNA_SUMMARY_MAX_COMPLETION_TOKENS;
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
  return isOpenRouterGpt56LunaModel(model) ? "low" : undefined;
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
