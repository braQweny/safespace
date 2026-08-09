import type { APIRoute } from "astro";
import { readCurrentAvatarChoice, type CurrentAvatarChoiceErrorCode } from "@/lib/session-flow/avatar-choice";
import { requireSessionRouteAccess, type SessionRouteAccessFailureCode } from "@/lib/session-flow/route-access";
import { FREE_TRIAL_DURATION_SECONDS, toSessionView } from "@/lib/session-flow/session-state";
import {
  createPendingSession,
  listNewestApprovedSessionSummaryContexts,
  transitionSessionLifecycle,
} from "@/lib/session-data/repository";
import type { SessionDataErrorCode } from "@/lib/session-data/errors";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext, getOperationalDurationMs } from "@/lib/operational-visibility/request-context";
import { buildSessionStartAttemptedEvent } from "@/lib/operational-visibility/session-events";

export const prerender = false;

type StartNextFailureCode =
  | SessionDataErrorCode
  | "account_blocked"
  | "account_access_unavailable"
  | CurrentAvatarChoiceErrorCode
  | "summary_context_unavailable"
  | "no_context_not_confirmed"
  | "session_start_failed";

function wantsJson(request: Request) {
  return request.headers.get("Accept")?.toLowerCase().includes("application/json") ?? false;
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status });
}

function redirectResponse(context: Parameters<APIRoute>[0], path: string) {
  return context.redirect(path, 303);
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

async function parseStartWithoutContext(request: Request) {
  try {
    const body: unknown = await request.json();

    return (
      body !== null && typeof body === "object" && "startWithoutContext" in body && body.startWithoutContext === true
    );
  } catch {
    return false;
  }
}

function logStartAttempt(
  outcome: "success" | "failure" | "blocked",
  status: number,
  startedAtMs: number,
  operationalContext: Awaited<ReturnType<typeof buildOperationalRequestContext>>,
) {
  logOperationalEvent(
    {
      ...buildSessionStartAttemptedEvent({
        outcome,
        reasonCode: outcome === "success" ? undefined : "session_start_failed",
        durationMs: getOperationalDurationMs(startedAtMs),
      }),
      status,
    },
    operationalContext,
  );
}

function failureResponse(
  context: Parameters<APIRoute>[0],
  code: StartNextFailureCode,
  status: number,
  redirectTo: string,
) {
  if (!wantsJson(context.request)) {
    return redirectResponse(context, redirectTo);
  }

  return jsonResponse(
    {
      ok: false,
      code,
      redirectTo,
    },
    status,
  );
}

function getAccountAccessRedirect(code: SessionRouteAccessFailureCode) {
  return code === "account_blocked" ? "/account/blocked" : "/account/blocked?state=unavailable";
}

export const POST: APIRoute = async (context) => {
  const startedAtMs = performance.now();
  const operationalContext = await buildOperationalRequestContext(context);
  const sessionContext = await requireSessionRouteAccess(context);

  if (!sessionContext.ok) {
    const { code, status, source } = sessionContext.error;
    const fromSessionContext = source === "session_context";
    logStartAttempt(fromSessionContext ? "failure" : "blocked", status, startedAtMs, operationalContext);

    return failureResponse(context, code, status, fromSessionContext ? "/auth/signin" : getAccountAccessRedirect(code));
  }

  const avatarChoice = await readCurrentAvatarChoice(sessionContext.data);

  if (!avatarChoice.ok) {
    const status = avatarChoice.error.code === "missing_avatar" ? 409 : 503;
    logStartAttempt("blocked", status, startedAtMs, operationalContext);

    return failureResponse(context, avatarChoice.error.code, status, "/dashboard/avatar");
  }

  // Read once: the body stream cannot be consumed twice, and the flag is now
  // needed both as the empty-context confirmation and as the session's own
  // start-time decision.
  const startWithoutContext = await parseStartWithoutContext(context.request);
  const approvedContext = await listNewestApprovedSessionSummaryContexts(sessionContext.data);

  if (!approvedContext.ok) {
    logStartAttempt("failure", 503, startedAtMs, operationalContext);

    return failureResponse(context, "summary_context_unavailable", 503, "/dashboard/session?start=unavailable");
  }

  if (approvedContext.data.length === 0 && !startWithoutContext) {
    logStartAttempt("blocked", 409, startedAtMs, operationalContext);

    return failureResponse(context, "no_context_not_confirmed", 409, "/dashboard/session?context=missing");
  }

  const startedAt = new Date();
  const expiresAt = addSeconds(startedAt, FREE_TRIAL_DURATION_SECONDS);
  const startedAtIso = startedAt.toISOString();
  const expiresAtIso = expiresAt.toISOString();
  const session = await createPendingSession(sessionContext.data, {
    startedAt: startedAtIso,
    expiresAt: expiresAtIso,
    modalityId: avatarChoice.data.modality.modalityId,
    avatarId: avatarChoice.data.modality.avatarId,
    isTrial: false,
    durationBucketSeconds: FREE_TRIAL_DURATION_SECONDS,
    // Pinned at start so a summary approved mid-conversation cannot add context
    // the user chose not to carry over.
    usesApprovedContext: !startWithoutContext,
  });

  if (!session.ok) {
    logStartAttempt("failure", 500, startedAtMs, operationalContext);

    return failureResponse(context, "session_start_failed", 500, "/dashboard/session?start=failed");
  }

  const activeSession = await transitionSessionLifecycle(sessionContext.data, {
    sessionId: session.data.id,
    nextStatus: "active",
    startedAt: startedAtIso,
    expiresAt: expiresAtIso,
    durationBucketSeconds: FREE_TRIAL_DURATION_SECONDS,
  });

  if (!activeSession.ok) {
    logStartAttempt("failure", 500, startedAtMs, operationalContext);

    return failureResponse(context, "session_start_failed", 500, "/dashboard/session?start=failed");
  }

  logStartAttempt("success", 201, startedAtMs, operationalContext);

  if (!wantsJson(context.request)) {
    return redirectResponse(context, "/dashboard/session?started=next");
  }

  return jsonResponse(
    {
      ok: true,
      session: toSessionView(activeSession.data, startedAt),
    },
    201,
  );
};
