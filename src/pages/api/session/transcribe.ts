import type { APIRoute } from "astro";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext, getOperationalDurationMs } from "@/lib/operational-visibility/request-context";
import {
  buildSessionTranscriptionFailedEvent,
  type SessionProviderFailureReasonCode,
} from "@/lib/operational-visibility/session-events";
import { SessionTranscriptionError } from "@/lib/session-transcription/errors";
import { transcribeSessionAudio } from "@/lib/session-transcription/provider";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";
import { getOwnedSessionMetadata } from "@/lib/session-data/repository";
import { expireOwnedSession, isSessionExpired } from "@/lib/session-flow/time-limit";
import {
  parseSessionTranscriptionRequest,
  sessionTranscriptionFailure,
  sessionTranscriptionSuccess,
  type SessionTranscriptionFailureCode,
  type SessionTranscriptionResponse,
} from "@/lib/session-flow/session-transcription-contract";

export const prerender = false;

function jsonResponse(body: SessionTranscriptionResponse, status: number) {
  return Response.json(body, { status });
}

function getFailureStatus(code: SessionTranscriptionFailureCode) {
  if (code === "missing_auth") {
    return 401;
  }

  if (code === "account_blocked") {
    return 403;
  }

  if (code === "audio_too_large") {
    return 413;
  }

  if (code === "session_not_found") {
    return 404;
  }

  if (code === "session_not_active" || code === "session_expired") {
    return 409;
  }

  if (code === "invalid_audio" || code === "unsupported_format") {
    return 400;
  }

  if (code === "provider_rate_limited") {
    return 429;
  }

  if (code === "invalid_provider_response") {
    return 502;
  }

  return 503;
}

// Provider failures are the only thing worth an operational trace here; the
// audio itself is conversation content and never reaches a log.
function toProviderFailureReasonCode(error: unknown): SessionProviderFailureReasonCode {
  if (error instanceof SessionTranscriptionError) {
    return error.category;
  }

  return "provider_unavailable";
}

function toTranscriptionFailureCode(error: unknown): SessionTranscriptionFailureCode {
  if (!(error instanceof SessionTranscriptionError)) {
    return "provider_unavailable";
  }

  if (error.category === "provider_rate_limited" || error.category === "invalid_provider_response") {
    return error.category;
  }

  return "provider_unavailable";
}

export const POST: APIRoute = async (context) => {
  const startedAtMs = performance.now();
  const operationalContext = await buildOperationalRequestContext(context);
  const sessionContext = await requireSessionRouteAccess(context);

  if (!sessionContext.ok) {
    const code = sessionContext.error.code;
    return jsonResponse(sessionTranscriptionFailure(code), sessionContext.error.status);
  }

  const transcriptionRequest = await parseSessionTranscriptionRequest(context.request);

  if (!transcriptionRequest.ok) {
    return jsonResponse(sessionTranscriptionFailure(transcriptionRequest.code), transcriptionRequest.status);
  }

  const sessionResult = await getOwnedSessionMetadata(sessionContext.data, transcriptionRequest.data.sessionId);

  if (!sessionResult.ok) {
    const code = sessionResult.error.code === "session_not_found" ? "session_not_found" : "session_data_unavailable";
    return jsonResponse(sessionTranscriptionFailure(code), getFailureStatus(code));
  }

  const session = sessionResult.data;

  if (session.status !== "active") {
    const code = session.status === "expired" ? "session_expired" : "session_not_active";
    return jsonResponse(sessionTranscriptionFailure(code), getFailureStatus(code));
  }

  if (isSessionExpired(session)) {
    await expireOwnedSession(sessionContext.data, session);
    return jsonResponse(sessionTranscriptionFailure("session_expired"), 409);
  }

  try {
    const transcription = await transcribeSessionAudio({
      audioBase64: transcriptionRequest.data.audioBase64,
      format: transcriptionRequest.data.format,
      language: getRequestLocale(context.locals),
    });

    return jsonResponse(sessionTranscriptionSuccess(transcription.text), 200);
  } catch (error) {
    const code = toTranscriptionFailureCode(error);
    const status = getFailureStatus(code);

    logOperationalEvent(
      {
        ...buildSessionTranscriptionFailedEvent({
          provider: "openrouter",
          reasonCode: toProviderFailureReasonCode(error),
          durationMs: getOperationalDurationMs(startedAtMs),
        }),
        status,
      },
      operationalContext,
    );

    return jsonResponse(sessionTranscriptionFailure(code), status);
  }
};
