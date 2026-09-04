import { HTTPClient, OpenRouter, type Fetcher } from "@openrouter/sdk";
import type { ChatRequest, ChatResult } from "@openrouter/sdk/models";
import {
  BadRequestResponseError,
  OpenRouterError,
  RequestAbortedError,
  RequestTimeoutError,
  RequestTimeoutResponseError,
  ResponseValidationError,
  SDKValidationError,
  TooManyRequestsResponseError,
  UnprocessableEntityResponseError,
} from "@openrouter/sdk/models/errors";

export type OpenRouterNonStreamingChatRequest = ChatRequest & {
  stream?: false | undefined;
};

export type OpenRouterChatErrorCategory =
  | "missing_configuration"
  | "provider_timeout"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "invalid_provider_response";

export class OpenRouterChatError extends Error {
  readonly category: OpenRouterChatErrorCategory;

  constructor(category: OpenRouterChatErrorCategory) {
    super(category);
    this.name = "OpenRouterChatError";
    this.category = category;
  }
}

interface SendOpenRouterChatOptions {
  apiKey?: string;
  chatRequest: OpenRouterNonStreamingChatRequest;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

const OPENROUTER_NO_RETRY_OPTIONS = {
  strategy: "none",
} as const;

export async function sendOpenRouterChat({
  apiKey,
  chatRequest,
  fetcher,
  timeoutMs,
}: SendOpenRouterChatOptions): Promise<ChatResult> {
  const trimmedApiKey = apiKey?.trim();

  if (!trimmedApiKey) {
    throw new OpenRouterChatError("missing_configuration");
  }

  try {
    const openRouter = new OpenRouter({
      apiKey: trimmedApiKey,
      ...(fetcher ? { httpClient: new HTTPClient({ fetcher }) } : {}),
    });

    const result = await openRouter.chat.send(
      { chatRequest: { ...chatRequest, stream: false } },
      {
        ...(typeof timeoutMs === "number" ? { timeoutMs } : {}),
        retries: OPENROUTER_NO_RETRY_OPTIONS,
      },
    );

    return await requireNonStreamingResult(result);
  } catch (error) {
    throw mapOpenRouterChatError(error);
  }
}

// SDK overloads differ between releases; keep the runtime stream guard even
// when the installed overload types stream:false as ChatResult alone.
async function requireNonStreamingResult(result: ChatResult | { cancel: () => Promise<void> }): Promise<ChatResult> {
  if (!("choices" in result)) {
    await result.cancel().catch(() => undefined);
    throw new OpenRouterChatError("invalid_provider_response");
  }
  return result;
}

function mapOpenRouterChatError(error: unknown): OpenRouterChatError {
  if (error instanceof OpenRouterChatError) {
    return error;
  }

  if (
    error instanceof SDKValidationError ||
    error instanceof ResponseValidationError ||
    error instanceof BadRequestResponseError ||
    error instanceof UnprocessableEntityResponseError
  ) {
    return new OpenRouterChatError("invalid_provider_response");
  }

  if (
    error instanceof RequestAbortedError ||
    error instanceof RequestTimeoutError ||
    error instanceof RequestTimeoutResponseError
  ) {
    return new OpenRouterChatError("provider_timeout");
  }

  if (error instanceof TooManyRequestsResponseError) {
    return new OpenRouterChatError("provider_rate_limited");
  }

  if (error instanceof OpenRouterError) {
    return new OpenRouterChatError(mapOpenRouterStatus(error.statusCode));
  }

  return new OpenRouterChatError("provider_unavailable");
}

function mapOpenRouterStatus(status: number): OpenRouterChatErrorCategory {
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
