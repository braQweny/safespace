import type { APIRoute } from "astro";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { readCurrentAvatarChoice, type CurrentAvatarChoiceErrorCode } from "@/lib/session-flow/avatar-choice";
import { requireSessionRouteAccess, type SessionRouteAccessFailureCode } from "@/lib/session-flow/route-access";
import { toSessionView } from "@/lib/session-flow/session-state";
import { resolveSessionDurationSeconds } from "@/lib/session-flow/session-budget";
import { claimFreeTrialSession, readSessionQuota, readTrialAvailability } from "@/lib/session-data/quota";
import { transitionSessionLifecycle } from "@/lib/session-data/repository";
import type { SessionDataErrorCode } from "@/lib/session-data/errors";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext, getOperationalDurationMs } from "@/lib/operational-visibility/request-context";
import {
  buildSessionOpeningFailedEvent,
  buildSessionStartAttemptedEvent,
  type SessionStartReasonCode,
} from "@/lib/operational-visibility/session-events";
import { createSessionOpeningMessage } from "@/lib/session-flow/session-opening";
import type { SessionMessageViewModel } from "@/lib/session-flow/message-contract";
import {
  readSessionStartRequestBody,
  resolveAboutDifficultyForStart,
  resolveAboutPersonForStart,
} from "@/lib/session-flow/session-start-request";

export const prerender = false;

type StartFailureCode =
  | SessionDataErrorCode
  | "account_blocked"
  | "account_access_unavailable"
  | CurrentAvatarChoiceErrorCode
  | "trial_unavailable"
  | "session_quota_unavailable"
  | "validation_failed"
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

function failureResponse(context: Parameters<APIRoute>[0], code: StartFailureCode, status: number, redirectTo: string) {
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

  // Pierwsza rozmowa nie ma jeszcze kart ani mapy, więc `aboutPersonId` i
  // `aboutDifficultyId` mogą tu tylko przejść walidację (cudza albo
  // nieistniejąca karta → 400) — nigdzie nie trafiają.
  const startRequest = await readSessionStartRequestBody(context.request);
  const aboutPerson = startRequest.ok
    ? await resolveAboutPersonForStart(
        sessionContext.data,
        startRequest.aboutPersonId,
        avatarChoice.data.modality.avatarId,
      )
    : { ok: false as const, code: "validation_failed" as const };

  if (!aboutPerson.ok) {
    const status = aboutPerson.code === "validation_failed" ? 400 : 503;
    logStartAttempt("failure", status, startedAtMs, operationalContext);

    return failureResponse(context, aboutPerson.code, status, "/dashboard");
  }

  const aboutDifficulty = startRequest.ok
    ? await resolveAboutDifficultyForStart(
        sessionContext.data,
        startRequest.aboutDifficultyId,
        avatarChoice.data.modality.avatarId,
      )
    : { ok: false as const, code: "validation_failed" as const };

  if (!aboutDifficulty.ok) {
    const status = aboutDifficulty.code === "validation_failed" ? 400 : 503;
    logStartAttempt("failure", status, startedAtMs, operationalContext);

    return failureResponse(context, aboutDifficulty.code, status, "/dashboard");
  }

  // Pre-flight only: the insert trigger on therapy_sessions is the real gate,
  // this keeps the response honest without a round trip that is bound to fail.
  const quota = await readSessionQuota(sessionContext.data);

  if (!quota.ok) {
    logStartAttempt("failure", 503, startedAtMs, operationalContext);

    return failureResponse(context, "session_quota_unavailable", 503, "/dashboard/session?start=unavailable");
  }

  if (!quota.data.canStartSession) {
    logStartAttempt("blocked", 403, startedAtMs, operationalContext, "session_limit_reached");

    return failureResponse(context, "session_limit_reached", 403, SESSION_LIMIT_REDIRECT);
  }

  const availability = await readTrialAvailability(sessionContext.data);

  if (!availability.ok) {
    logStartAttempt("failure", 503, startedAtMs, operationalContext);

    return failureResponse(context, "trial_unavailable", 503, "/dashboard/session?start=unavailable");
  }

  if (!availability.data.isAvailable) {
    logStartAttempt("blocked", 409, startedAtMs, operationalContext);

    return failureResponse(context, "trial_already_claimed", 409, "/dashboard/session?trial=used");
  }

  // Pinned at start from the plan read above, so a grant or revoke mid-session
  // never stretches or cuts a conversation already under way.
  const durationSeconds = resolveSessionDurationSeconds(quota.data.plan);
  const startedAt = new Date();
  const expiresAt = addSeconds(startedAt, durationSeconds);
  const startedAtIso = startedAt.toISOString();
  const expiresAtIso = expiresAt.toISOString();
  const claim = await claimFreeTrialSession(sessionContext.data, {
    startedAt: startedAtIso,
    expiresAt: expiresAtIso,
    modalityId: avatarChoice.data.modality.modalityId,
    avatarId: avatarChoice.data.modality.avatarId,
    durationBucketSeconds: durationSeconds,
  });

  if (!claim.ok) {
    // Race-time outcome of the database gate: another request of the same
    // owner used the last free slot between the pre-flight and the claim.
    if (claim.error.code === "session_limit_reached") {
      logStartAttempt("blocked", 403, startedAtMs, operationalContext, "session_limit_reached");

      return failureResponse(context, "session_limit_reached", 403, SESSION_LIMIT_REDIRECT);
    }

    const status = claim.error.code === "trial_already_claimed" ? 409 : 500;
    logStartAttempt(status === 409 ? "blocked" : "failure", status, startedAtMs, operationalContext);

    return failureResponse(
      context,
      claim.error.code,
      status,
      status === 409 ? "/dashboard/session?trial=used" : "/dashboard/session?start=failed",
    );
  }

  const activeSession = await transitionSessionLifecycle(sessionContext.data, {
    sessionId: claim.data.session.id,
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

  // Generated and persisted before the response so the composer cannot race the
  // opening message; any failure here degrades to a session without an opening.
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
    return redirectResponse(context, "/dashboard/session?started=1");
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
