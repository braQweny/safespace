export const ADMIN_ERROR_CODES = {
  missing_auth: "missing_auth",
  not_admin: "not_admin",
  blocked_admin: "blocked_admin",
  account_blocked: "account_blocked",
  account_access_unavailable: "account_access_unavailable",
  admin_data_unavailable: "admin_data_unavailable",
  target_not_found: "target_not_found",
  invalid_filter: "invalid_filter",
  /** The admin tried to block/unblock or change the plan of their own account. */
  self_target_forbidden: "self_target_forbidden",
  write_failed: "write_failed",
} as const;

export type AdminErrorCode = keyof typeof ADMIN_ERROR_CODES;

export interface AdminError {
  code: AdminErrorCode;
}

export type AdminResult<T> = { ok: true; data: T } | { ok: false; error: AdminError };

export function adminOk<T>(data: T): AdminResult<T> {
  return { ok: true, data };
}

export function adminError(code: AdminErrorCode): AdminResult<never> {
  return { ok: false, error: { code } };
}

export function getStableAdminSupabaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }

  const code = error.code;
  return typeof code === "string" ? code : null;
}

export function mapAdminReadError(error: unknown): AdminErrorCode {
  const code = getStableAdminSupabaseErrorCode(error);

  if (code === "PGRST116") {
    return "target_not_found";
  }

  return "admin_data_unavailable";
}
