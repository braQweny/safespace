import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";
import type { BillingConfig } from "../config";
import type { RateLimiterBinding } from "@/lib/rate-limit";

const { getBillingConfig, createCheckout, createPortal, limit } = vi.hoisted(() => ({
  getBillingConfig: vi.fn(),
  createCheckout: vi.fn(),
  createPortal: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("astro:env/server", () => ({ getSecret: () => undefined }));
vi.mock("../config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config")>()),
  getBillingConfig,
}));
vi.mock("../service", () => ({ createCheckout, createPortal }));
const workerEnv: { BILLING_RATE_LIMITER?: RateLimiterBinding } = { BILLING_RATE_LIMITER: { limit } };
vi.mock("cloudflare:workers", () => ({ env: workerEnv }));

const { billingUserAction } = await import("../routes");
const { BillingError } = await import("../config");

const config: BillingConfig = {
  mode: "sandbox",
  secretKey: "sk_test_fixture",
  webhookSecret: "whsec_fixture",
  priceId: "price_serverconfigured",
  appUrl: "https://safespace.test",
  databaseUrl: "postgresql://safespace_billing_login:fixture@127.0.0.1:54322/postgres",
};

function context({
  action = "checkout",
  origin = config.appUrl,
  appOrigin = config.appUrl,
  userId = "authenticated-owner",
  locale = "pl",
  body,
  blocked = false,
}: {
  action?: "checkout" | "portal";
  origin?: string | null;
  appOrigin?: string;
  userId?: string | null;
  locale?: "en" | "pl";
  body?: URLSearchParams;
  blocked?: boolean;
} = {}): APIContext {
  const url = new URL(`/api/billing/${action}`, appOrigin);
  return {
    url,
    locals: {
      user: userId ? { id: userId } : null,
      locale,
      accountAccess: { status: blocked ? "blocked" : "active" },
    },
    request: new Request(url, {
      method: "POST",
      headers: origin === null ? {} : { Origin: origin },
      body,
    }),
    redirect: (location: string, status: number) => new Response(null, { status, headers: { Location: location } }),
  } as unknown as APIContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  workerEnv.BILLING_RATE_LIMITER = { limit };
  getBillingConfig.mockReset().mockReturnValue(config);
  limit.mockReset().mockResolvedValue({ success: true });
  createCheckout.mockReset().mockResolvedValue("https://checkout.stripe.com/c/pay/cs_test_fixture");
  createPortal.mockReset().mockResolvedValue("https://billing.stripe.com/p/session/test_fixture");
});

describe.each(["checkout", "portal"] as const)("billing %s authorization", (action) => {
  it("redirects an unauthenticated caller before reading config or contacting Stripe", async () => {
    const response = await billingUserAction(context({ action, userId: null }), action);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/auth/signin");
    expect(getBillingConfig).not.toHaveBeenCalled();
    expect(limit).not.toHaveBeenCalled();
    expect(createCheckout).not.toHaveBeenCalled();
    expect(createPortal).not.toHaveBeenCalled();
  });

  it.each([null, "null", "https://foreign.test"])(
    "rejects missing or foreign origin %s before payment work",
    async (origin) => {
      const response = await billingUserAction(context({ action, origin }), action);
      expect(response.status).toBe(403);
      expect(response.headers.get("Location")).toBeNull();
      expect(getBillingConfig).not.toHaveBeenCalled();
      expect(limit).not.toHaveBeenCalled();
      expect(createCheckout).not.toHaveBeenCalled();
      expect(createPortal).not.toHaveBeenCalled();
    },
  );

  it.each(["off", "invalid_config", "wrong_fixed_origin"])("fails safely for %s", async (failure) => {
    if (failure === "off") getBillingConfig.mockReturnValue(null);
    if (failure === "invalid_config")
      getBillingConfig.mockImplementation(() => {
        throw new BillingError("billing_unavailable");
      });
    const appOrigin = failure === "wrong_fixed_origin" ? "https://other-instance.test" : config.appUrl;
    const response = await billingUserAction(context({ action, appOrigin, origin: appOrigin }), action);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/account/billing?error=billing_unavailable");
    expect(limit).not.toHaveBeenCalled();
    expect(createCheckout).not.toHaveBeenCalled();
    expect(createPortal).not.toHaveBeenCalled();
  });

  it.each(["limited", "missing", "failed"])("refuses payment operations when the limiter is %s", async (failure) => {
    if (failure === "limited") limit.mockResolvedValue({ success: false });
    if (failure === "missing") workerEnv.BILLING_RATE_LIMITER = undefined;
    if (failure === "failed") limit.mockRejectedValue(new Error("private limiter error"));
    const response = await billingUserAction(context({ action }), action);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      `/account/billing?error=${failure === "limited" ? "rate_limited" : "billing_unavailable"}`,
    );
    expect(createCheckout).not.toHaveBeenCalled();
    expect(createPortal).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("private limiter error");
  });

  it.each(["en", "pl"] as const)(
    "uses only the authenticated owner, server configuration and request locale %s",
    async (locale) => {
      const request = context({
        action,
        locale,
        body: new URLSearchParams({
          userId: "foreign-user",
          customerId: "cus_foreign",
          priceId: "price_free",
          locale: locale === "en" ? "pl" : "en",
          returnUrl: "https://foreign.test/collect",
        }),
      });
      const response = await billingUserAction(request, action);
      const service = action === "checkout" ? createCheckout : createPortal;
      const otherService = action === "checkout" ? createPortal : createCheckout;
      expect(service).toHaveBeenCalledExactlyOnceWith(config, "authenticated-owner", locale);
      expect(otherService).not.toHaveBeenCalled();
      expect(limit).toHaveBeenCalledExactlyOnceWith({ key: "billing:authenticated-owner" });
      expect(limit.mock.invocationCallOrder[0]).toBeLessThan(service.mock.invocationCallOrder[0]);
      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe(
        action === "checkout"
          ? "https://checkout.stripe.com/c/pay/cs_test_fixture"
          : "https://billing.stripe.com/p/session/test_fixture",
      );
    },
  );

  it.each(["rate_limited", "account_blocked", "deletion_pending", "subscription_exists"])(
    "passes the stable application error %s without provider details",
    async (code) => {
      const service = action === "checkout" ? createCheckout : createPortal;
      const error = new BillingError(code);
      error.message = "private provider/customer data";
      service.mockRejectedValue(error);
      const response = await billingUserAction(context({ action }), action);
      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe(`/account/billing?error=${code}`);
      expect(await response.text()).not.toContain(error.message);
    },
  );

  it.each([
    new Error("Stripe private payload cus_secret sk_test_secret"),
    { code: "rate_limited", message: "database credentials" },
    new BillingError("unexpected_secret_code"),
  ])("normalizes provider failures and unexpected errors without leaking data", async (error) => {
    const service = action === "checkout" ? createCheckout : createPortal;
    service.mockRejectedValue(error);
    const response = await billingUserAction(context({ action }), action);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/account/billing?error=billing_unavailable");
    expect(await response.text()).toBe("");
  });
});

it("lets a blocked account reach its own portal so it can cancel billing", async () => {
  const response = await billingUserAction(context({ action: "portal", blocked: true }), "portal");
  expect(response.headers.get("Location")).toBe("https://billing.stripe.com/p/session/test_fixture");
  expect(createPortal).toHaveBeenCalledExactlyOnceWith(config, "authenticated-owner", "pl");
  expect(createCheckout).not.toHaveBeenCalled();
});
