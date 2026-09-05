import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillingConfig } from "@/lib/billing/config";
import type { RateLimiterBinding } from "@/lib/rate-limit";

vi.mock("astro:env/server", () => ({ getSecret: () => undefined }));
const billingLimit = vi.fn();
const workerEnv: { BILLING_RATE_LIMITER?: RateLimiterBinding } = {
  BILLING_RATE_LIMITER: { limit: billingLimit },
};
vi.mock("cloudflare:workers", () => ({ env: workerEnv }));
const getBillingConfig = vi.fn();
const prepareBillingAccountDeletion = vi.fn();
vi.mock("@/lib/billing/config", () => ({ getBillingConfig }));
vi.mock("@/lib/billing/service", () => ({ prepareBillingAccountDeletion }));
const createClient = vi.fn();
const clearAuthCookies = vi.fn();
const rpc = vi.fn();
const signOut = vi.fn();
const logOperationalEvent = vi.fn();
vi.mock("@/lib/supabase", () => ({ createClient, clearAuthCookies }));
vi.mock("@/lib/operational-visibility/request-context", () => ({
  buildOperationalRequestContext: vi.fn().mockResolvedValue({ requestId: "test-delete" }),
}));
vi.mock("@/lib/operational-visibility/logger", () => ({ logOperationalEvent }));
const { POST } = await import("@/pages/api/auth/delete-account");

const sandboxConfig: BillingConfig = {
  mode: "sandbox",
  secretKey: "sk_test_fixture",
  webhookSecret: "whsec_fixture",
  priceId: "price_fixture",
  appUrl: "https://safespace.local",
  databaseUrl: "postgresql://safespace_billing_login:fixture@127.0.0.1:54322/postgres",
};

function context({
  confirmation = "USUWAM",
  origin = "https://safespace.local",
  user = { id: "owner" },
  json = false,
}: { confirmation?: string; origin?: string; user?: { id: string } | null; json?: boolean } = {}) {
  const url = new URL("https://safespace.local/api/auth/delete-account");
  return {
    url,
    locals: { user, accountAccess: { status: "blocked" } },
    cookies: {},
    request: new Request(url, {
      method: "POST",
      headers: { ...(origin ? { origin } : {}), ...(json ? { "Content-Type": "application/json" } : {}) },
      body: json ? JSON.stringify({ confirmation }) : new URLSearchParams({ confirmation, userId: "someone-else" }),
    }),
    redirect: (location: string, status = 302) => new Response(null, { status, headers: { Location: location } }),
  } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
  workerEnv.BILLING_RATE_LIMITER = { limit: billingLimit };
  billingLimit.mockResolvedValue({ success: true });
  getBillingConfig.mockReturnValue(null);
  createClient.mockReturnValue({ rpc, auth: { signOut } });
  rpc.mockResolvedValue({ data: true, error: null });
  signOut.mockResolvedValue({ error: null });
});

describe("self-service account deletion", () => {
  it.each(["https://attacker.example", "", "null"])("rejects an untrusted or missing origin: %s", async (origin) => {
    expect((await POST(context({ origin }))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires a verified logged-in user", async () => {
    expect((await POST(context({ user: null }))).headers.get("Location")).toBe("/auth/signin");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["", "usuwam", "USUWAM "])("requires exact confirmation: %s", async (confirmation) => {
    expect((await POST(context({ confirmation }))).headers.get("Location")).toBe(
      "/account/delete?error=account_deletion_confirmation_required",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects a JSON body", async () => {
    await POST(context({ json: true }));
    expect(rpc).not.toHaveBeenCalled();
  });
  it("allows a blocked owner, ignores supplied target ids and clears the session after deletion", async () => {
    const response = await POST(context());
    expect(rpc).toHaveBeenCalledWith("delete_own_account", { p_confirmation: "USUWAM" });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(clearAuthCookies).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/auth/signin?status=account_deleted");
  });
  it.each(["error", "throw", "false", "null", "unconfigured"])(
    "handles %s without clearing an existing account session or exposing provider details",
    async (failure) => {
      if (failure === "error") rpc.mockResolvedValue({ data: null, error: { message: "private database details" } });
      if (failure === "throw") rpc.mockRejectedValue(new Error("private database details"));
      if (failure === "false") rpc.mockResolvedValue({ data: false, error: null });
      if (failure === "null") rpc.mockResolvedValue({ data: null, error: null });
      if (failure === "unconfigured") createClient.mockReturnValue(null);
      const response = await POST(context());
      expect(response.headers.get("Location")).toBe("/account/delete?error=account_deletion_failed");
      expect(signOut).not.toHaveBeenCalled();
      expect(clearAuthCookies).not.toHaveBeenCalled();
      expect(JSON.stringify(logOperationalEvent.mock.calls)).not.toContain("private database details");
    },
  );
  it("still clears credentials and reports success if Auth signout is unreachable after deletion", async () => {
    signOut.mockRejectedValue(new Error("offline"));
    expect((await POST(context())).headers.get("Location")).toBe("/auth/signin?status=account_deleted");
    expect(clearAuthCookies).toHaveBeenCalledOnce();
  });
});

describe("billing cancellation before account deletion", () => {
  it("waits for Stripe cancellation before invoking the deletion RPC", async () => {
    getBillingConfig.mockReturnValue(sandboxConfig);
    prepareBillingAccountDeletion.mockResolvedValue(undefined);
    await POST(context());
    expect(billingLimit).toHaveBeenCalledWith({ key: "billing:owner" });
    expect(prepareBillingAccountDeletion).toHaveBeenCalledWith(sandboxConfig, "owner");
    expect(billingLimit.mock.invocationCallOrder[0]).toBeLessThan(
      prepareBillingAccountDeletion.mock.invocationCallOrder[0],
    );
    expect(prepareBillingAccountDeletion.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
    expect(clearAuthCookies).toHaveBeenCalledOnce();
  });
  it("keeps account and cookies when cancellation cannot be confirmed", async () => {
    getBillingConfig.mockReturnValue(sandboxConfig);
    prepareBillingAccountDeletion.mockRejectedValue(new Error("private Stripe payload"));
    const response = await POST(context());
    expect(response.headers.get("Location")).toBe("/account/delete?error=account_deletion_failed");
    expect(rpc).not.toHaveBeenCalled();
    expect(clearAuthCookies).not.toHaveBeenCalled();
  });

  it.each(["limited", "unavailable", "missing"] as const)(
    "stops before Stripe and RPC when the billing limiter is %s",
    async (failure) => {
      getBillingConfig.mockReturnValue(sandboxConfig);
      if (failure === "limited") billingLimit.mockResolvedValue({ success: false });
      if (failure === "unavailable") billingLimit.mockRejectedValue(new Error("private limiter transport payload"));
      if (failure === "missing") workerEnv.BILLING_RATE_LIMITER = undefined;

      const response = await POST(context());

      expect(response.headers.get("Location")).toBe(
        `/account/delete?error=${failure === "limited" ? "rate_limited" : "account_deletion_failed"}`,
      );
      expect(prepareBillingAccountDeletion).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
      expect(clearAuthCookies).not.toHaveBeenCalled();
      const logs = JSON.stringify(logOperationalEvent.mock.calls);
      expect(logs).not.toContain("private limiter transport payload");
      expect(logs).not.toContain("billing:owner");
      expect(logs).not.toContain(sandboxConfig.secretKey);
    },
  );

  it("keeps deletion available with billing off and no billing limiter", async () => {
    workerEnv.BILLING_RATE_LIMITER = undefined;
    const response = await POST(context());
    expect(response.headers.get("Location")).toBe("/auth/signin?status=account_deleted");
    expect(billingLimit).not.toHaveBeenCalled();
    expect(prepareBillingAccountDeletion).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledOnce();
    expect(clearAuthCookies).toHaveBeenCalledOnce();
  });

  it("fails invalid billing configuration without calling the limiter, Stripe or deletion RPC", async () => {
    getBillingConfig.mockImplementation(() => {
      throw new Error("billing_unavailable");
    });
    const response = await POST(context());
    expect(response.headers.get("Location")).toBe("/account/delete?error=account_deletion_failed");
    expect(billingLimit).not.toHaveBeenCalled();
    expect(prepareBillingAccountDeletion).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(clearAuthCookies).not.toHaveBeenCalled();
  });
});
