import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, readAccountAccessState } = vi.hoisted(() => ({
  createClient: vi.fn(),
  readAccountAccessState: vi.fn(),
}));
const secrets: Record<string, string | undefined> = {};

vi.mock("astro:env/server", () => ({ getSecret: (name: string) => secrets[name] }));
vi.mock("@/lib/supabase", () => ({ createClient }));
vi.mock("@/lib/admin/account-access", () => ({ readAccountAccessState }));

const { GET } = await import("@/pages/api/billing/status");

const OWNER = "owner-fixture";
const active = { userId: OWNER, status: "active", premiumGrantedAt: null };
const row = {
  user_id: OWNER,
  status: "active",
  paid_until: "2026-10-01T12:00:00Z",
  cancel_at_period_end: false,
  deletion_requested_at: null,
  has_customer: true,
  pending_checkout: false,
  paid_premium_active: true,
  stripe_customer_id: "cus_private_fixture",
};

function mockClient(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, eq };
}

function context(user: { id: string } | null) {
  const url = new URL("https://safespace.test/api/billing/status");
  return {
    url,
    request: new Request(url),
    cookies: {},
    locals: { user, locale: "en", accountAccess: null },
  } as unknown as APIContext;
}

describe("GET /api/billing/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secrets.BILLING_MODE = "sandbox";
    readAccountAccessState.mockResolvedValue({ ok: true, data: active });
  });

  it("returns 200 with the owner's status and no Stripe identifiers", async () => {
    const client = mockClient(row);
    createClient.mockReturnValue(client);

    const response = await GET(context({ id: OWNER }));
    const body = (await response.json()) as { ok: boolean; data: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, data: { enabled: true, premiumActive: true, canManage: true } });
    expect(client.from).toHaveBeenCalledWith("billing_status");
    expect(client.eq).toHaveBeenCalledWith("user_id", OWNER);
    expect(JSON.stringify(body)).not.toContain("cus_");
  });

  it("returns 200 while billing is off so the page can explain it", async () => {
    secrets.BILLING_MODE = "off";
    createClient.mockReturnValue(mockClient(null));

    const response = await GET(context({ id: OWNER }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { enabled: false, canPurchase: false } });
  });

  it("returns 401 for an anonymous request without touching Supabase", async () => {
    const response = await GET(context(null));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: { code: "missing_auth" } });
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    ["Supabase is not configured", () => createClient.mockReturnValue(null)],
    ["the status read fails", () => createClient.mockReturnValue(mockClient(null, { message: "boom" }))],
    [
      "the account access read fails",
      () => {
        createClient.mockReturnValue(mockClient(row));
        readAccountAccessState.mockResolvedValue({ ok: false, error: { code: "account_access_unavailable" } });
      },
    ],
    ["the row belongs to someone else", () => createClient.mockReturnValue(mockClient({ ...row, user_id: "other" }))],
  ])("returns 503 for a signed-in owner when %s", async (_label, arrange) => {
    arrange();

    const response = await GET(context({ id: OWNER }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: { code: "billing_unavailable" } });
  });
});
