import type { Fetcher } from "@openrouter/sdk";
import type { ChatResult } from "@openrouter/sdk/models";
import { OpenRouterChatError, sendOpenRouterChat } from "@/lib/openrouter/sdk-chat";
import type { OpenRouterNonStreamingChatRequest } from "@/lib/openrouter/sdk-chat";
import { getOpenRouterSessionConfig, resolveSessionModel } from "./env";
import { SessionAiError } from "./errors";
import { buildOpenRouterTokenLimitParameter, supportsOpenRouterTemperature } from "./openrouter-request-params";
import { buildSessionResponseMessages } from "./session-response-prompt";
import type {
  GenerateSessionResponseInput,
  SessionAiFinishReason,
  SessionAiProviderMetadata,
  SessionAiResponse,
  SessionAiTokenUsage,
  SessionResponsePromptMessage,
} from "./types";

const OPENROUTER_SESSION_TIMEOUT_MS = 12_000;
const OPENROUTER_SESSION_MAX_COMPLETION_TOKENS = 800;
const OPENROUTER_SESSION_TEMPERATURE = 0.7;
const OPENROUTER_SESSION_REASONING_MODEL_PATTERN = /^google\/gemini-3\.1-flash-lite(?:$|[-:])/i;
const OPENROUTER_SESSION_REASONING_EFFORT = "medium";

interface OpenRouterSessionResponseOptions {
  apiKey?: string;
  model?: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

type OpenRouterSessionRequestBody = OpenRouterNonStreamingChatRequest & {
  model: string;
  messages: SessionResponsePromptMessage[];
  temperature?: number;
  maxCompletionTokens?: number;
  maxTokens?: number;
  reasoning?: {
    effort: typeof OPENROUTER_SESSION_REASONING_EFFORT;
  };
  stream: false;
  provider: {
    requireParameters: true;
  };
};

export async function generateSessionResponseWithOpenRouter(
  input: GenerateSessionResponseInput,
  options: OpenRouterSessionResponseOptions = {},
): Promise<SessionAiResponse> {
  const config = getOpenRouterSessionConfig();
  const apiKey = options.apiKey ?? config.apiKey;
  const model = resolveSessionModel(options.model ?? config.model);

  try {
    const response = await sendOpenRouterChat({
      apiKey,
      chatRequest: buildOpenRouterSessionRequest(input, model),
      fetcher: options.fetcher,
      timeoutMs: resolveTimeoutMs(options.timeoutMs),
    });

    return {
      assistantText: extractAssistantText(response),
      providerMetadata: buildProviderMetadata(response, model),
    };
  } catch (error) {
    if (error instanceof SessionAiError) {
      throw error;
    }

    if (error instanceof OpenRouterChatError) {
      throw new SessionAiError(error.category);
    }

    throw new SessionAiError("provider_unavailable");
  }
}

export function buildOpenRouterSessionRequest(
  input: GenerateSessionResponseInput,
  model: string,
): OpenRouterSessionRequestBody {
  return {
    model,
    messages: [...buildSessionResponseMessages(input)],
    ...buildOptionalSamplingParameters(model),
    ...buildOptionalReasoningParameters(model),
    ...buildOpenRouterTokenLimitParameter(model, OPENROUTER_SESSION_MAX_COMPLETION_TOKENS),
    stream: false,
    provider: {
      requireParameters: true,
    },
  };
}

function buildOptionalReasoningParameters(model: string): Pick<OpenRouterSessionRequestBody, "reasoning"> {
  if (!supportsOpenRouterSessionReasoning(model)) {
    return {};
  }

  return {
    reasoning: {
      effort: OPENROUTER_SESSION_REASONING_EFFORT,
    },
  };
}

function buildOptionalSamplingParameters(model: string): Pick<OpenRouterSessionRequestBody, "temperature"> {
  if (!supportsOpenRouterTemperature(model)) {
    return {};
  }

  return {
    temperature: OPENROUTER_SESSION_TEMPERATURE,
  };
}

function supportsOpenRouterSessionReasoning(model: string) {
  return OPENROUTER_SESSION_REASONING_MODEL_PATTERN.test(model.trim());
}

function resolveTimeoutMs(timeoutMs: number | undefined) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return OPENROUTER_SESSION_TIMEOUT_MS;
  }

  return Math.round(timeoutMs);
}

function extractAssistantText(responseBody: ChatResult) {
  const choice = extractFirstChoice(responseBody);
  rejectTruncatedAssistantResponse(choice.finishReason);

  const content: unknown = choice.message.content;

  if (typeof content !== "string") {
    throw new SessionAiError("invalid_provider_response");
  }

  const assistantText = content.trim();

  if (!assistantText) {
    throw new SessionAiError("invalid_provider_response");
  }

  return assistantText;
}

function rejectTruncatedAssistantResponse(finishReason: string | null) {
  if (finishReason === "length") {
    throw new SessionAiError("invalid_provider_response");
  }
}

function buildProviderMetadata(responseBody: ChatResult, fallbackModel: string): SessionAiProviderMetadata {
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
    throw new SessionAiError("invalid_provider_response");
  }

  return choices[0];
}

function parseResponseModel(responseBody: ChatResult) {
  const model = responseBody.model.trim();

  return model.length > 0 ? model : undefined;
}

function parseFinishReason(responseBody: ChatResult): SessionAiFinishReason | undefined {
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

function parseUsage(responseBody: ChatResult): SessionAiTokenUsage | undefined {
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
