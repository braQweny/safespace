import type { APIRoute } from "astro";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { readCurrentAvatarChoice, type CurrentAvatarChoiceErrorCode } from "@/lib/session-flow/avatar-choice";
import { requireSessionRouteAccess, type SessionRouteAccessFailureCode } from "@/lib/session-flow/route-access";
import { toSessionView } from "@/lib/session-flow/session-state";
import { resolveSessionDurationSeconds } from "@/lib/session-flow/session-budget";
import { readSessionQuota } from "@/lib/session-data/quota";
import { createPendingSession, transitionSessionLifecycle } from "@/lib/session-data/repository";
import type { SessionDataErrorCode } from "@/lib/session-data/errors";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext, getOperationalDurationMs } from "@/lib/operational-visibility/request-context";
import {
  buildSessionOpeningFailedEvent,
  buildSessionAiProviderFailedEvent,
  buildSessionStartAttemptedEvent,
  type SessionStartReasonCode,
} from "@/lib/operational-visibility/session-events";
import { createSessionOpeningMessage } from "@/lib/session-flow/session-opening";
import type { SessionMessageViewModel } from "@/lib/session-flow/message-contract";
import { prepareOwnedAvatarMemory } from "@/lib/session-flow/avatar-memory";

export const prerender = false;

type StartNextFailureCode =
  | SessionDataErrorCode
  | "account_blocked"
  | "account_access_unavailable"
  | CurrentAvatarChoiceErrorCode
  | "summary_context_unavailable"
  | "session_quota_unavailable"
  | "no_context_not_confirmed"
  | "session_start_failed";

const SESSION_LIMIT_REDIRECT = "/dashboard?start=limit_reached";

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

function logStartAttempt(
  outcome: "success" | "failure" | "blocked",
  status: number,
  startedAtMs: number,
  operationalContext: Awaited<ReturnType<typeof buildOperationalRequestContext>>,
  reasonCode: SessionStartReasonCode = "session_start_failed",
) {
  logOperationalEvent(
    {
      ...buildSessionStartAttemptedEvent({
        outcome,
        reasonCode: outcome === "success" ? undefined : reasonCode,
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

  // Pre-flight only: the insert trigger on therapy_sessions is the real gate.
  // Follow-ups count against the same allowance as the first session — a free
  // account gets FREE_PLAN_SESSION_LIMIT sessions in total, not per route.
  const quota = await readSessionQuota(sessionContext.data);

  if (!quota.ok) {
    logStartAttempt("failure", 503, startedAtMs, operationalContext);

    return failureResponse(context, "session_quota_unavailable", 503, "/dashboard/session?start=unavailable");
  }

  if (!quota.data.canStartSession) {
    logStartAttempt("blocked", 403, startedAtMs, operationalContext, "session_limit_reached");

    return failureResponse(context, "session_limit_reached", 403, SESSION_LIMIT_REDIRECT);
  }

  const memory = await prepareOwnedAvatarMemory(sessionContext.data, avatarChoice.data.modality, {
    locale: getRequestLocale(context.locals),
  });

  if (!memory.ok) {
    if (memory.providerFailure) {
      logOperationalEvent(
        buildSessionAiProviderFailedEvent({ reasonCode: memory.providerFailure, provider: "openrouter" }),
        operationalContext,
      );
    }
    logStartAttempt("failure", 503, startedAtMs, operationalContext);

    return failureResponse(context, "summary_context_unavailable", 503, "/dashboard/session?start=unavailable");
  }

  if (!memory.ready) {
    return jsonResponse({ ok: true, type: "avatar_memory_preparing" }, 202);
  }

  // Pinned at start from the plan read above, so a grant or revoke mid-session
  // never stretches or cuts a conversation already under way.
  const durationSeconds = resolveSessionDurationSeconds(quota.data.plan);
  const startedAt = new Date();
  const expiresAt = addSeconds(startedAt, durationSeconds);
  const startedAtIso = startedAt.toISOString();
  const expiresAtIso = expiresAt.toISOString();
  const session = await createPendingSession(sessionContext.data, {
    startedAt: startedAtIso,
    expiresAt: expiresAtIso,
    modalityId: avatarChoice.data.modality.modalityId,
    avatarId: avatarChoice.data.modality.avatarId,
    isTrial: false,
    durationBucketSeconds: durationSeconds,
    usesApprovedContext: true,
    usesAvatarMemory: true,
  });

  if (!session.ok) {
    // Race-time outcome of the database gate: the last free slot went to a
    // concurrent start of the same owner after the pre-flight above.
    if (session.error.code === "session_limit_reached") {
      logStartAttempt("blocked", 403, startedAtMs, operationalContext, "session_limit_reached");

      return failureResponse(context, "session_limit_reached", 403, SESSION_LIMIT_REDIRECT);
    }

    logStartAttempt("failure", 500, startedAtMs, operationalContext);

    return failureResponse(context, "session_start_failed", 500, "/dashboard/session?start=failed");
  }

  const activeSession = await transitionSessionLifecycle(sessionContext.data, {
    sessionId: session.data.id,
    nextStatus: "active",
    startedAt: startedAtIso,
    expiresAt: expiresAtIso,
    durationBucketSeconds: durationSeconds,
  });

  if (!activeSession.ok) {
    logStartAttempt("failure", 500, startedAtMs, operationalContext);

    return failureResponse(context, "session_start_failed", 500, "/dashboard/session?start=failed");
  }

  logStartAttempt("success", 201, startedAtMs, operationalContext);

  // Otwarcie czyta tę samą prywatną kopię pamięci co wszystkie późniejsze odpowiedzi.
  const opening = await createSessionOpeningMessage(sessionContext.data, activeSession.data, {
    locale: getRequestLocale(context.locals),
  });

  if (!opening.ok) {
    logOperationalEvent(
      buildSessionOpeningFailedEvent({
        reasonCode: opening.failure,
        durationMs: getOperationalDurationMs(startedAtMs),
      }),
      operationalContext,
    );
  }

  const openingMessage: SessionMessageViewModel | undefined =
    opening.ok && opening.message ? opening.message : undefined;

  if (!wantsJson(context.request)) {
    return redirectResponse(context, "/dashboard/session?started=next");
  }

  return jsonResponse(
    {
      ok: true,
      session: toSessionView(activeSession.data, startedAt),
      ...(openingMessage ? { openingMessage } : {}),
    },
    201,
  );
};
