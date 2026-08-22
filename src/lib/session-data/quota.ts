import type { SessionDataResult } from "./errors";
import {
  claimFreeTrialSessionAtomic,
  countOwnedSessions,
  getOwnedAccountPlan,
  getTrialAvailability,
} from "./repository";
import type {
  AccountPlan,
  ClaimFreeTrialSessionInput,
  ClaimFreeTrialSessionResult,
  SessionDataContext,
  SessionQuota,
  TrialAvailability,
} from "./types";

/**
 * How many sessions a free-plan account may own in total (every lifecycle
 * status, deleted tombstones included). The database trigger
 * `therapy_sessions_enforce_free_plan_limit` is the real gate and carries the
 * same number; `schema-drift.test.ts` keeps the two in sync. This constant
 * only drives the pre-flight check and the copy shown to the user.
 */
export const FREE_PLAN_SESSION_LIMIT = 3;

export interface QuotaRepository {
  claimFreeTrialSessionAtomic: typeof claimFreeTrialSessionAtomic;
  getTrialAvailability: typeof getTrialAvailability;
  getOwnedAccountPlan: typeof getOwnedAccountPlan;
  countOwnedSessions: typeof countOwnedSessions;
}

const defaultQuotaRepository: QuotaRepository = {
  claimFreeTrialSessionAtomic,
  getTrialAvailability,
  getOwnedAccountPlan,
  countOwnedSessions,
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

export function toSessionQuota(plan: AccountPlan, usedSessions: number): SessionQuota {
  const used = Math.max(0, Math.trunc(usedSessions));

  if (plan === "premium") {
    return {
      plan,
      sessionLimit: null,
      usedSessions: used,
      remainingSessions: null,
      canStartSession: true,
    };
  }

  const remainingSessions = Math.max(0, FREE_PLAN_SESSION_LIMIT - used);

  return {
    plan,
    sessionLimit: FREE_PLAN_SESSION_LIMIT,
    usedSessions: used,
    remainingSessions,
    canStartSession: remainingSessions > 0,
  };
}

/**
 * Pre-flight view of the owner's session allowance. Use it for the dashboard
 * state and to fail fast before a start; the insert trigger still decides.
 */
export async function readSessionQuota(
  context: SessionDataContext,
  repository: Pick<QuotaRepository, "getOwnedAccountPlan" | "countOwnedSessions"> = defaultQuotaRepository,
): Promise<SessionDataResult<SessionQuota>> {
  const plan = await repository.getOwnedAccountPlan(context);

  if (!plan.ok) {
    return plan;
  }

  // Premium accounts are not capped, so their count is informational only —
  // still read so the dashboard can show it, but never a reason to block.
  const usedSessions = await repository.countOwnedSessions(context);

  if (!usedSessions.ok) {
    return usedSessions;
  }

  return {
    ok: true,
    data: toSessionQuota(plan.data.plan, usedSessions.data),
  };
}
