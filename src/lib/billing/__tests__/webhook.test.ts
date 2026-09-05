import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
vi.mock("astro:env/server", () => ({ getSecret: () => undefined }));
import { BILLING_WEBHOOK_LIMIT_BYTES, readBillingWebhookBody, verifyBillingEvent } from "../webhook-body";
import { evaluateApiBodyGuard } from "@/lib/request-guards";
const stripe = new Stripe("sk_test_local", { httpClient: Stripe.createFetchHttpClient() });
const secret = "whsec_local_test_only";
const payload = JSON.stringify({
  id: "evt_test",
  object: "event",
  type: "invoice.paid",
  livemode: false,
  data: { object: {} },
});
async function signed(body = payload, timestamp?: number) {
  const signature = await stripe.webhooks.generateTestHeaderStringAsync({
    payload: body,
    secret,
    timestamp,
    cryptoProvider: Stripe.createSubtleCryptoProvider(),
  });
  return new Request("https://app.example/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body,
  });
}
describe("bounded Stripe webhook", () => {
  it("accepts signed raw bytes with no Content-Length and no auth cookie", async () => {
    const request = await signed();
    expect(evaluateApiBodyGuard(request, "/api/billing/webhook")).toEqual({ ok: true });
    expect((await verifyBillingEvent(stripe, request, secret)).id).toBe("evt_test");
  });
  it("rejects changed bytes, wrong signature and replay outside tolerance", async () => {
    const good = await signed();
    const changed = new Request(good.url, { method: "POST", headers: good.headers, body: payload + " " });
    await expect(verifyBillingEvent(stripe, changed, secret)).rejects.toThrow("invalid_webhook");
    await expect(verifyBillingEvent(stripe, await signed(), "whsec_wrong")).rejects.toThrow("invalid_webhook");
    await expect(verifyBillingEvent(stripe, await signed(payload, 1), secret)).rejects.toThrow("invalid_webhook");
  });
  it.each([undefined, "1"])("rejects an oversized streamed body regardless of declared length %s", async (length) => {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(BILLING_WEBHOOK_LIMIT_BYTES / 2));
      },
      cancel() {
        canceled = true;
      },
    });
    const request = new Request("https://app.example/api/billing/webhook", {
      method: "POST",
      body: stream,
      headers: length ? { "content-length": length } : {},
      duplex: "half",
    } as RequestInit);
    await expect(readBillingWebhookBody(request)).rejects.toThrow("payload_too_large");
    expect(canceled).toBe(true);
  });
});
