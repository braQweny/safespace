import { getOpenRouterSessionConfig, resolveSessionModel } from "@/lib/session-ai/env";
import {
  buildOpenRouterTokenLimitParameter,
  supportsOpenRouterTemperature,
} from "@/lib/session-ai/openrouter-request-params";
import { SessionSummaryError, type SessionSummaryErrorCategory } from "./errors";
import { buildSessionSummaryMessages } from "./summary-prompt";
import type {
  GenerateSessionSummaryInput,
  SessionSummaryFinishReason,
  SessionSummaryProviderMetadata,
  SessionSummaryResponse,
  SessionSummaryPromptMessage,
  SessionSummaryTokenUsage,
} from "./types";

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_SUMMARY_TIMEOUT_MS = 12_000;
const OPENROUTER_SUMMARY_MAX_COMPLETION_TOKENS = 320;
const OPENROUTER_SUMMARY_TEMPERATURE = 0.2;

interface OpenRouterSummaryOptions {
  apiKey?: string;
  model?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

interface OpenRouterSummaryRequestBody {
  model: string;
  messages: readonly SessionSummaryPromptMessage[];
  temperature?: number;
  max_completion_tokens?: number;
  max_tokens?: number;
  stream: false;
  provider: {
    require_parameters: true;
  };
}

export function resolveSummaryModel(modelOverride?: string | null) {
  return resolveSessionModel(modelOverride);
}

export async function generateSessionSummaryWithOpenRouter(
  input: GenerateSessionSummaryInput,
  options: OpenRouterSummaryOptions = {},
): Promise<SessionSummaryResponse> {
  const config = getOpenRouterSessionConfig();
  const apiKey = options.apiKey ?? config.apiKey;

  if (!apiKey?.trim()) {
    throw new SessionSummaryError("missing_configuration");
  }

  const model = resolveSummaryModel(options.model ?? config.model);
  const fetcher = options.fetcher ?? fetch;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, resolveTimeoutMs(options.timeoutMs));

  try {
    const response = await fetcher(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildOpenRouterSummaryRequest(input, model)),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new SessionSummaryError(mapOpenRouterStatus(response.status));
    }

    const responseBody: unknown = await response.json();
    const summaryText = extractSummaryText(responseBody);

    return {
      summaryText,
      providerMetadata: buildProviderMetadata(responseBody, model),
    };
  } catch (error) {
    if (error instanceof SessionSummaryError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new SessionSummaryError("provider_timeout");
    }

    throw new SessionSummaryError("provider_unavailable");
  } finally {
    clearTimeout(timeoutId);
  }
}

export function buildOpenRouterSummaryRequest(
  input: GenerateSessionSummaryInput,
  model: string,
): OpenRouterSummaryRequestBody {
  return {
    model,
    messages: buildSessionSummaryMessages(input),
    ...buildOptionalSamplingParameters(model),
    ...buildOpenRouterTokenLimitParameter(model, OPENROUTER_SUMMARY_MAX_COMPLETION_TOKENS),
    stream: false,
    provider: {
      require_parameters: true,
    },
  };
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

function mapOpenRouterStatus(status: number): SessionSummaryErrorCategory {
  if (status === 408) {
    return "provider_timeout";
  }

  if (status === 429) {
    return "provider_rate_limited";
  }

  if (status === 400 || status === 422) {
    return "invalid_provider_response";
  }

  return "provider_unavailable";
}

function extractSummaryText(responseBody: unknown) {
  const choice = extractFirstChoice(responseBody);
  const message = isRecord(choice.message) ? choice.message : null;
  const content = message?.content;

  if (typeof content !== "string") {
    throw new SessionSummaryError("invalid_provider_response");
  }

  const summaryText = content.trim();

  if (!summaryText) {
    throw new SessionSummaryError("invalid_provider_response");
  }

  return summaryText;
}

function buildProviderMetadata(responseBody: unknown, fallbackModel: string): SessionSummaryProviderMetadata {
  const finishReason = parseFinishReason(responseBody);
  const usage = parseUsage(responseBody);

  return {
    provider: "openrouter",
    model: parseResponseModel(responseBody) ?? fallbackModel,
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
  };
}

function extractFirstChoice(responseBody: unknown): Record<string, unknown> {
  const choices = isRecord(responseBody) ? responseBody.choices : null;

  if (!Array.isArray(choices) || choices.length === 0) {
    throw new SessionSummaryError("invalid_provider_response");
  }

  const choice: unknown = choices[0];

  if (!isRecord(choice)) {
    throw new SessionSummaryError("invalid_provider_response");
  }

  return choice;
}

function parseResponseModel(responseBody: unknown) {
  if (!isRecord(responseBody) || typeof responseBody.model !== "string") {
    return undefined;
  }

  const model = responseBody.model.trim();

  return model.length > 0 ? model : undefined;
}

function parseFinishReason(responseBody: unknown): SessionSummaryFinishReason | undefined {
  const choice = extractFirstChoice(responseBody);
  const finishReason = choice.finish_reason;

  if (finishReason === "stop" || finishReason === "length" || finishReason === "content_filter") {
    return finishReason;
  }

  if (finishReason === "tool_calls") {
    return finishReason;
  }

  return typeof finishReason === "string" && finishReason.trim().length > 0 ? "unknown" : undefined;
}

function parseUsage(responseBody: unknown): SessionSummaryTokenUsage | undefined {
  if (!isRecord(responseBody) || !isRecord(responseBody.usage)) {
    return undefined;
  }

  const usage = {
    ...parseTokenCount(responseBody.usage.prompt_tokens, "promptTokens"),
    ...parseTokenCount(responseBody.usage.completion_tokens, "completionTokens"),
    ...parseTokenCount(responseBody.usage.total_tokens, "totalTokens"),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown) {
  return isRecord(error) && error.name === "AbortError";
}
