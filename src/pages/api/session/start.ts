import type { APIRoute } from "astro";
import { readCurrentAvatarChoice, type CurrentAvatarChoiceErrorCode } from "@/lib/session-flow/avatar-choice";
import { FREE_TRIAL_DURATION_SECONDS, toSessionView } from "@/lib/session-flow/session-state";
import { getSessionDataContext } from "@/lib/session-data/auth";
import { claimFreeTrialSession, readTrialAvailability } from "@/lib/session-data/quota";
import { transitionSessionLifecycle } from "@/lib/session-data/repository";
import type { SessionDataErrorCode } from "@/lib/session-data/errors";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext, getOperationalDurationMs } from "@/lib/operational-visibility/request-context";
import { buildSessionStartAttemptedEvent } from "@/lib/operational-visibility/session-events";

type StartFailureCode =
  | SessionDataErrorCode
  | CurrentAvatarChoiceErrorCode
  | "trial_unavailable"
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

export const POST: APIRoute = async (context) => {
  const startedAtMs = performance.now();
  const operationalContext = await buildOperationalRequestContext(context);
  const sessionContext = getSessionDataContext(context);

  if (!sessionContext.ok) {
    const status = sessionContext.error.code === "missing_auth" ? 401 : 503;
    logStartAttempt("failure", status, startedAtMs, operationalContext);

    return failureResponse(context, sessionContext.error.code, status, "/auth/signin");
  }

  const avatarChoice = await readCurrentAvatarChoice(sessionContext.data);

  if (!avatarChoice.ok) {
    const status = avatarChoice.error.code === "missing_avatar" ? 409 : 503;
    logStartAttempt("blocked", status, startedAtMs, operationalContext);

    return failureResponse(context, avatarChoice.error.code, status, "/dashboard/avatar");
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

  const startedAt = new Date();
  const expiresAt = addSeconds(startedAt, FREE_TRIAL_DURATION_SECONDS);
  const startedAtIso = startedAt.toISOString();
  const expiresAtIso = expiresAt.toISOString();
  const claim = await claimFreeTrialSession(sessionContext.data, {
    startedAt: startedAtIso,
    expiresAt: expiresAtIso,
    modalityId: avatarChoice.data.modality.modalityId,
    avatarId: avatarChoice.data.modality.avatarId,
  });

  if (!claim.ok) {
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
    durationBucketSeconds: FREE_TRIAL_DURATION_SECONDS,
  });

  if (!activeSession.ok) {
    logStartAttempt("failure", 500, startedAtMs, operationalContext);

    return failureResponse(context, "session_start_failed", 500, "/dashboard/session?start=failed");
  }

  logStartAttempt("success", 201, startedAtMs, operationalContext);

  if (!wantsJson(context.request)) {
    return redirectResponse(context, "/dashboard/session?started=1");
  }

  return jsonResponse(
    {
      ok: true,
      session: toSessionView(activeSession.data, startedAt),
    },
    201,
  );
};
