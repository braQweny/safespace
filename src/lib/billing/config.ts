import { getSecret } from "astro:env/server";

export class BillingError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "BillingError";
  }
}
export interface BillingConfig {
  mode: "sandbox";
  secretKey: string;
  webhookSecret: string;
  priceId: string;
  appUrl: string;
  databaseUrl: string;
}
export function resolveBillingConfig(values: Record<string, string | undefined>): BillingConfig | null {
  const mode = values.BILLING_MODE?.trim() ?? "off";
  if (mode === "off") return null;
  if (mode !== "sandbox") throw new BillingError("billing_unavailable");
  const secretKey = values.STRIPE_SECRET_KEY?.trim() ?? "";
  const webhookSecret = values.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  const priceId = values.STRIPE_PRICE_ID?.trim() ?? "";
  try {
    const app = new URL(values.BILLING_APP_URL ?? "");
    const db = new URL(values.BILLING_DATABASE_URL ?? "");
    if (
      !/^sk_test_[A-Za-z0-9]+$/.test(secretKey) ||
      !webhookSecret.startsWith("whsec_") ||
      !/^price_[A-Za-z0-9]+$/.test(priceId) ||
      app.username ||
      app.password ||
      app.search ||
      app.hash ||
      app.pathname !== "/" ||
      (app.protocol !== "https:" &&
        !(app.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(app.hostname))) ||
      !["postgres:", "postgresql:"].includes(db.protocol) ||
      db.username !== "safespace_billing_login" ||
      !db.password
    )
      throw new Error();
    return { mode, secretKey, webhookSecret, priceId, appUrl: app.origin, databaseUrl: db.href };
  } catch {
    throw new BillingError("billing_unavailable");
  }
}
export function isBillingEnabled() {
  return getSecret("BILLING_MODE") === "sandbox";
}
export function getBillingConfig() {
  return resolveBillingConfig(
    Object.fromEntries(
      [
        "BILLING_MODE",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "STRIPE_PRICE_ID",
        "BILLING_APP_URL",
        "BILLING_DATABASE_URL",
      ].map((name) => [name, getSecret(name)]),
    ),
  );
}
