/** Owner-bound plan read. The account_access view evaluates paid expiry with
 * database time and keeps manual grants separate from paid entitlements. */
import { isRecord } from "@/lib/type-guards";
import { mapSupabaseReadError, ok, sessionDataError, type SessionDataResult } from "./errors";
import type { OwnedAccountPlan, SessionDataContext } from "./types";

const ACCOUNT_PLAN_SELECT = "user_id,premium_granted_at,effective_premium";

export function toOwnedAccountPlan(row: unknown): OwnedAccountPlan {
  const premiumGrantedAt = isRecord(row) && typeof row.premium_granted_at === "string" ? row.premium_granted_at : null;

  return {
    plan: (isRecord(row) && row.effective_premium === true) || premiumGrantedAt ? "premium" : "free",
    premiumGrantedAt,
  };
}

export async function getOwnedAccountPlan(context: SessionDataContext): Promise<SessionDataResult<OwnedAccountPlan>> {
  const { data, error } = await context.supabase
    .from("account_access")
    .select(ACCOUNT_PLAN_SELECT)
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  // A missing row (profile sync not yet run) is the default plan, not an error.
  return ok(toOwnedAccountPlan(data));
}
