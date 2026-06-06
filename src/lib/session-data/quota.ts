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

export interface QuotaRepository {
  createPendingSession: typeof createPendingSession;
  createSessionTrialClaim: typeof createSessionTrialClaim;
  getOwnedSessionMetadata: typeof getOwnedSessionMetadata;
  getTrialAvailability: typeof getTrialAvailability;
  updateSessionTombstone: typeof updateSessionTombstone;
}

const defaultQuotaRepository: QuotaRepository = {
  createPendingSession,
  createSessionTrialClaim,
  getOwnedSessionMetadata,
  getTrialAvailability,
  updateSessionTombstone,
};

export function readTrialAvailability(
  context: SessionDataContext,
  repository: Pick<QuotaRepository, "getTrialAvailability"> = defaultQuotaRepository,
): Promise<SessionDataResult<TrialAvailability>> {
  return repository.getTrialAvailability(context);
}

export async function claimFreeTrialSession(
  context: SessionDataContext,
  input: ClaimFreeTrialSessionInput = {},
  repository: QuotaRepository = defaultQuotaRepository,
): Promise<SessionDataResult<ClaimFreeTrialSessionResult>> {
  const session = await repository.createPendingSession(context, {
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

  const trialClaim = await repository.createSessionTrialClaim(context, session.data.id);

  if (!trialClaim.ok) {
    await repository.updateSessionTombstone(context, {
      sessionId: session.data.id,
      deletionReasonCode: "system_cleanup",
      durationBucketSeconds: TRIAL_DURATION_BUCKET_SECONDS,
    });

    if (trialClaim.error.code === "trial_already_claimed") {
      return sessionDataError("trial_already_claimed");
    }

    return sessionDataError("write_failed");
  }

  const claimedSession = await repository.getOwnedSessionMetadata(context, session.data.id);

  return {
    ok: true,
    data: {
      session: claimedSession.ok ? claimedSession.data : session.data,
      trialClaim: trialClaim.data,
    },
  };
}
