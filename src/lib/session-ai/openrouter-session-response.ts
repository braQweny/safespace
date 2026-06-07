import { getOpenRouterSessionConfig, resolveSessionModel } from "./env";
import { SessionAiError, type SessionAiErrorCategory } from "./errors";
import { buildSessionResponseMessages } from "./session-response-prompt";
import type {
  GenerateSessionResponseInput,
  SessionAiFinishReason,
  SessionAiProviderMetadata,
  SessionAiResponse,
  SessionAiTokenUsage,
  SessionResponsePromptMessage,
} from "./types";

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_SESSION_TIMEOUT_MS = 12_000;
const OPENROUTER_SESSION_MAX_COMPLETION_TOKENS = 420;
const OPENROUTER_SESSION_TEMPERATURE = 0.4;

interface OpenRouterSessionResponseOptions {
  apiKey?: string;
  model?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

interface OpenRouterSessionRequestBody {
  model: string;
  messages: readonly SessionResponsePromptMessage[];
  temperature?: number;
  max_completion_tokens: number;
  stream: false;
  provider: {
    require_parameters: true;
  };
}

export async function generateSessionResponseWithOpenRouter(
  input: GenerateSessionResponseInput,
  options: OpenRouterSessionResponseOptions = {},
): Promise<SessionAiResponse> {
  const config = getOpenRouterSessionConfig();
  const apiKey = options.apiKey ?? config.apiKey;

  if (!apiKey?.trim()) {
    throw new SessionAiError("missing_configuration");
  }

  const model = resolveSessionModel(options.model ?? config.model);
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
      body: JSON.stringify(buildOpenRouterSessionRequest(input, model)),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new SessionAiError(mapOpenRouterStatus(response.status));
    }

    const responseBody: unknown = await response.json();
    const assistantText = extractAssistantText(responseBody);

    return {
      assistantText,
      providerMetadata: buildProviderMetadata(responseBody, model),
    };
  } catch (error) {
    if (error instanceof SessionAiError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new SessionAiError("provider_timeout");
    }

    throw new SessionAiError("provider_unavailable");
  } finally {
    clearTimeout(timeoutId);
  }
}

export function buildOpenRouterSessionRequest(
  input: GenerateSessionResponseInput,
  model: string,
): OpenRouterSessionRequestBody {
  return {
    model,
    messages: buildSessionResponseMessages(input),
    ...buildOptionalSamplingParameters(model),
    max_completion_tokens: OPENROUTER_SESSION_MAX_COMPLETION_TOKENS,
    stream: false,
    provider: {
      require_parameters: true,
    },
  };
}

function buildOptionalSamplingParameters(model: string): Pick<OpenRouterSessionRequestBody, "temperature"> {
  if (!supportsTemperature(model)) {
    return {};
  }

  return {
    temperature: OPENROUTER_SESSION_TEMPERATURE,
  };
}

function supportsTemperature(model: string) {
  return !/^openai\/gpt-5(?:[.-]|$)/i.test(model.trim());
}

function resolveTimeoutMs(timeoutMs: number | undefined) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return OPENROUTER_SESSION_TIMEOUT_MS;
  }

  return Math.round(timeoutMs);
}

function mapOpenRouterStatus(status: number): SessionAiErrorCategory {
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

function extractAssistantText(responseBody: unknown) {
  const choice = extractFirstChoice(responseBody);
  const message = isRecord(choice.message) ? choice.message : null;
  const content = message?.content;

  if (typeof content !== "string") {
    throw new SessionAiError("invalid_provider_response");
  }

  const assistantText = content.trim();

  if (!assistantText) {
    throw new SessionAiError("invalid_provider_response");
  }

  return assistantText;
}

function buildProviderMetadata(responseBody: unknown, fallbackModel: string): SessionAiProviderMetadata {
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
    throw new SessionAiError("invalid_provider_response");
  }

  const choice: unknown = choices[0];

  if (!isRecord(choice)) {
    throw new SessionAiError("invalid_provider_response");
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

function parseFinishReason(responseBody: unknown): SessionAiFinishReason | undefined {
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

function parseUsage(responseBody: unknown): SessionAiTokenUsage | undefined {
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

function parseTokenCount<K extends keyof SessionAiTokenUsage>(
  value: unknown,
  key: K,
): Pick<SessionAiTokenUsage, K> | Record<string, never> {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return {};
  }

  return {
    [key]: Math.round(value),
  } as Pick<SessionAiTokenUsage, K>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown) {
  return isRecord(error) && error.name === "AbortError";
}
