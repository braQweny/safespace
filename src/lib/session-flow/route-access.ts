import { requireActiveAccountAccess } from "@/lib/admin/account-access";
import type { AdminErrorCode } from "@/lib/admin/errors";
import { getSessionDataContext, type SessionDataRouteContext } from "@/lib/session-data/auth";
import type { SessionDataContext } from "@/lib/session-data/types";

/**
 * Shared access gate for session API routes. Every route used to repeat the
 * same chain (session data context -> account access -> per-route error
 * mapping); this is the single place that owns that chain, so a new route
 * cannot accidentally skip the privacy boundary or diverge on status codes.
 */

export type SessionRouteAccessFailureCode =
  | "missing_auth"
  | "account_blocked"
  | "account_access_unavailable"
  | "session_data_unavailable";

export type SessionRouteAccessFailureSource = "session_context" | "account_access";

export interface SessionRouteAccessFailure {
  code: SessionRouteAccessFailureCode;
  status: 401 | 403 | 503;
  source: SessionRouteAccessFailureSource;
}

export type SessionRouteAccessResult =
  | { ok: true; data: SessionDataContext }
  | { ok: false; error: SessionRouteAccessFailure };

export function mapAccountAccessFailureCode(code: AdminErrorCode): SessionRouteAccessFailureCode {
  if (code === "missing_auth" || code === "account_blocked") {
    return code;
  }

  return "account_access_unavailable";
}

export function getSessionRouteAccessStatus(code: SessionRouteAccessFailureCode): 401 | 403 | 503 {
  if (code === "missing_auth") {
    return 401;
  }

  if (code === "account_blocked") {
    return 403;
  }

  return 503;
}

function accessFailure(
  code: SessionRouteAccessFailureCode,
  source: SessionRouteAccessFailureSource,
): SessionRouteAccessResult {
  return {
    ok: false,
    error: {
      code,
      status: getSessionRouteAccessStatus(code),
      source,
    },
  };
}

export interface SessionRouteAccessDependencies {
  getSessionDataContext: typeof getSessionDataContext;
  requireActiveAccountAccess: typeof requireActiveAccountAccess;
}

const defaultDependencies: SessionRouteAccessDependencies = {
  getSessionDataContext,
  requireActiveAccountAccess,
};

export async function requireSessionRouteAccess(
  context: SessionDataRouteContext,
  dependencies: SessionRouteAccessDependencies = defaultDependencies,
): Promise<SessionRouteAccessResult> {
  const sessionContext = dependencies.getSessionDataContext(context);

  if (!sessionContext.ok) {
    return accessFailure(
      sessionContext.error.code === "missing_auth" ? "missing_auth" : "session_data_unavailable",
      "session_context",
    );
  }

  const accountAccess = await dependencies.requireActiveAccountAccess(context, sessionContext.data.supabase);

  if (!accountAccess.ok) {
    return accessFailure(mapAccountAccessFailureCode(accountAccess.error.code), "account_access");
  }

  return {
    ok: true,
    data: sessionContext.data,
  };
}
