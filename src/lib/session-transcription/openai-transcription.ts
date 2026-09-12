import { getAiProviderEnv } from "@/lib/ai-provider/env";
import { resolveOpenAiModel } from "@/lib/openai/model";
import { SessionTranscriptionError, type SessionTranscriptionErrorCategory } from "./errors";
import type { SessionTranscriptionResponse, TranscribeSessionAudioInput } from "./types";

interface OpenAiTranscriptionOptions {
  apiKey?: string;
  model?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export function buildOpenAiTranscriptionRequest(input: TranscribeSessionAudioInput, model: string) {
  const body = new FormData();
  const bytes = Uint8Array.from(atob(input.audioBase64), (character) => character.charCodeAt(0));
  body.set("file", new Blob([bytes], { type: "audio/webm" }), "recording.webm");
  body.set("model", resolveOpenAiModel(model));
  body.set("language", input.language);
  body.set("temperature", "0");
  body.set("response_format", "json");
  return body;
}

export async function transcribeSessionAudioWithOpenAi(
  input: TranscribeSessionAudioInput,
  options: OpenAiTranscriptionOptions = {},
): Promise<SessionTranscriptionResponse> {
  const env = getAiProviderEnv("openai");
  const key = (options.apiKey ?? env.apiKey)?.trim();
  if (!key || key.startsWith("sk-or-")) throw new SessionTranscriptionError("missing_configuration");
  let model: string;
  try {
    model = resolveOpenAiModel(options.model ?? env.transcriptionModel);
  } catch {
    throw new SessionTranscriptionError("missing_configuration");
  }
  const controller = new AbortController();
  const timeoutMs =
    options.timeoutMs && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? Math.round(options.timeoutMs)
      : 30_000;
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await (options.fetcher ?? globalThis.fetch)("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: buildOpenAiTranscriptionRequest(input, model),
      signal: controller.signal,
      // workerd does not support "error". Manual redirects fail the status
      // check below and never forward the key or recording to another URL.
      redirect: "manual",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new SessionTranscriptionError(mapStatus(response.status));
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new SessionTranscriptionError(controller.signal.aborted ? "provider_timeout" : "invalid_provider_response");
    }
    if (
      !payload ||
      typeof payload !== "object" ||
      "error" in payload ||
      !("text" in payload) ||
      typeof payload.text !== "string" ||
      !payload.text.trim()
    ) {
      throw new SessionTranscriptionError("invalid_provider_response");
    }
    return { text: payload.text.trim(), providerMetadata: { provider: "openai", model } };
  } catch (error) {
    if (error instanceof SessionTranscriptionError) throw error;
    throw new SessionTranscriptionError(controller.signal.aborted ? "provider_timeout" : "provider_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

function mapStatus(status: number): SessionTranscriptionErrorCategory {
  if (status === 408 || status === 504) return "provider_timeout";
  if (status === 429) return "provider_rate_limited";
  if (status === 400 || status === 422) return "invalid_provider_response";
  return "provider_unavailable";
}
