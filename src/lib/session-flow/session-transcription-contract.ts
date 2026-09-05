import type { SessionTranscriptionFormat, TranscribeSessionAudioInput } from "@/lib/session-transcription/types";
import type { SessionId } from "@/lib/session-data/types";
import { parseSessionIdParam } from "./session-id";

export const SESSION_TRANSCRIPTION_FORMAT = "webm" satisfies SessionTranscriptionFormat;
export const SESSION_TRANSCRIPTION_MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const SESSION_TRANSCRIPTION_MAX_RECORDING_MS = 60_000;

export type SessionTranscriptionFailureCode =
  | "missing_auth"
  | "account_blocked"
  | "account_access_unavailable"
  | "session_data_unavailable"
  | "session_not_found"
  | "session_not_active"
  | "session_expired"
  | "invalid_audio"
  | "audio_too_large"
  | "unsupported_format"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "invalid_provider_response";

// Język dyktowania ustala serwer z cookie żądania, więc klient go nie przysyła.
export type SessionTranscriptionRequest = Omit<TranscribeSessionAudioInput, "language"> & {
  sessionId: SessionId;
};

export interface SessionTranscriptionSuccessResponse {
  ok: true;
  type: "session_transcription";
  text: string;
}

export interface SessionTranscriptionFailureResponse {
  ok: false;
  type: "session_transcription_error";
  code: SessionTranscriptionFailureCode;
}

export type SessionTranscriptionResponse = SessionTranscriptionSuccessResponse | SessionTranscriptionFailureResponse;

export type SessionTranscriptionValidationResult =
  | { ok: true; data: SessionTranscriptionRequest }
  | {
      ok: false;
      code: "session_not_found" | "invalid_audio" | "audio_too_large" | "unsupported_format";
      status: 400 | 404 | 413;
    };

export async function parseSessionTranscriptionRequest(
  request: Request,
): Promise<SessionTranscriptionValidationResult> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return validationFailure("invalid_audio", 400);
  }

  if (!isRecord(body)) {
    return validationFailure("invalid_audio", 400);
  }

  const sessionId = parseSessionIdParam(typeof body.sessionId === "string" ? body.sessionId : undefined);

  if (!sessionId) {
    return validationFailure("session_not_found", 404);
  }

  if (body.format !== SESSION_TRANSCRIPTION_FORMAT) {
    return validationFailure("unsupported_format", 400);
  }

  if (typeof body.audioBase64 !== "string") {
    return validationFailure("invalid_audio", 400);
  }

  const audioBase64 = body.audioBase64.trim();
  const decodedBytes = getBase64DecodedByteLength(audioBase64);

  if (decodedBytes === null || decodedBytes <= 0) {
    return validationFailure("invalid_audio", 400);
  }

  if (decodedBytes > SESSION_TRANSCRIPTION_MAX_AUDIO_BYTES) {
    return validationFailure("audio_too_large", 413);
  }

  return {
    ok: true,
    data: {
      sessionId,
      audioBase64,
      format: SESSION_TRANSCRIPTION_FORMAT,
    },
  };
}

export function sessionTranscriptionFailure(
  code: SessionTranscriptionFailureCode,
): SessionTranscriptionFailureResponse {
  return {
    ok: false,
    type: "session_transcription_error",
    code,
  };
}

export function sessionTranscriptionSuccess(text: string): SessionTranscriptionSuccessResponse {
  return {
    ok: true,
    type: "session_transcription",
    text,
  };
}

export function isSessionTranscriptionSuccess(value: unknown): value is SessionTranscriptionSuccessResponse {
  return (
    isRecord(value) && value.ok === true && value.type === "session_transcription" && typeof value.text === "string"
  );
}

export function isSessionTranscriptionFailure(value: unknown): value is SessionTranscriptionFailureResponse {
  return (
    isRecord(value) &&
    value.ok === false &&
    value.type === "session_transcription_error" &&
    typeof value.code === "string"
  );
}

export function getBase64DecodedByteLength(value: string) {
  if (!value || value.startsWith("data:") || value.length % 4 !== 0) {
    return null;
  }

  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const unpaddedValue = padding > 0 ? value.slice(0, -padding) : value;

  if (unpaddedValue.includes("=") || !isBase64Alphabet(unpaddedValue)) {
    return null;
  }

  return Math.floor((value.length * 3) / 4) - padding;
}

function isBase64Alphabet(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);
    const isUppercaseLetter = charCode >= 65 && charCode <= 90;
    const isLowercaseLetter = charCode >= 97 && charCode <= 122;
    const isDigit = charCode >= 48 && charCode <= 57;
    const isBase64Symbol = charCode === 43 || charCode === 47;

    if (!isUppercaseLetter && !isLowercaseLetter && !isDigit && !isBase64Symbol) {
      return false;
    }
  }

  return true;
}

function validationFailure(
  code: "session_not_found" | "invalid_audio" | "audio_too_large" | "unsupported_format",
  status: 400 | 404 | 413,
): SessionTranscriptionValidationResult {
  return {
    ok: false,
    code,
    status,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
