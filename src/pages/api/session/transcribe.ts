import type { APIRoute } from "astro";
import { SessionTranscriptionError } from "@/lib/session-transcription/errors";
import { transcribeSessionAudio } from "@/lib/session-transcription/provider";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";
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
  const sessionContext = await requireSessionRouteAccess(context);

  if (!sessionContext.ok) {
    const code = sessionContext.error.code;
    return jsonResponse(sessionTranscriptionFailure(code), sessionContext.error.status);
  }

  const transcriptionRequest = await parseSessionTranscriptionRequest(context.request);

  if (!transcriptionRequest.ok) {
    return jsonResponse(sessionTranscriptionFailure(transcriptionRequest.code), transcriptionRequest.status);
  }

  try {
    const transcription = await transcribeSessionAudio(transcriptionRequest.data);

    return jsonResponse(sessionTranscriptionSuccess(transcription.text), 200);
  } catch (error) {
    const code = toTranscriptionFailureCode(error);

    return jsonResponse(sessionTranscriptionFailure(code), getFailureStatus(code));
  }
};
