export const SESSION_DATA_ERROR_CODES = {
  session_data_unavailable: "session_data_unavailable",
  missing_auth: "missing_auth",
  session_not_found: "session_not_found",
  not_session_owner: "not_session_owner",
  trial_already_claimed: "trial_already_claimed",
  session_limit_reached: "session_limit_reached",
  invalid_lifecycle_transition: "invalid_lifecycle_transition",
  sequence_conflict: "sequence_conflict",
  session_expired: "session_expired",
  message_in_progress: "message_in_progress",
  message_request_conflict: "message_request_conflict",
  duplicate_difficulty_label: "duplicate_difficulty_label",
  session_mode_mismatch: "session_mode_mismatch",
  voice_trial_already_used: "voice_trial_already_used",
  delete_failed: "delete_failed",
  write_failed: "write_failed",
  read_failed: "read_failed",
} as const;

/**
 * SQLSTATE raised by the `therapy_sessions_enforce_free_plan_limit` trigger
 * when a free-plan account already owns its full session allowance. Pinned to
 * the migration by `schema-drift.test.ts`.
 */
export const FREE_PLAN_SESSION_LIMIT_SQLSTATE = "P0005";

/**
 * SQLSTATE raised by `update_difficulty_card` when the new label already names
 * another difficulty of the same perspective (label or alias). Pinned to the
 * topic map migration by `schema-drift.test.ts`.
 */
export const DIFFICULTY_LABEL_TAKEN_SQLSTATE = "P0014";

/**
 * SQLSTATE raised by `append_voice_session_utterances` when the session is a
 * text conversation (and, in the app, by the text message route for a voice
 * session): the two modes never share a transcript. Pinned to the voice
 * migration by `schema-drift.test.ts`.
 */
export const SESSION_MODE_MISMATCH_SQLSTATE = "P0015";

/**
 * SQLSTATE raised by the free-plan limit trigger when a free account already
 * owns a voice conversation (any status, tombstones included): the voice trial
 * is one per account and deleting never restores it.
 */
export const VOICE_TRIAL_USED_SQLSTATE = "P0016";

export type SessionDataErrorCode = keyof typeof SESSION_DATA_ERROR_CODES;

export interface SessionDataError {
  code: SessionDataErrorCode;
}

export type SessionDataResult<T> = { ok: true; data: T } | { ok: false; error: SessionDataError };

export function ok<T>(data: T): SessionDataResult<T> {
  return { ok: true, data };
}

export function sessionDataError(code: SessionDataErrorCode): SessionDataResult<never> {
  return { ok: false, error: { code } };
}

export function getStableSupabaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }

  const code = error.code;
  return typeof code === "string" ? code : null;
}

export function mapSupabaseReadError(error: unknown): SessionDataErrorCode {
  const code = getStableSupabaseErrorCode(error);

  if (code === "PGRST116") {
    return "session_not_found";
  }

  return "read_failed";
}

interface WriteErrorMappingOptions {
  conflictCode?: SessionDataErrorCode;
}

export function mapSupabaseWriteError(error: unknown, options: WriteErrorMappingOptions = {}): SessionDataErrorCode {
  const code = getStableSupabaseErrorCode(error);

  if (code === "23505" && options.conflictCode) {
    return options.conflictCode;
  }

  if (code === "23503") {
    return "session_not_found";
  }

  if (code === "P0002") return "session_not_found";
  if (code === "P0004") return "invalid_lifecycle_transition";
  if (code === "P0007") return "session_expired";
  if (code === "P0008") return "message_in_progress";
  if (code === "P0009") return "message_request_conflict";

  // The free-plan cap is a database gate on every session insert (trial claim
  // and follow-up alike), so the write path has to recognise it regardless of
  // which helper performed the insert.
  if (code === FREE_PLAN_SESSION_LIMIT_SQLSTATE) {
    return "session_limit_reached";
  }

  if (code === DIFFICULTY_LABEL_TAKEN_SQLSTATE) {
    return "duplicate_difficulty_label";
  }

  if (code === SESSION_MODE_MISMATCH_SQLSTATE) {
    return "session_mode_mismatch";
  }

  if (code === VOICE_TRIAL_USED_SQLSTATE) {
    return "voice_trial_already_used";
  }

  return "write_failed";
}
