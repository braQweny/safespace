import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { checkSessionRateLimit } from "@/lib/rate-limit";
import { BillingError, getBillingConfig } from "./config";
import { createCheckout, createPortal } from "./service";

export async function billingUserAction(context: APIContext, action: "checkout" | "portal") {
  if (!context.locals.user) return context.redirect("/auth/signin", 303);
  if (context.request.headers.get("origin") !== context.url.origin) return new Response(null, { status: 403 });
  try {
    const config = getBillingConfig();
    if (context.url.origin !== config?.appUrl) throw new BillingError("billing_unavailable");
    const verdict = await checkSessionRateLimit(env.BILLING_RATE_LIMITER, `billing:${context.locals.user.id}`, {
      failClosed: true,
    });
    if (verdict !== "allowed") throw new BillingError(verdict === "limited" ? "rate_limited" : "billing_unavailable");
    const url =
      action === "checkout"
        ? await createCheckout(config, context.locals.user.id, context.locals.locale)
        : await createPortal(config, context.locals.user.id, context.locals.locale);
    return context.redirect(url, 303);
  } catch (error) {
    // Stripe/pg errors contain customer/payment/connection data. Only closed
    // application codes reach the redirect, with no provider payload logging.
    const code =
      error instanceof BillingError &&
      ["rate_limited", "account_blocked", "deletion_pending", "subscription_exists"].includes(error.code)
        ? error.code
        : "billing_unavailable";
    return context.redirect(`/account/billing?error=${code}`, 303);
  }
}
