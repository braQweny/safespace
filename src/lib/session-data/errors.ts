export const SESSION_DATA_ERROR_CODES = {
  session_data_unavailable: "session_data_unavailable",
  missing_auth: "missing_auth",
  session_not_found: "session_not_found",
  not_session_owner: "not_session_owner",
  trial_already_claimed: "trial_already_claimed",
  session_limit_reached: "session_limit_reached",
  invalid_lifecycle_transition: "invalid_lifecycle_transition",
  sequence_conflict: "sequence_conflict",
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

  // The free-plan cap is a database gate on every session insert (trial claim
  // and follow-up alike), so the write path has to recognise it regardless of
  // which helper performed the insert.
  if (code === FREE_PLAN_SESSION_LIMIT_SQLSTATE) {
    return "session_limit_reached";
  }

  return "write_failed";
}
