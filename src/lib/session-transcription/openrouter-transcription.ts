import { SessionTranscriptionError, type SessionTranscriptionErrorCategory } from "./errors";
import { getOpenRouterTranscriptionConfig, resolveTranscriptionModel } from "./env";
import type { SessionTranscriptionResponse, TranscribeSessionAudioInput } from "./types";

const OPENROUTER_TRANSCRIPTION_ENDPOINT = "https://openrouter.ai/api/v1/audio/transcriptions";
const OPENROUTER_TRANSCRIPTION_TIMEOUT_MS = 30_000;
const OPENROUTER_TRANSCRIPTION_TEMPERATURE = 0;
const OPENROUTER_TRANSCRIPTION_LANGUAGE = "pl";

type OpenRouterTranscriptionFetcher = typeof fetch;

export interface OpenRouterTranscriptionOptions {
  apiKey?: string;
  model?: string;
  fetcher?: OpenRouterTranscriptionFetcher;
  timeoutMs?: number;
}

interface OpenRouterTranscriptionRequestBody {
  model: string;
  input_audio: {
    data: string;
    format: "webm";
  };
  language: "pl";
  temperature: 0;
}

export { resolveTranscriptionModel } from "./env";

export async function transcribeSessionAudioWithOpenRouter(
  input: TranscribeSessionAudioInput,
  options: OpenRouterTranscriptionOptions = {},
): Promise<SessionTranscriptionResponse> {
  const config = getOpenRouterTranscriptionConfig();
  const apiKey = options.apiKey ?? config.apiKey;
  const trimmedApiKey = apiKey?.trim();
  const model = resolveTranscriptionModel(options.model ?? config.model);

  if (!trimmedApiKey) {
    throw new SessionTranscriptionError("missing_configuration");
  }

  const responseBody = await sendOpenRouterTranscription({
    apiKey: trimmedApiKey,
    requestBody: buildOpenRouterTranscriptionRequest(input, model),
    fetcher: options.fetcher,
    timeoutMs: resolveTimeoutMs(options.timeoutMs),
  });

  return {
    text: extractTranscriptionText(responseBody),
    providerMetadata: {
      provider: "openrouter",
      model: parseResponseModel(responseBody) ?? model,
    },
  };
}

export function buildOpenRouterTranscriptionRequest(
  input: TranscribeSessionAudioInput,
  model: string,
): OpenRouterTranscriptionRequestBody {
  return {
    model,
    input_audio: {
      data: input.audioBase64,
      format: input.format,
    },
    language: OPENROUTER_TRANSCRIPTION_LANGUAGE,
    temperature: OPENROUTER_TRANSCRIPTION_TEMPERATURE,
  };
}

async function sendOpenRouterTranscription({
  apiKey,
  requestBody,
  fetcher = globalThis.fetch.bind(globalThis),
  timeoutMs,
}: {
  apiKey: string;
  requestBody: OpenRouterTranscriptionRequestBody;
  fetcher?: OpenRouterTranscriptionFetcher;
  timeoutMs: number;
}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetcher(OPENROUTER_TRANSCRIPTION_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new SessionTranscriptionError(mapOpenRouterStatus(response.status));
    }

    try {
      return (await response.json()) as OpenRouterTranscriptionResponseBody;
    } catch {
      throw new SessionTranscriptionError("invalid_provider_response");
    }
  } catch (error) {
    if (error instanceof SessionTranscriptionError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new SessionTranscriptionError("provider_timeout");
    }

    throw new SessionTranscriptionError("provider_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

function resolveTimeoutMs(timeoutMs: number | undefined) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return OPENROUTER_TRANSCRIPTION_TIMEOUT_MS;
  }

  return Math.round(timeoutMs);
}

function extractTranscriptionText(responseBody: unknown) {
  if (!isRecord(responseBody)) {
    throw new SessionTranscriptionError("invalid_provider_response");
  }

  if (typeof responseBody.text !== "string") {
    throw new SessionTranscriptionError("invalid_provider_response");
  }

  const text = responseBody.text.trim();

  if (!text) {
    throw new SessionTranscriptionError("invalid_provider_response");
  }

  return text;
}

function parseResponseModel(responseBody: unknown) {
  if (!isRecord(responseBody)) {
    return undefined;
  }

  if (typeof responseBody.model !== "string") {
    return undefined;
  }

  const model = responseBody.model.trim();
  return model.length > 0 ? model : undefined;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function mapOpenRouterStatus(status: number): SessionTranscriptionErrorCategory {
  if (status === 408 || status === 504) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
