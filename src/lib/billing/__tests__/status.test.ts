import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminRouteContext, AdminSupabaseClient } from "@/lib/admin/types";

const { createClient, readAccountAccessState, isBillingEnabled } = vi.hoisted(() => ({
  createClient: vi.fn(),
  readAccountAccessState: vi.fn(),
  isBillingEnabled: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ createClient }));
vi.mock("@/lib/admin/account-access", () => ({ readAccountAccessState }));
vi.mock("../config", () => ({ isBillingEnabled }));
const { getOwnBillingStatus } = await import("../status");

const active = { userId: "owner", status: "active", premiumGrantedAt: null };
const context = {
  request: new Request("https://safespace.test/account/billing"),
  cookies: {},
  locals: { user: { id: "owner" } },
} as AdminRouteContext;
const baseRow = {
  user_id: "owner",
  status: "active",
  paid_until: "2026-10-01T12:00:00Z",
  cancel_at_period_end: false,
  deletion_requested_at: null,
  has_customer: true,
  pending_checkout: false,
  paid_premium_active: true,
};

function mockClient(row: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as AdminSupabaseClient, from, select, eq };
}

beforeEach(() => {
  vi.clearAllMocks();
  isBillingEnabled.mockReturnValue(true);
  readAccountAccessState.mockResolvedValue({ ok: true, data: active });
});

describe("owner billing status", () => {
  it("queries only the owner RLS view and exposes no Stripe identifiers", async () => {
    const client = mockClient({ ...baseRow, stripe_customer_id: "cus_private" });
    const result = await getOwnBillingStatus(context, client.client);
    expect(client.from).toHaveBeenCalledWith("billing_status");
    expect(client.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(client.select.mock.calls[0]).not.toContain("stripe_customer_id");
    expect(result).toMatchObject({ ok: true, data: { premiumActive: true, canPurchase: false, canManage: true } });
    expect(JSON.stringify(result)).not.toContain("cus_private");
  });

  it("uses database time for expiry even when the timestamp looks future to the app", async () => {
    const client = mockClient({
      ...baseRow,
      status: "past_due",
      paid_until: "2099-01-01T00:00:00Z",
      paid_premium_active: false,
    });
    const result = await getOwnBillingStatus(context, client.client);
    expect(result).toMatchObject({ ok: true, data: { premiumActive: false, canPurchase: false, canManage: true } });
  });

  it("keeps manual premium separate from expired paid access", async () => {
    readAccountAccessState.mockResolvedValue({
      ok: true,
      data: { ...active, premiumGrantedAt: "2026-09-01T00:00:00Z" },
    });
    const result = await getOwnBillingStatus(context, mockClient({ ...baseRow, paid_premium_active: false }).client);
    expect(result).toMatchObject({ ok: true, data: { manualPremium: true, premiumActive: false } });
  });

  it("allows a blocked owner to manage without offering a purchase", async () => {
    readAccountAccessState.mockResolvedValue({ ok: true, data: { ...active, status: "blocked" } });
    const result = await getOwnBillingStatus(
      context,
      mockClient({ ...baseRow, status: "canceled", paid_premium_active: false }).client,
    );
    expect(result).toMatchObject({ ok: true, data: { accountBlocked: true, canManage: true, canPurchase: false } });
  });

  it("prevents new purchases during deletion, including without any subscription", async () => {
    const result = await getOwnBillingStatus(
      context,
      mockClient({
        ...baseRow,
        status: "none",
        paid_premium_active: false,
        deletion_requested_at: "2026-09-01T00:00:00Z",
      }).client,
    );
    expect(result).toMatchObject({ ok: true, data: { deletionPending: true, canPurchase: false } });
  });

  it("keeps the management destination discoverable when payments are disabled", async () => {
    isBillingEnabled.mockReturnValue(false);
    const result = await getOwnBillingStatus(context, mockClient(baseRow).client);
    expect(result).toMatchObject({ ok: true, data: { enabled: false, canManage: true, canPurchase: false } });
  });

  it("offers checkout to an active owner without a billing row", async () => {
    const result = await getOwnBillingStatus(context, mockClient(null).client);
    expect(result).toMatchObject({
      ok: true,
      data: { premiumActive: false, status: null, canPurchase: true, canManage: false },
    });
  });

  it("allows a pending checkout to resume its incomplete subscription", async () => {
    const result = await getOwnBillingStatus(
      context,
      mockClient({
        ...baseRow,
        status: "incomplete",
        paid_until: null,
        paid_premium_active: false,
        pending_checkout: true,
      }).client,
    );
    expect(result).toMatchObject({ ok: true, data: { canPurchase: true, pendingCheckout: true } });
    const closed = await getOwnBillingStatus(
      context,
      mockClient({
        ...baseRow,
        status: "incomplete",
        paid_until: null,
        paid_premium_active: false,
        pending_checkout: false,
      }).client,
    );
    expect(closed).toMatchObject({ ok: true, data: { canPurchase: false } });
  });

  it.each([
    { ...baseRow, user_id: "other-user" },
    { ...baseRow, paid_until: "invalid" },
    { ...baseRow, paid_premium_active: "true" },
  ])("fails closed on foreign or malformed data", async (row) => {
    expect(await getOwnBillingStatus(context, mockClient(row).client)).toEqual({
      ok: false,
      error: { code: "billing_unavailable" },
    });
  });

  it("does not query billing without authentication", async () => {
    expect(await getOwnBillingStatus({ ...context, locals: { ...context.locals, user: null } })).toEqual({
      ok: false,
      error: { code: "missing_auth" },
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("maps database exceptions without exposing details", async () => {
    const client = mockClient(null, { message: "private database password" });
    expect(await getOwnBillingStatus(context, client.client)).toEqual({
      ok: false,
      error: { code: "billing_unavailable" },
    });
  });
});
