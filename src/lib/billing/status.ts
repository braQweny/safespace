import { readAccountAccessState } from "@/lib/admin/account-access";
import type { AdminRouteContext, AdminSupabaseClient } from "@/lib/admin/types";
import { createClient } from "@/lib/supabase";
import { isRecord } from "@/lib/type-guards";
import { isBillingEnabled } from "./config";
import type { BillingStatus, BillingStatusResult } from "./status-contract";

export type { BillingStatus, BillingStatusResult } from "./status-contract";

const BILLING_STATUS_SELECT =
  "user_id,status,paid_until,cancel_at_period_end,deletion_requested_at,has_customer,pending_checkout,paid_premium_active";
const SUBSCRIPTION_STATUSES = new Set([
  "none",
  "active",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "past_due",
  "paused",
  "trialing",
  "unpaid",
]);

export async function getOwnBillingStatus(
  context: AdminRouteContext,
  client?: AdminSupabaseClient | null,
): Promise<BillingStatusResult> {
  const user = context.locals.user;
  if (!user) return { ok: false, error: { code: "missing_auth" } };
  const supabase = client === undefined ? createClient(context.request.headers, context.cookies) : client;
  if (!supabase) return { ok: false, error: { code: "billing_unavailable" } };

  try {
    const [billing, access] = await Promise.all([
      supabase.from("billing_status").select(BILLING_STATUS_SELECT).eq("user_id", user.id).maybeSingle(),
      context.locals.accountAccess
        ? Promise.resolve({ ok: true as const, data: context.locals.accountAccess })
        : readAccountAccessState(context, supabase),
    ]);
    if (billing.error || !access.ok) return { ok: false, error: { code: "billing_unavailable" } };
    const row: unknown = billing.data;
    if (row !== null && !isValidBillingRow(row, user.id)) return { ok: false, error: { code: "billing_unavailable" } };
    const enabled = isBillingEnabled();
    const premiumActive = row?.paid_premium_active ?? false;
    const deletionPending = row?.deletion_requested_at != null;
    const status = row?.status === "none" ? null : (row?.status ?? null);
    const hasSubscription = status !== null && status !== "canceled" && status !== "incomplete_expired";
    const canResumeCheckout = row?.pending_checkout === true && status === "incomplete";
    const data: BillingStatus = {
      enabled,
      available: true,
      status,
      premiumActive,
      paidUntil: row?.paid_until ?? null,
      cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
      deletionPending,
      pendingCheckout: row?.pending_checkout ?? false,
      canManage: row?.has_customer ?? false,
      canPurchase:
        enabled &&
        access.data.status === "active" &&
        !deletionPending &&
        (!hasSubscription || canResumeCheckout) &&
        !premiumActive,
      manualPremium: access.data.premiumGrantedAt !== null,
      accountBlocked: access.data.status === "blocked",
    };
    return { ok: true, data };
  } catch {
    return { ok: false, error: { code: "billing_unavailable" } };
  }
}

interface BillingRow {
  user_id: string;
  status: string | null;
  paid_until: string | null;
  cancel_at_period_end: boolean;
  deletion_requested_at: string | null;
  has_customer: boolean;
  pending_checkout: boolean;
  paid_premium_active: boolean;
}

function isDateOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

function isValidBillingRow(value: unknown, userId: string): value is BillingRow {
  return (
    isRecord(value) &&
    value.user_id === userId &&
    (value.status === null || (typeof value.status === "string" && SUBSCRIPTION_STATUSES.has(value.status))) &&
    isDateOrNull(value.paid_until) &&
    isDateOrNull(value.deletion_requested_at) &&
    typeof value.cancel_at_period_end === "boolean" &&
    typeof value.has_customer === "boolean" &&
    typeof value.pending_checkout === "boolean" &&
    typeof value.paid_premium_active === "boolean"
  );
}
