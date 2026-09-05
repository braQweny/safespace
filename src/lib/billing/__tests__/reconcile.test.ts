import { describe, expect, it, vi } from "vitest";
import type { Client } from "pg";
import type Stripe from "stripe";

vi.mock("astro:env/server", () => ({ getSecret: vi.fn() }));

const { isPremiumSubscription, paidInvoicePeriod, reconcileCustomer, reconcileSubscription } =
  await import("../reconcile");

const userId = "owner";
const customerId = "cus_owner";
const priceId = "price_premium";
const periodStart = 1_788_566_400;
const periodEnd = periodStart + 30 * 86_400;

function subscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_owner",
    livemode: false,
    customer: customerId,
    status: "active",
    cancel_at_period_end: false,
    managed_payments: { enabled: true },
    items: { data: [{ price: { id: priceId }, quantity: 1 }], has_more: false },
    ...overrides,
  } as Stripe.Subscription;
}

function line(overrides: Partial<Stripe.InvoiceLineItem> = {}): Stripe.InvoiceLineItem {
  return {
    id: "il_owner",
    pricing: { type: "price_details", price_details: { price: priceId, product: "prod_premium" } },
    quantity: 1,
    period: { start: periodStart, end: periodEnd },
    parent: {
      type: "subscription_item_details",
      subscription_item_details: { proration: false, subscription: "sub_owner" },
    },
    ...overrides,
  } as Stripe.InvoiceLineItem;
}

function invoice(overrides: Partial<Stripe.Invoice> = {}): Stripe.Invoice {
  return {
    id: "in_paid",
    livemode: false,
    customer: customerId,
    parent: { subscription_details: { subscription: "sub_owner" } },
    status: "paid",
    currency: "pln",
    amount_paid: 4900,
    amount_remaining: 0,
    amount_paid_off_stripe: 0,
    billing_reason: "subscription_cycle",
    lines: { data: [line()], has_more: false },
    ...overrides,
  } as Stripe.Invoice;
}

function payment(overrides: Partial<Stripe.InvoicePayment> = {}): Stripe.InvoicePayment {
  return {
    id: "inpay_owner",
    livemode: false,
    invoice: "in_paid",
    currency: "pln",
    status: "paid",
    payment: { type: "payment_intent", payment_intent: "pi_owner" },
    amount_paid: 4900,
    ...overrides,
  } as Stripe.InvoicePayment;
}

function list<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      const iterator = items[Symbol.iterator]();
      return { next: () => Promise.resolve(iterator.next()) };
    },
  };
}

function harness(invoices: Stripe.Invoice[] = [invoice()], payments: Stripe.InvoicePayment[] = [payment()]) {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
  const listInvoices = vi.fn().mockResolvedValue({ data: invoices });
  const listPayments = vi.fn().mockReturnValue(list(payments));
  const listLineItems = vi.fn().mockReturnValue(list([line()]));
  const listSubscriptions = vi.fn().mockReturnValue(list([subscription()]));
  const stripe = {
    invoices: { list: listInvoices, listLineItems },
    invoicePayments: { list: listPayments },
    subscriptions: { list: listSubscriptions },
  } as unknown as Stripe;
  return {
    db: { query } as unknown as Client,
    query,
    stripe,
    listInvoices,
    listPayments,
    listLineItems,
    listSubscriptions,
  };
}

describe("premium subscription identity", () => {
  it("requires the dedicated sandbox customer, one configured price and Managed Payments", () => {
    expect(isPremiumSubscription(subscription(), customerId, priceId)).toBe(true);
    expect(isPremiumSubscription(subscription({ customer: "cus_other" }), customerId, priceId)).toBe(false);
    expect(isPremiumSubscription(subscription(), customerId, "price_other")).toBe(false);
    expect(isPremiumSubscription(subscription({ livemode: true }), customerId, priceId)).toBe(false);
    expect(isPremiumSubscription(subscription({ managed_payments: { enabled: false } }), customerId, priceId)).toBe(
      false,
    );
    const multiItem = subscription();
    multiItem.items.data.push(multiItem.items.data[0]);
    expect(isPremiumSubscription(multiItem, customerId, priceId)).toBe(false);
    const truncated = subscription();
    truncated.items.has_more = true;
    expect(isPremiumSubscription(truncated, customerId, priceId)).toBe(false);
  });

  it("rejects a foreign subscription before reading invoices or writing an entitlement", async () => {
    const h = harness();
    await expect(
      reconcileSubscription(h.db, h.stripe, userId, customerId, subscription({ customer: "cus_other" }), priceId),
    ).rejects.toMatchObject({ code: "billing_unavailable" });
    expect(h.listInvoices).not.toHaveBeenCalled();
    expect(h.query).not.toHaveBeenCalled();
  });
});

describe("paid invoice evidence", () => {
  it("returns the invoiced period for a full recurring PLN payment", () => {
    expect(paidInvoicePeriod(invoice(), [line()], "sub_owner", customerId, priceId)).toBe(periodEnd);
  });

  it.each([
    { status: "open" },
    { amount_paid: 0 },
    { amount_paid: 4899 },
    { amount_remaining: 1 },
    { amount_paid_off_stripe: 4900 },
    { currency: "eur" },
    { billing_reason: "manual" },
    { customer: "cus_other" },
    { livemode: true },
  ] satisfies Partial<Stripe.Invoice>[])("rejects an unpaid, unrelated or unsupported invoice: %j", (overrides) => {
    expect(paidInvoicePeriod(invoice(overrides), [line()], "sub_owner", customerId, priceId)).toBeNull();
  });

  it("rejects a wrong subscription, wrong price and duplicate or prorated premium lines", () => {
    expect(paidInvoicePeriod(invoice(), [line()], "sub_other", customerId, priceId)).toBeNull();
    expect(paidInvoicePeriod(invoice(), [line()], "sub_owner", customerId, "price_other")).toBeNull();
    expect(paidInvoicePeriod(invoice(), [line(), line()], "sub_owner", customerId, priceId)).toBeNull();
    const prorated = line();
    if (prorated.parent?.subscription_item_details) prorated.parent.subscription_item_details.proration = true;
    expect(paidInvoicePeriod(invoice(), [prorated], "sub_owner", customerId, priceId)).toBeNull();
  });

  it("rejects a foreign subscription in the current Stripe invoice line parent", () => {
    const foreign = line();
    if (foreign.parent?.subscription_item_details) foreign.parent.subscription_item_details.subscription = "sub_other";
    expect(paidInvoicePeriod(invoice(), [foreign], "sub_owner", customerId, priceId)).toBeNull();
  });

  it.each([
    { payments: [] },
    { payments: [payment({ amount_paid: 4899 })] },
    { payments: [payment({ invoice: "in_other" })] },
    { payments: [payment({ currency: "eur" })] },
    { payments: [payment({ status: "open" })] },
    { payments: [payment({ livemode: true })] },
    { payments: [payment({ payment: { type: "payment_record" } })] },
  ])("does not grant premium from invoice.status alone (payment evidence %#)", async ({ payments }) => {
    const h = harness([invoice()], payments);
    await reconcileSubscription(h.db, h.stripe, userId, customerId, subscription(), priceId);
    expect(h.query).toHaveBeenCalledWith(expect.any(String), [
      "sub_owner",
      userId,
      priceId,
      "active",
      false,
      null,
      null,
    ]);
  });

  it("does not infer paid access from an active subscription without an invoice", async () => {
    const h = harness([]);
    await reconcileSubscription(h.db, h.stripe, userId, customerId, subscription(), priceId);
    expect(h.query).toHaveBeenCalledWith(expect.any(String), [
      "sub_owner",
      userId,
      priceId,
      "active",
      false,
      null,
      null,
    ]);
    expect(h.listPayments).not.toHaveBeenCalled();
  });

  it.each(["active", "past_due", "canceled"] as const)(
    "preserves the paid period for %s, including canceled renewal",
    async (status) => {
      const h = harness();
      await reconcileSubscription(
        h.db,
        h.stripe,
        userId,
        customerId,
        subscription({ status, cancel_at_period_end: true }),
        priceId,
      );
      expect(h.query).toHaveBeenCalledWith(expect.any(String), [
        "sub_owner",
        userId,
        priceId,
        status,
        true,
        periodEnd,
        "in_paid",
      ]);
    },
  );

  it("recognizes the portal's cancel_at timestamp while retaining the last paid period", async () => {
    const h = harness();
    // Managed Payments portal snapshot: the explicit date is populated, while
    // cancel_at_period_end stays false even though renewal has been canceled.
    const scheduled = subscription({
      status: "past_due",
      cancel_at_period_end: false,
      cancel_at: periodEnd,
      canceled_at: periodStart,
    });
    scheduled.items.data[0].current_period_end = periodEnd;
    await reconcileSubscription(h.db, h.stripe, userId, customerId, scheduled, priceId);
    expect(h.query).toHaveBeenCalledWith(expect.any(String), [
      "sub_owner",
      userId,
      priceId,
      "past_due",
      true,
      periodEnd,
      "in_paid",
    ]);
  });

  it("does not label an already canceled subscription as awaiting scheduled cancellation", async () => {
    const h = harness();
    await reconcileSubscription(
      h.db,
      h.stripe,
      userId,
      customerId,
      subscription({
        status: "canceled",
        cancel_at_period_end: false,
        cancel_at: periodEnd,
        canceled_at: periodStart,
      }),
      priceId,
    );
    expect(h.query).toHaveBeenCalledWith(expect.any(String), [
      "sub_owner",
      userId,
      priceId,
      "canceled",
      false,
      periodEnd,
      "in_paid",
    ]);
  });

  it("reads all invoice lines and chooses the latest paid period without trusting invoice order", async () => {
    const older = invoice({ id: "in_older" });
    const newer = invoice({ id: "in_newer" });
    newer.lines.data = [line({ period: { start: periodEnd, end: periodEnd + 30 * 86_400 } })];
    older.lines.has_more = true;
    const h = harness([newer, older], [payment({ invoice: "in_newer" })]);
    await reconcileSubscription(h.db, h.stripe, userId, customerId, subscription(), priceId);
    expect(h.listLineItems).toHaveBeenCalledWith("in_older", { limit: 100 });
    expect(h.query).toHaveBeenCalledWith(expect.any(String), [
      "sub_owner",
      userId,
      priceId,
      "active",
      false,
      periodEnd + 30 * 86_400,
      "in_newer",
    ]);
  });

  it("reconciles terminal subscriptions before the replacement subscription and ignores foreign prices", async () => {
    const h = harness([]);
    const terminal = subscription({ id: "sub_old", status: "canceled" });
    const foreign = subscription({ id: "sub_foreign" });
    foreign.items.data[0].price.id = "price_other";
    h.listSubscriptions.mockReturnValue(list([subscription(), foreign, terminal]));
    await reconcileCustomer(h.db, h.stripe, userId, customerId, priceId);
    expect(h.listInvoices.mock.calls.map(([params]) => (params as { subscription: string }).subscription)).toEqual([
      "sub_old",
      "sub_owner",
    ]);
    expect(h.query).toHaveBeenCalledTimes(2);
  });
});
