import { sessionDataError, type SessionDataResult } from "./errors";
import {
  createPendingSession,
  createSessionTrialClaim,
  getOwnedSessionMetadata,
  getTrialAvailability,
  updateSessionTombstone,
} from "./repository";
import type {
  ClaimFreeTrialSessionInput,
  ClaimFreeTrialSessionResult,
  SessionDataContext,
  TrialAvailability,
} from "./types";

const TRIAL_DURATION_BUCKET_SECONDS = 900;

export function readTrialAvailability(context: SessionDataContext): Promise<SessionDataResult<TrialAvailability>> {
  return getTrialAvailability(context);
}

export async function claimFreeTrialSession(
  context: SessionDataContext,
  input: ClaimFreeTrialSessionInput = {},
): Promise<SessionDataResult<ClaimFreeTrialSessionResult>> {
  const session = await createPendingSession(context, {
    modalityId: input.modalityId ?? null,
    avatarId: input.avatarId ?? null,
    isTrial: true,
    startedAt: input.startedAt ?? null,
    expiresAt: input.expiresAt ?? null,
    durationBucketSeconds: TRIAL_DURATION_BUCKET_SECONDS,
  });

  if (!session.ok) {
    return session;
  }

  const trialClaim = await createSessionTrialClaim(context, session.data.id);

  if (!trialClaim.ok) {
    await updateSessionTombstone(context, {
      sessionId: session.data.id,
      deletionReasonCode: "system_cleanup",
      durationBucketSeconds: TRIAL_DURATION_BUCKET_SECONDS,
    });

    if (trialClaim.error.code === "trial_already_claimed") {
      return sessionDataError("trial_already_claimed");
    }

    return sessionDataError("write_failed");
  }

  const claimedSession = await getOwnedSessionMetadata(context, session.data.id);

  return {
    ok: true,
    data: {
      session: claimedSession.ok ? claimedSession.data : session.data,
      trialClaim: trialClaim.data,
    },
  };
}
