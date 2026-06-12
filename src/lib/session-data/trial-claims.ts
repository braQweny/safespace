/**
 * Owner-bound repository helpers for `session_trial_claims`. The free-trial
 * claim itself must go through `claimFreeTrialSession()` in `quota.ts`.
 * Import from `./repository` outside this directory.
 */
import { mapSupabaseReadError, mapSupabaseWriteError, ok, sessionDataError, type SessionDataResult } from "./errors";
import { TRIAL_CLAIM_SELECT, coerceSessionRow, coerceTrialClaimRow, isRecord, mapSession, mapTrialClaim } from "./rows";
import type {
  ClaimFreeTrialSessionInput,
  ClaimFreeTrialSessionResult,
  SessionDataContext,
  SessionId,
  SessionTrialClaimState,
  TrialAvailability,
} from "./types";

export async function getTrialAvailability(context: SessionDataContext): Promise<SessionDataResult<TrialAvailability>> {
  const { data, error } = await context.supabase
    .from("session_trial_claims")
    .select(TRIAL_CLAIM_SELECT)
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  const row = coerceTrialClaimRow(data);

  return ok({
    isAvailable: !row,
    existingClaim: row ? mapTrialClaim(row) : null,
  });
}

export async function claimFreeTrialSessionAtomic(
  context: SessionDataContext,
  input: ClaimFreeTrialSessionInput,
): Promise<SessionDataResult<ClaimFreeTrialSessionResult>> {
  const response = (await context.supabase.rpc("claim_free_trial_session", {
    p_modality_id: input.modalityId ?? null,
    p_avatar_id: input.avatarId ?? null,
    p_started_at: input.startedAt ?? null,
    p_expires_at: input.expiresAt ?? null,
  })) as { data: unknown; error: unknown };
  const { data, error } = response;

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error, { conflictCode: "trial_already_claimed" }));
  }

  const payload = isRecord(data) ? (data as { session?: unknown; trial_claim?: unknown }) : null;
  const sessionRow = payload ? coerceSessionRow(payload.session) : null;
  const claimRow = payload ? coerceTrialClaimRow(payload.trial_claim) : null;

  if (!sessionRow || !claimRow) {
    return sessionDataError("write_failed");
  }

  return ok({
    session: mapSession(sessionRow),
    trialClaim: mapTrialClaim(claimRow),
  });
}

export async function createSessionTrialClaim(
  context: SessionDataContext,
  sessionId: SessionId,
): Promise<SessionDataResult<SessionTrialClaimState>> {
  const { data, error } = await context.supabase
    .from("session_trial_claims")
    .insert({
      session_id: sessionId,
      user_id: context.user.id,
    })
    .select(TRIAL_CLAIM_SELECT)
    .single();

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error, { conflictCode: "trial_already_claimed" }));
  }

  const row = coerceTrialClaimRow(data);
  return row ? ok(mapTrialClaim(row)) : sessionDataError("write_failed");
}
