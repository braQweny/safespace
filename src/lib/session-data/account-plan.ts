/**
 * Owner-bound read of the account plan. The plan marker lives on the safe,
 * content-free `admin_user_profiles` row (RLS lets a user read their own row);
 * only the premium timestamp is selected here. Import from `./repository`
 * outside this directory.
 */
import { isRecord } from "@/lib/type-guards";
import { mapSupabaseReadError, ok, sessionDataError, type SessionDataResult } from "./errors";
import type { OwnedAccountPlan, SessionDataContext } from "./types";

const ACCOUNT_PLAN_SELECT = "user_id,premium_granted_at";

export function toOwnedAccountPlan(row: unknown): OwnedAccountPlan {
  const premiumGrantedAt = isRecord(row) && typeof row.premium_granted_at === "string" ? row.premium_granted_at : null;

  return {
    plan: premiumGrantedAt ? "premium" : "free",
    premiumGrantedAt,
  };
}

export async function getOwnedAccountPlan(context: SessionDataContext): Promise<SessionDataResult<OwnedAccountPlan>> {
  const { data, error } = await context.supabase
    .from("admin_user_profiles")
    .select(ACCOUNT_PLAN_SELECT)
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  // A missing row (profile sync not yet run) is the default plan, not an error.
  return ok(toOwnedAccountPlan(data));
}
