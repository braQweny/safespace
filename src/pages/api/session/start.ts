import type { APIRoute } from "astro";
import { resolveSessionDurationSeconds } from "@/lib/session-flow/session-budget";
import { claimFreeTrialSession, readTrialAvailability } from "@/lib/session-data/quota";
import type { SessionDataErrorCode } from "@/lib/session-data/errors";
import { readSessionStartRequestBody } from "@/lib/session-flow/session-start-request";
import {
  beginSessionStart,
  completeSessionStart,
  failSessionLimitReached,
  openSessionStartWindow,
  readSessionStartQuota,
  resolveSessionStartTopics,
  START_FAILED_REDIRECT,
  START_UNAVAILABLE_REDIRECT,
} from "@/lib/session-flow/session-start-route";

export const prerender = false;

type StartFailureCode = SessionDataErrorCode | "trial_unavailable";

const TRIAL_USED_REDIRECT = "/dashboard/session?trial=used";

export const POST: APIRoute = async (context) => {
  const start = await beginSessionStart<StartFailureCode>(context);

  if (!start.ok) {
    return start.response;
  }

  const scope = start.data;
  const { respond } = scope;

  // Pierwsza rozmowa nie ma jeszcze kart ani mapy, więc `aboutPersonId` i
  // `aboutDifficultyId` mogą tu tylko przejść walidację (cudza albo
  // nieistniejąca karta → 400) — nigdzie nie trafiają.
  const startRequest = await readSessionStartRequestBody(context.request);

  // Rozmowa głosowa nigdy nie jest próbą tekstową: start głosowy idzie
  // wyłącznie przez `start-next` (własne pule, bez `claim_free_trial_session`).
  if (!startRequest.ok || startRequest.mode === "voice") {
    return respond.fail("failure", "validation_failed", 400, "/dashboard");
  }

  const topics = await resolveSessionStartTopics(scope, startRequest);

  if (!topics.ok) {
    return topics.response;
  }

  const quota = await readSessionStartQuota(scope);

  if (!quota.ok) {
    return quota.response;
  }

  if (!quota.data.canStartSession) {
    return failSessionLimitReached(respond);
  }

  const availability = await readTrialAvailability(scope.sessionData);

  if (!availability.ok) {
    return respond.fail("failure", "trial_unavailable", 503, START_UNAVAILABLE_REDIRECT);
  }

  if (!availability.data.isAvailable) {
    return respond.fail("blocked", "trial_already_claimed", 409, TRIAL_USED_REDIRECT);
  }

  // Pinned at start from the plan read above, so a grant or revoke mid-session
  // never stretches or cuts a conversation already under way.
  const durationSeconds = resolveSessionDurationSeconds(quota.data.plan);
  const window = openSessionStartWindow(durationSeconds);
  const claim = await claimFreeTrialSession(scope.sessionData, {
    startedAt: window.startedAtIso,
    expiresAt: window.expiresAtIso,
    modalityId: scope.avatarChoice.modality.modalityId,
    avatarId: scope.avatarChoice.modality.avatarId,
    durationBucketSeconds: durationSeconds,
  });

  if (!claim.ok) {
    // Race-time outcome of the database gate: another request of the same
    // owner used the last free slot between the pre-flight and the claim.
    if (claim.error.code === "session_limit_reached") {
      return failSessionLimitReached(respond);
    }

    return claim.error.code === "trial_already_claimed"
      ? respond.fail("blocked", claim.error.code, 409, TRIAL_USED_REDIRECT)
      : respond.fail("failure", claim.error.code, 500, START_FAILED_REDIRECT);
  }

  return completeSessionStart(scope, {
    sessionId: claim.data.session.id,
    window,
    durationBucketSeconds: durationSeconds,
    withOpening: true,
    successRedirect: "/dashboard/session?started=1",
  });
};
