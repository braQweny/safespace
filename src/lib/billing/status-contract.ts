import { isRecord } from "@/lib/type-guards";

/** Owner-visible facts only: no Stripe identifiers, keys or checkout URLs. */
export interface BillingStatus {
  enabled: boolean;
  available: boolean;
  status: string | null;
  premiumActive: boolean;
  paidUntil: string | null;
  cancelAtPeriodEnd: boolean;
  deletionPending: boolean;
  pendingCheckout: boolean;
  canManage: boolean;
  canPurchase: boolean;
  manualPremium: boolean;
  accountBlocked: boolean;
}

export type BillingStatusResult =
  { ok: true; data: BillingStatus } | { ok: false; error: { code: "missing_auth" | "billing_unavailable" } };

export function parseBillingStatusResponse(value: unknown): BillingStatus | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) return null;
  const data = value.data;
  const booleans = [
    "enabled",
    "available",
    "premiumActive",
    "cancelAtPeriodEnd",
    "deletionPending",
    "pendingCheckout",
    "canManage",
    "canPurchase",
    "manualPremium",
    "accountBlocked",
  ];
  if (!booleans.every((key) => typeof data[key] === "boolean")) return null;
  if (data.status !== null && typeof data.status !== "string") return null;
  if (data.paidUntil !== null && (typeof data.paidUntil !== "string" || !Number.isFinite(Date.parse(data.paidUntil))))
    return null;
  return data as unknown as BillingStatus;
}
