import type { APIRoute } from "astro";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext, getOperationalDurationMs } from "@/lib/operational-visibility/request-context";
import {
  buildSessionCompletedEvent,
  buildSessionTimeLimitReachedEvent,
} from "@/lib/operational-visibility/session-events";
import { getOwnedSessionMetadata, transitionSessionLifecycle } from "@/lib/session-data/repository";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";
import {
  completeSessionExpired,
  completeSessionFailure,
  completeSessionSuccess,
  parseCompleteSessionRequest,
  type CompleteSessionFailureCode,
  type CompleteSessionResponse,
} from "@/lib/session-flow/session-completion-contract";
import { toSessionView } from "@/lib/session-flow/session-state";
import { expireOwnedSession, isSessionExpired } from "@/lib/session-flow/time-limit";

export const prerender = false;

function getFailureStatus(code: CompleteSessionFailureCode) {
  if (code === "validation_failed") {
    return 400;
  }

  if (code === "missing_auth") {
    return 401;
  }

  if (code === "account_blocked") {
    return 403;
  }

  if (code === "session_not_found") {
    return 404;
  }

  if (code === "session_not_active" || code === "session_expired") {
    return 409;
  }

  return 503;
}

function jsonResponse(body: CompleteSessionResponse) {
  const status = body.ok ? 200 : getFailureStatus(body.code);
  return Response.json(body, { status });
}

function mapCompletionWriteFailure(
  code: string,
): Exclude<CompleteSessionFailureCode, "session_expired" | "validation_failed"> {
  if (code === "session_not_found") {
    return "session_not_found";
  }

  if (code === "invalid_lifecycle_transition") {
    return "session_not_active";
  }

  return "session_complete_failed";
}

export const POST: APIRoute = async (context) => {
  const startedAtMs = performance.now();
  const operationalContext = await buildOperationalRequestContext(context);
  const sessionContext = await requireSessionRouteAccess(context);

  if (!sessionContext.ok) {
    return jsonResponse(completeSessionFailure(sessionContext.error.code));
  }

  const request = await parseCompleteSessionRequest(context.request);

  if (!request) {
    return jsonResponse(completeSessionFailure("validation_failed"));
  }

  const sessionResult = await getOwnedSessionMetadata(sessionContext.data, request.sessionId);

  if (!sessionResult.ok) {
    const code = sessionResult.error.code === "session_not_found" ? "session_not_found" : "session_data_unavailable";

    return jsonResponse(completeSessionFailure(code));
  }

  const session = sessionResult.data;
  const now = new Date();

  if (session.status === "completed") {
    return jsonResponse(completeSessionSuccess(toSessionView(session, now)));
  }

  if (session.status === "expired") {
    return jsonResponse(completeSessionExpired(toSessionView(session, now)));
  }

  if (session.status !== "active") {
    return jsonResponse(completeSessionFailure("session_not_active"));
  }

  if (isSessionExpired(session, now)) {
    const expired = await expireOwnedSession(sessionContext.data, session, now);

    logOperationalEvent(
      {
        ...buildSessionTimeLimitReachedEvent({
          durationMs: getOperationalDurationMs(startedAtMs),
        }),
        status: 409,
      },
      operationalContext,
    );

    return jsonResponse(
      expired.ok
        ? completeSessionExpired(expired.data.session)
        : completeSessionFailure(mapCompletionWriteFailure(expired.error.code)),
    );
  }

  const completed = await transitionSessionLifecycle(sessionContext.data, {
    sessionId: session.id,
    nextStatus: "completed",
    endedAt: now.toISOString(),
    durationBucketSeconds: session.durationBucketSeconds,
  });

  if (!completed.ok) {
    return jsonResponse(completeSessionFailure(mapCompletionWriteFailure(completed.error.code)));
  }

  logOperationalEvent(
    {
      ...buildSessionCompletedEvent({
        durationMs: getOperationalDurationMs(startedAtMs),
      }),
      status: 200,
    },
    operationalContext,
  );

  return jsonResponse(completeSessionSuccess(toSessionView(completed.data, now)));
};
