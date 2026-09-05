import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "pg";
import type Stripe from "stripe";
import type { BillingConfig } from "../config";

const mocks = vi.hoisted(() => ({
  withBillingDatabase: vi.fn(),
  createBillingStripe: vi.fn(),
  reconcileCustomer: vi.fn(),
}));
vi.mock("astro:env/server", () => ({ getSecret: vi.fn() }));
vi.mock("../database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../database")>()),
  withBillingDatabase: mocks.withBillingDatabase,
}));
vi.mock("../stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../stripe")>()),
  createBillingStripe: mocks.createBillingStripe,
}));
vi.mock("../reconcile", () => ({ reconcileCustomer: mocks.reconcileCustomer }));

const { createCheckout, createPortal, processBillingEvent, prepareBillingAccountDeletion } = await import("../service");

const config: BillingConfig = {
  mode: "sandbox",
  secretKey: "sk_test_placeholder",
  webhookSecret: "whsec_placeholder",
  priceId: "price_premium",
  appUrl: "http://localhost:4321",
  databaseUrl: "postgresql://safespace_billing_login:placeholder@localhost:54322/postgres",
};
const now = new Date("2026-09-05T12:00:00Z");
const userId = "owner";
const customerId = "cus_owner";

function account() {
  return {
    user_id: userId,
    stripe_customer_id: customerId as string | null,
    customer_idempotency_key: "customer-stable-key",
    deletion_requested_at: null as Date | null,
    cancellation_confirmed_at: null as Date | null,
  };
}
function attempt() {
  return {
    id: "attempt-random-id",
    user_id: userId,
    stripe_checkout_session_id: null as string | null,
    stripe_idempotency_key: "checkout-stable-key",
    stripe_price_id: config.priceId,
    state: "creating",
    checkout_url: null as string | null,
    expires_at: new Date(now.getTime() + 3_600_000),
    created_at: now,
    success_url: `${config.appUrl}/account/billing?checkout=success`,
    cancel_url: `${config.appUrl}/account/billing?checkout=canceled`,
    locale: "pl",
  };
}
function session(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_test_owner",
    livemode: false,
    customer: customerId,
    client_reference_id: "attempt-random-id",
    mode: "subscription",
    managed_payments: { enabled: true },
    status: "open",
    url: "https://checkout.stripe.com/c/pay/cs_test_owner",
    ...overrides,
  } as Stripe.Checkout.Session;
}
function subscription(status: Stripe.Subscription.Status = "active"): Stripe.Subscription {
  return { id: "sub_owner", livemode: false, customer: customerId, status } as Stripe.Subscription;
}
function event(id = "evt_new", overrides: Partial<Stripe.Event> = {}): Stripe.Event {
  return {
    id,
    livemode: false,
    type: "invoice.paid",
    created: 1_788_566_400,
    data: { object: { id: "in_event", customer: customerId, metadata: { user_id: "forged-owner" } } },
    ...overrides,
  } as Stripe.Event;
}
function list<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      const iterator = items[Symbol.iterator]();
      return { next: () => Promise.resolve(iterator.next()) };
    },
  };
}

// This fake models only the persistence boundary. The production transaction
// helper still executes BEGIN, the advisory lock, COMMIT and ROLLBACK.
function harness(initialAttempt: ReturnType<typeof attempt> | null = null) {
  let state = {
    account: account() as ReturnType<typeof account> | null,
    attempt: initialAttempt,
    events: [] as string[],
  };
  let snapshot = structuredClone(state);
  const trace: string[] = [];
  const query = vi.fn((sql: string, values: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, " ").trim();
    trace.push(normalized);
    let rows: unknown[] = [];
    if (normalized === "begin") snapshot = structuredClone(state);
    else if (normalized === "rollback") state = snapshot;
    else if (normalized.includes("billing_account_can_purchase"))
      rows = [{ allowed: !state.account?.deletion_requested_at }];
    else if (normalized.startsWith("select user_id from private.billing_accounts"))
      rows = state.account?.stripe_customer_id === values[0] ? [{ user_id: userId }] : [];
    else if (normalized.startsWith("select * from private.billing_accounts"))
      rows = state.account ? [structuredClone(state.account)] : [];
    else if (normalized.startsWith("select * from private.billing_checkout_attempts"))
      rows =
        state.attempt && ["creating", "open"].includes(state.attempt.state) ? [structuredClone(state.attempt)] : [];
    else if (normalized.startsWith("select 1 from private.billing_events"))
      rows = state.events.includes(String(values[0])) ? [{}] : [];
    else if (normalized.startsWith("insert into private.billing_events")) state.events.push(String(values[0]));
    else if (normalized.startsWith("insert into private.billing_accounts")) state.account ??= account();
    else if (normalized.startsWith("insert into private.billing_checkout_attempts")) state.attempt = attempt();
    else if (normalized.includes("set stripe_customer_id=$2") && state.account)
      state.account.stripe_customer_id = String(values[1]);
    else if (normalized.includes("set deletion_requested_at=") && state.account)
      state.account.deletion_requested_at ??= now;
    else if (normalized.includes("set cancellation_confirmed_at=") && state.account)
      state.account.cancellation_confirmed_at = now;
    else if (normalized.includes("set stripe_checkout_session_id=$2") && state.attempt) {
      state.attempt.stripe_checkout_session_id = String(values[1]);
      state.attempt.state = String(values[2]);
      state.attempt.checkout_url = values[3] as string | null;
    } else if (normalized.includes("billing_checkout_attempts set state='expired'") && state.attempt)
      state.attempt.state = "expired";
    return Promise.resolve({ rows, rowCount: rows.length });
  });
  const db = { query } as unknown as Client;
  const createSession = vi.fn().mockResolvedValue(session());
  const retrieveSession = vi.fn().mockResolvedValue(session());
  const listSessions = vi.fn().mockReturnValue(list([]));
  const expireSession = vi.fn().mockResolvedValue(session({ status: "expired" }));
  const listSubscriptions = vi.fn().mockReturnValue(list([]));
  const cancelSubscription = vi.fn().mockResolvedValue(subscription("canceled"));
  const retrieveSubscription = vi.fn().mockResolvedValue(subscription("canceled"));
  const createCustomer = vi.fn().mockResolvedValue({ id: customerId, livemode: false });
  const createPortalConfig = vi.fn().mockResolvedValue({ id: "bpc_safe", livemode: false });
  const createPortalSession = vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/p/session/owner" });
  const stripe = {
    prices: {
      retrieve: vi.fn().mockResolvedValue({
        livemode: false,
        active: true,
        currency: "pln",
        unit_amount: 4900,
        tax_behavior: "inclusive",
        recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
        product: { id: "prod_premium", active: true, tax_code: "txcd_10105001" },
      }),
    },
    customers: { create: createCustomer },
    checkout: {
      sessions: { create: createSession, retrieve: retrieveSession, list: listSessions, expire: expireSession },
    },
    subscriptions: { list: listSubscriptions, cancel: cancelSubscription, retrieve: retrieveSubscription },
    billingPortal: { configurations: { create: createPortalConfig }, sessions: { create: createPortalSession } },
  } as unknown as Stripe;
  mocks.createBillingStripe.mockReturnValue(stripe);
  mocks.withBillingDatabase.mockImplementation((_config: BillingConfig, run: (client: Client) => Promise<unknown>) =>
    run(db),
  );
  return {
    state: () => state,
    db,
    stripe,
    query,
    trace,
    createSession,
    retrieveSession,
    listSessions,
    expireSession,
    listSubscriptions,
    cancelSubscription,
    retrieveSubscription,
    createCustomer,
    createPortalConfig,
    createPortalSession,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(now.getTime());
  mocks.reconcileCustomer.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkout recovery", () => {
  it("replays persisted parameters and idempotency key after a lost Stripe response", async () => {
    const h = harness(attempt());
    h.createSession.mockRejectedValueOnce(new Error("connection lost"));
    await expect(createCheckout(config, userId, "pl")).rejects.toThrow("connection lost");
    expect(h.state().attempt?.stripe_checkout_session_id).toBeNull();
    expect(await createCheckout({ ...config, appUrl: "https://changed.example" }, userId, "en")).toBe(session().url);
    expect(h.createSession).toHaveBeenCalledTimes(2);
    expect(h.createSession.mock.calls[1]).toEqual(h.createSession.mock.calls[0]);
    const checkoutParams: unknown = h.createSession.mock.calls[0]?.[0];
    expect(checkoutParams).not.toHaveProperty("payment_method_types");
    expect(checkoutParams).not.toHaveProperty("adaptive_pricing");
    expect(h.createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        customer: customerId,
        locale: "pl",
        line_items: [{ price: config.priceId, quantity: 1 }],
        managed_payments: { enabled: true },
        success_url: attempt().success_url,
        expires_at: Math.floor(attempt().expires_at.getTime() / 1000),
      }),
      { idempotencyKey: "checkout-stable-key" },
    );
    expect(mocks.reconcileCustomer).not.toHaveBeenCalled();
  });

  it("reuses an open checkout and never creates a second session", async () => {
    const pending = attempt();
    pending.stripe_checkout_session_id = "cs_test_owner";
    const h = harness(pending);
    expect(await createCheckout(config, userId, "en")).toBe(session().url);
    expect(h.retrieveSession).toHaveBeenCalledWith("cs_test_owner");
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it("keeps uncertain old attempts pending instead of retrying a potentially pruned Stripe key", async () => {
    const pending = attempt();
    pending.created_at = new Date(now.getTime() - 25 * 3_600_000);
    pending.expires_at = new Date(now.getTime() - 24 * 3_600_000);
    const h = harness(pending);
    await expect(createCheckout(config, userId, "pl")).rejects.toMatchObject({ code: "billing_unavailable" });
    expect(h.createSession).not.toHaveBeenCalled();
    expect(h.listSessions).toHaveBeenCalledWith({ customer: customerId, limit: 100 });
    expect(h.state().attempt?.state).toBe("creating");
  });

  it.each([
    { customer: "cus_other" },
    { client_reference_id: "other-attempt" },
    { managed_payments: { enabled: false } },
  ])("rejects a checkout response for a different customer or purchase: %j", async (overrides) => {
    const h = harness(attempt());
    h.createSession.mockResolvedValue(session(overrides));
    await expect(createCheckout(config, userId, "pl")).rejects.toMatchObject({ code: "billing_unavailable" });
    expect(h.state().attempt?.stripe_checkout_session_id).toBeNull();
  });

  it("does not create a checkout when Stripe already has a nonterminal subscription", async () => {
    const h = harness();
    mocks.reconcileCustomer.mockResolvedValue([subscription("past_due")]);
    await expect(createCheckout(config, userId, "pl")).rejects.toMatchObject({ code: "subscription_exists" });
    expect(h.createSession).not.toHaveBeenCalled();
    expect(h.state().attempt).toBeNull();
  });

  it("commits customer intent before Stripe and reuses its key on a retry", async () => {
    const h = harness();
    const owner = h.state().account;
    if (owner) owner.stripe_customer_id = null;
    h.createCustomer.mockImplementationOnce(() => {
      expect(h.trace).toContain("commit");
      expect(h.state().attempt).toBeNull();
      return Promise.reject(new Error("connection lost"));
    });
    await expect(createCheckout(config, userId, "pl")).rejects.toThrow("connection lost");
    await createCheckout(config, userId, "pl");
    expect(h.createCustomer.mock.calls).toEqual([
      [{}, { idempotencyKey: "customer-stable-key" }],
      [{}, { idempotencyKey: "customer-stable-key" }],
    ]);
  });
});

describe("webhook reconciliation", () => {
  it("fetches current state after locking and deduplicates committed event IDs", async () => {
    const h = harness();
    mocks.reconcileCustomer.mockImplementation(() => {
      expect(h.trace.some((sql) => sql.includes("pg_advisory_xact_lock"))).toBe(true);
      expect(h.trace.some((sql) => sql.endsWith("where user_id=$1 for update"))).toBe(true);
      expect(h.state().events).toEqual([]);
      return Promise.resolve([]);
    });
    await processBillingEvent(config, event());
    await processBillingEvent(config, event());
    expect(mocks.reconcileCustomer).toHaveBeenCalledExactlyOnceWith(h.db, h.stripe, userId, customerId, config.priceId);
    expect(h.state().events).toEqual(["evt_new"]);
  });

  it("reconciles a delayed event from current Stripe state without applying its stale object", async () => {
    const h = harness();
    await processBillingEvent(config, event("evt_new"));
    await processBillingEvent(
      config,
      event("evt_delayed", {
        created: 1,
        type: "customer.subscription.deleted",
        data: { object: subscription("canceled") },
      }),
    );
    expect(mocks.reconcileCustomer).toHaveBeenCalledTimes(2);
    expect(mocks.reconcileCustomer).toHaveBeenLastCalledWith(h.db, h.stripe, userId, customerId, config.priceId);
    expect(h.state().events).toEqual(["evt_new", "evt_delayed"]);
  });

  it("rolls back event deduplication when reconciliation fails, allowing a retry", async () => {
    const h = harness();
    mocks.reconcileCustomer.mockRejectedValueOnce(new Error("Stripe unavailable"));
    await expect(processBillingEvent(config, event())).rejects.toThrow("Stripe unavailable");
    expect(h.state().events).toEqual([]);
    await processBillingEvent(config, event());
    expect(h.state().events).toEqual(["evt_new"]);
  });

  it("ignores deleted or unknown customers even when event metadata claims an owner", async () => {
    const h = harness();
    h.state().account = null;
    await processBillingEvent(config, event());
    expect(mocks.reconcileCustomer).not.toHaveBeenCalled();
    expect(h.state().events).toEqual([]);
  });
});

describe("deletion and billing management", () => {
  it("expires a known pending checkout even when Stripe's customer list omits it", async () => {
    const pending = attempt();
    pending.stripe_checkout_session_id = "cs_test_owner";
    const h = harness(pending);
    h.retrieveSession.mockResolvedValueOnce(session()).mockResolvedValue(session({ status: "expired" }));
    h.listSessions.mockReturnValue(list([]));
    await prepareBillingAccountDeletion(config, userId);
    expect(h.expireSession).toHaveBeenCalledExactlyOnceWith("cs_test_owner");
    expect(h.retrieveSession).toHaveBeenCalledTimes(2);
    expect(h.state().account?.cancellation_confirmed_at).toEqual(now);
  });

  it("does not confirm deletion when the known checkout stays open after expiry", async () => {
    const pending = attempt();
    pending.stripe_checkout_session_id = "cs_test_owner";
    const h = harness(pending);
    h.retrieveSession.mockResolvedValue(session());
    h.listSessions.mockReturnValue(list([]));
    await expect(prepareBillingAccountDeletion(config, userId)).rejects.toMatchObject({ code: "billing_unavailable" });
    expect(h.expireSession).toHaveBeenCalledExactlyOnceWith("cs_test_owner");
    expect(h.state().account?.deletion_requested_at).toEqual(now);
    expect(h.state().account?.cancellation_confirmed_at).toBeNull();
    expect(h.listSubscriptions).not.toHaveBeenCalled();
  });

  it("commits the purchase block before Stripe and retains it after a failed cancellation", async () => {
    const h = harness();
    h.listSubscriptions.mockReturnValue(list([subscription()]));
    h.cancelSubscription.mockImplementationOnce(() => {
      expect(h.state().account?.deletion_requested_at).toEqual(now);
      expect(h.trace).toContain("commit");
      return Promise.reject(new Error("Stripe unavailable"));
    });
    await expect(prepareBillingAccountDeletion(config, userId)).rejects.toThrow("Stripe unavailable");
    expect(h.state().account?.deletion_requested_at).toEqual(now);
    expect(h.state().account?.cancellation_confirmed_at).toBeNull();
    await expect(createCheckout(config, userId, "pl")).rejects.toMatchObject({ code: "account_blocked" });
    expect(h.createSession).not.toHaveBeenCalled();
    h.listSubscriptions.mockReturnValueOnce(list([subscription()])).mockReturnValue(list([subscription("canceled")]));
    await prepareBillingAccountDeletion(config, userId);
    expect(h.state().account?.cancellation_confirmed_at).toEqual(now);
    expect(h.cancelSubscription).toHaveBeenCalledWith("sub_owner", { invoice_now: false, prorate: false });
    expect(h.trace.some((sql) => sql.includes("paid_until=null"))).toBe(true);
  });

  it("cancels a subscription when checkout completes concurrently with expiry", async () => {
    const pending = attempt();
    pending.stripe_checkout_session_id = "cs_test_owner";
    const h = harness(pending);
    h.listSessions.mockReturnValue(list([session()]));
    h.expireSession.mockImplementation(() => {
      h.trace.push("stripe:expire");
      return Promise.reject(new Error("already complete"));
    });
    h.retrieveSession.mockResolvedValueOnce(session()).mockImplementation(() => {
      h.trace.push("stripe:checkout-complete");
      return Promise.resolve(session({ status: "complete" }));
    });
    h.listSubscriptions
      .mockImplementationOnce(() => {
        expect(h.trace).toContain("stripe:checkout-complete");
        return list([subscription()]);
      })
      .mockReturnValue(list([subscription("canceled")]));
    await prepareBillingAccountDeletion(config, userId);
    expect(h.cancelSubscription).toHaveBeenCalledWith("sub_owner", { invoice_now: false, prorate: false });
    expect(h.retrieveSubscription).toHaveBeenCalledWith("sub_owner");
    expect(h.state().account?.cancellation_confirmed_at).toEqual(now);
  });

  it("leaves deletion retryable if Stripe still reports an active subscription after cancel", async () => {
    const h = harness();
    h.listSubscriptions.mockReturnValue(list([subscription()]));
    h.retrieveSubscription.mockResolvedValue(subscription());
    await expect(prepareBillingAccountDeletion(config, userId)).rejects.toMatchObject({ code: "billing_unavailable" });
    expect(h.state().account?.deletion_requested_at).toEqual(now);
    expect(h.state().account?.cancellation_confirmed_at).toBeNull();
  });

  it("does not confirm deletion when the final subscription scan finds another live subscription", async () => {
    const h = harness();
    h.listSubscriptions
      .mockReturnValueOnce(list([subscription()]))
      .mockReturnValue(list([subscription("canceled"), { ...subscription(), id: "sub_late" }]));
    await expect(prepareBillingAccountDeletion(config, userId)).rejects.toMatchObject({ code: "billing_unavailable" });
    expect(h.retrieveSubscription).toHaveBeenCalledWith("sub_owner");
    expect(h.state().account?.deletion_requested_at).toEqual(now);
    expect(h.state().account?.cancellation_confirmed_at).toBeNull();
  });

  it("does not confirm deletion while an old checkout attempt remains uncertain", async () => {
    const pending = attempt();
    pending.created_at = new Date(now.getTime() - 25 * 3_600_000);
    const h = harness(pending);
    await expect(prepareBillingAccountDeletion(config, userId)).rejects.toMatchObject({ code: "billing_unavailable" });
    expect(h.state().attempt?.state).toBe("creating");
    expect(h.state().account?.deletion_requested_at).toEqual(now);
    expect(h.state().account?.cancellation_confirmed_at).toBeNull();
  });

  it("cannot restore paid access from a webhook after deletion begins", async () => {
    const h = harness();
    const owner = h.state().account;
    if (owner) owner.deletion_requested_at = now;
    await processBillingEvent(config, event());
    expect(mocks.reconcileCustomer).not.toHaveBeenCalled();
  });

  it("opens only the owner's portal with cancellation at period end, even during deletion", async () => {
    const h = harness();
    const owner = h.state().account;
    if (owner) owner.deletion_requested_at = now;
    expect(await createPortal(config, userId, "pl")).toBe("https://billing.stripe.com/p/session/owner");
    expect(h.createPortalSession).toHaveBeenCalledWith({
      customer: customerId,
      configuration: "bpc_safe",
      return_url: `${config.appUrl}/account/billing`,
      locale: "pl",
    });
    expect(h.createPortalConfig.mock.calls[0]?.[0] as unknown).toMatchObject({
      features: {
        subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
        subscription_update: { enabled: false },
      },
    });
  });
});
