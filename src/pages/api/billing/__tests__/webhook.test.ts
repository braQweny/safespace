import Stripe from "stripe";
import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BILLING_WEBHOOK_LIMIT_BYTES } from "@/lib/billing/webhook-body";

const { processBillingEvent } = vi.hoisted(() => ({ processBillingEvent: vi.fn() }));
const runtime: { secrets: Record<string, string | undefined> } = { secrets: {} };

vi.mock("astro:env/server", () => ({ getSecret: (name: string) => runtime.secrets[name] }));
// The only mocked billing module: the real config, Stripe client and raw-body
// signature check run, so the route is exercised as Stripe reaches it.
vi.mock("@/lib/billing/service", () => ({ processBillingEvent }));

const { POST } = await import("@/pages/api/billing/webhook");
const { BillingError } = await import("@/lib/billing/config");

const WEBHOOK_SECRET = "whsec_route_fixture";
const SANDBOX = {
  BILLING_MODE: "sandbox",
  STRIPE_SECRET_KEY: "sk_test_routefixture",
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  STRIPE_PRICE_ID: "price_routefixture",
  BILLING_APP_URL: "https://safespace.test",
  BILLING_DATABASE_URL: "postgresql://safespace_billing_login:fixture@127.0.0.1:54322/postgres",
};
const WEBHOOK_URL = "https://safespace.test/api/billing/webhook";
const payload = JSON.stringify({
  id: "evt_route_fixture",
  object: "event",
  type: "invoice.paid",
  livemode: false,
  data: { object: { customer: "cus_fixture" } },
});
const stripe = new Stripe("sk_test_local", { httpClient: Stripe.createFetchHttpClient() });

function setSecrets(values: Record<string, string | undefined>) {
  runtime.secrets = { ...values };
}

async function signature(body: string, secret = WEBHOOK_SECRET) {
  return stripe.webhooks.generateTestHeaderStringAsync({
    payload: body,
    secret,
    cryptoProvider: Stripe.createSubtleCryptoProvider(),
  });
}

function context(request: Request) {
  return { request, url: new URL(request.url), locals: { user: null } } as unknown as APIContext;
}

async function signedRequest(body = payload, secret = WEBHOOK_SECRET) {
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: { "stripe-signature": await signature(body, secret) },
    body,
  });
}

// `highWaterMark: 0` keeps the stream from pulling before someone reads it,
// so `reads` counts only real consumption by the route.
function watchedRequest() {
  const state = { reads: 0 };
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        state.reads += 1;
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request(WEBHOOK_URL, {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=fixture" },
    body,
    duplex: "half",
  } as RequestInit);
  return { request, state };
}

function endlessRequest(headers: Record<string, string> = {}) {
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(BILLING_WEBHOOK_LIMIT_BYTES / 4));
    },
  });
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=fixture", ...headers },
    body,
    duplex: "half",
  } as RequestInit);
}

describe("POST /api/billing/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSecrets(SANDBOX);
    processBillingEvent.mockResolvedValue(undefined);
  });

  it.each([
    ["billing is off", { BILLING_MODE: "off" }],
    ["billing mode is unset", {}],
  ])("answers 503 without reading the body when %s", async (_label, values) => {
    setSecrets(values);
    const { request, state } = watchedRequest();

    const response = await POST(context(request));

    expect(response.status).toBe(503);
    expect(state.reads).toBe(0);
    expect(request.bodyUsed).toBe(false);
    expect(processBillingEvent).not.toHaveBeenCalled();
  });

  it("answers 503 without reading the body when the sandbox config is unusable", async () => {
    setSecrets({ ...SANDBOX, STRIPE_SECRET_KEY: "sk_live_routefixture" });
    const { request, state } = watchedRequest();

    const response = await POST(context(request));

    expect(response.status).toBe(503);
    expect(state.reads).toBe(0);
    expect(processBillingEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["no Content-Length", {}],
    ["a dishonest Content-Length", { "content-length": "10" }],
  ])("answers 413 for an oversized streamed payload with %s", async (_label, headers) => {
    const response = await POST(context(endlessRequest(headers)));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ received: false });
    expect(processBillingEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["a signature from another secret", () => signedRequest(payload, "whsec_someone_else")],
    [
      "bytes changed after signing",
      async () => {
        const signed = await signedRequest();
        return new Request(WEBHOOK_URL, { method: "POST", headers: signed.headers, body: `${payload} ` });
      },
    ],
    ["no signature header", () => new Request(WEBHOOK_URL, { method: "POST", body: payload })],
  ])("answers 400 for %s", async (_label, build) => {
    const response = await POST(context(await build()));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ received: false });
    expect(processBillingEvent).not.toHaveBeenCalled();
  });

  it("answers 400 for a request without a body", async () => {
    const response = await POST(context(new Request(WEBHOOK_URL, { method: "POST" })));

    expect(response.status).toBe(400);
  });

  it.each([
    ["a database failure", () => new Error("connection refused")],
    ["a sandbox guard", () => new BillingError("billing_unavailable")],
    ["a reconciliation failure", () => new BillingError("account_blocked")],
  ])("never acknowledges an event whose processing failed with %s", async (_label, error) => {
    processBillingEvent.mockRejectedValue(error());

    const response = await POST(context(await signedRequest()));

    // Any 2xx tells Stripe the event is handled and stops its retries.
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ received: false });
  });

  it("acknowledges a correctly signed event after processing it", async () => {
    const response = await POST(context(await signedRequest()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(processBillingEvent).toHaveBeenCalledTimes(1);
    expect(processBillingEvent).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "sandbox", webhookSecret: WEBHOOK_SECRET, priceId: SANDBOX.STRIPE_PRICE_ID }),
      expect.objectContaining({ id: "evt_route_fixture", type: "invoice.paid" }),
    );
  });

  it("accepts a signed body without Content-Length", async () => {
    const encoded = new TextEncoder().encode(payload);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    });
    const request = new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": await signature(payload) },
      body,
      duplex: "half",
    } as RequestInit);

    const response = await POST(context(request));

    expect(request.headers.get("content-length")).toBeNull();
    expect(response.status).toBe(200);
  });
});
