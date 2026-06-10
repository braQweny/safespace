import type { SessionDataResult } from "./errors";
import { claimFreeTrialSessionAtomic, getTrialAvailability } from "./repository";
import type {
  ClaimFreeTrialSessionInput,
  ClaimFreeTrialSessionResult,
  SessionDataContext,
  TrialAvailability,
} from "./types";

export interface QuotaRepository {
  claimFreeTrialSessionAtomic: typeof claimFreeTrialSessionAtomic;
  getTrialAvailability: typeof getTrialAvailability;
}

const defaultQuotaRepository: QuotaRepository = {
  claimFreeTrialSessionAtomic,
  getTrialAvailability,
};

export function readTrialAvailability(
  context: SessionDataContext,
  repository: Pick<QuotaRepository, "getTrialAvailability"> = defaultQuotaRepository,
): Promise<SessionDataResult<TrialAvailability>> {
  return repository.getTrialAvailability(context);
}

export function claimFreeTrialSession(
  context: SessionDataContext,
  input: ClaimFreeTrialSessionInput = {},
  repository: Pick<QuotaRepository, "claimFreeTrialSessionAtomic"> = defaultQuotaRepository,
): Promise<SessionDataResult<ClaimFreeTrialSessionResult>> {
  // Session insert + trial claim run in one DB transaction; a duplicate claim
  // aborts both, so no orphaned session row needs cleanup.
  return repository.claimFreeTrialSessionAtomic(context, {
    modalityId: input.modalityId ?? null,
    avatarId: input.avatarId ?? null,
    startedAt: input.startedAt ?? null,
    expiresAt: input.expiresAt ?? null,
  });
}
