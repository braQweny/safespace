import Stripe from "stripe";
import { BillingError, type BillingConfig } from "./config";

export function createBillingStripe(config: BillingConfig) {
  return new Stripe(config.secretKey, {
    apiVersion: "2026-08-26.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 10_000,
    maxNetworkRetries: 1,
  });
}
export function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : (value?.id ?? null);
}
export function assertSandbox(value: { livemode: boolean }) {
  if (value.livemode) throw new BillingError("billing_unavailable");
}
export function validateStripeRedirect(raw: string | null, kind: "checkout" | "portal") {
  if (!raw) throw new BillingError("billing_unavailable");
  const url = new URL(raw);
  const origin = kind === "checkout" ? "https://checkout.stripe.com" : "https://billing.stripe.com";
  if (url.origin !== origin || url.username || url.password) throw new BillingError("billing_unavailable");
  return url.href;
}
export async function assertConfiguredPrice(stripe: Stripe, priceId: string) {
  const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
  assertSandbox(price);
  if (
    !price.active ||
    price.currency !== "pln" ||
    price.unit_amount !== 4900 ||
    price.tax_behavior !== "inclusive" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed" ||
    typeof price.product === "string" ||
    price.product.deleted ||
    !price.product.active ||
    stripeId(price.product.tax_code) !== "txcd_10105001"
  )
    throw new BillingError("billing_unavailable");
}
// Stop rather than treating a truncated list as proof of absence.
export async function boundedStripeList<T>(list: AsyncIterable<T>, limit = 1000): Promise<T[]> {
  const result: T[] = [];
  for await (const item of list) {
    if (result.length >= limit) throw new BillingError("billing_unavailable");
    result.push(item);
  }
  return result;
}
