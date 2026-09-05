import type { APIRoute } from "astro";
import { BillingError, getBillingConfig } from "@/lib/billing/config";
import { createBillingStripe } from "@/lib/billing/stripe";
import { verifyBillingEvent } from "@/lib/billing/webhook-body";
import { processBillingEvent } from "@/lib/billing/service";
export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  try {
    const config = getBillingConfig();
    if (!config) return new Response(null, { status: 503 });
    const event = await verifyBillingEvent(createBillingStripe(config), request, config.webhookSecret);
    await processBillingEvent(config, event);
    return Response.json({ received: true });
  } catch (error) {
    const status =
      error instanceof BillingError && error.code === "payload_too_large"
        ? 413
        : error instanceof BillingError && error.code === "invalid_webhook"
          ? 400
          : 503;
    return Response.json({ received: false }, { status });
  }
};
