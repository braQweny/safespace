import { describe, expect, it, vi } from "vitest";
vi.mock("astro:env/server", () => ({ getSecret: () => undefined }));
import { resolveBillingConfig } from "../config";
import { validateStripeRedirect } from "../stripe";
const env = {
  BILLING_MODE: "sandbox",
  STRIPE_SECRET_KEY: "sk_test_local",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_ID: "price_test",
  BILLING_APP_URL: "http://localhost:4321",
  BILLING_DATABASE_URL: "postgresql://safespace_billing_login:test@127.0.0.1:54322/postgres",
};
describe("sandbox configuration", () => {
  it("is off by default without requiring any secrets", () => {
    expect(resolveBillingConfig({})).toBeNull();
  });
  it("accepts dedicated sandbox configuration", () => {
    expect(resolveBillingConfig(env)?.mode).toBe("sandbox");
  });
  it.each([
    { BILLING_MODE: "live" },
    { STRIPE_SECRET_KEY: "sk_live_invalid" },
    { BILLING_DATABASE_URL: "postgresql://postgres:test@localhost/postgres" },
    { BILLING_APP_URL: "https://app.example/path" },
    { BILLING_APP_URL: "http://untrusted.example" },
  ])("fails closed on incompatible configuration %j", (override) => {
    expect(() => resolveBillingConfig({ ...env, ...override })).toThrow("billing_unavailable");
  });
  it("only redirects to the actual Stripe hosts", () => {
    expect(validateStripeRedirect("https://checkout.stripe.com/c/pay/cs_test", "checkout")).toContain(
      "checkout.stripe.com",
    );
    expect(() => validateStripeRedirect("https://checkout.stripe.com.evil.test/", "checkout")).toThrow();
    expect(() => validateStripeRedirect("https://evil.test@billing.stripe.com/", "portal")).toThrow();
  });
});
