import type Stripe from "stripe";
import type { Client } from "pg";
import { BillingError } from "./config";
import { assertSandbox, boundedStripeList, stripeId } from "./stripe";

export function isPremiumSubscription(sub: Stripe.Subscription, customerId: string, priceId: string) {
  return (
    !sub.livemode &&
    stripeId(sub.customer) === customerId &&
    sub.managed_payments?.enabled === true &&
    sub.items.data.length === 1 &&
    !sub.items.has_more &&
    sub.items.data[0]?.price.id === priceId &&
    sub.items.data[0]?.quantity === 1
  );
}
export function paidInvoicePeriod(
  invoice: Stripe.Invoice,
  lines: Stripe.InvoiceLineItem[],
  subscriptionId: string,
  customerId: string,
  priceId: string,
) {
  if (
    invoice.livemode ||
    stripeId(invoice.customer) !== customerId ||
    stripeId(invoice.parent?.subscription_details?.subscription) !== subscriptionId ||
    invoice.status !== "paid" ||
    invoice.currency !== "pln" ||
    invoice.amount_paid < 4900 ||
    invoice.amount_remaining !== 0 ||
    (invoice.amount_paid_off_stripe ?? 0) > 0 ||
    !["subscription_create", "subscription_cycle"].includes(invoice.billing_reason ?? "")
  )
    return null;
  const periods = lines.filter(
    (line) =>
      line.pricing?.price_details?.price === priceId &&
      stripeId(line.parent?.subscription_item_details?.subscription) === subscriptionId &&
      line.quantity === 1 &&
      line.parent?.subscription_item_details?.proration === false &&
      line.period.end > line.period.start,
  );
  if (periods.length !== 1) return null;
  return periods[0].period.end;
}

export async function reconcileSubscription(
  db: Client,
  stripe: Stripe,
  userId: string,
  customerId: string,
  sub: Stripe.Subscription,
  priceId: string,
) {
  if (!isPremiumSubscription(sub, customerId, priceId)) throw new BillingError("billing_unavailable");
  const invoices = await stripe.invoices.list({ subscription: sub.id, status: "paid", limit: 10 });
  let paidUntil: number | null = null;
  let invoiceId: string | null = null;
  // Recent paid invoices include the latest paid period even after renewal failure.
  // Never infer payment from subscription.status or the success URL.
  for (const invoice of invoices.data) {
    const lines = invoice.lines.has_more
      ? await boundedStripeList(stripe.invoices.listLineItems(invoice.id, { limit: 100 }))
      : invoice.lines.data;
    const end = paidInvoicePeriod(invoice, lines, sub.id, customerId, priceId);
    if (!end || (paidUntil !== null && end <= paidUntil)) continue;
    const payments = await boundedStripeList(
      stripe.invoicePayments.list({ invoice: invoice.id, status: "paid", limit: 100 }),
    );
    const stripePaid = payments
      .filter(
        (p) =>
          !p.livemode &&
          stripeId(p.invoice) === invoice.id &&
          p.currency === "pln" &&
          p.status === "paid" &&
          ["payment_intent", "charge"].includes(p.payment.type),
      )
      .reduce((sum, p) => sum + (p.amount_paid ?? 0), 0);
    if (stripePaid >= 4900) {
      paidUntil = end;
      invoiceId = invoice.id;
    }
  }
  // Managed Payments Portal schedules cancellation with cancel_at in the
  // current API, even when cancel_at_period_end itself remains false.
  const renewalCanceled =
    sub.cancel_at_period_end || (sub.cancel_at != null && !["canceled", "incomplete_expired"].includes(sub.status));
  // Paid access survives ordinary cancellation. Delete flow clears access separately.
  await db.query(
    `insert into private.billing_subscriptions
    (stripe_subscription_id,user_id,stripe_price_id,status,cancel_at_period_end,paid_until,latest_paid_invoice_id)
    values($1,$2,$3,$4,$5,to_timestamp($6),$7)
    on conflict(stripe_subscription_id) do update set status=excluded.status,
      cancel_at_period_end=excluded.cancel_at_period_end,
      paid_until=greatest(private.billing_subscriptions.paid_until,excluded.paid_until),
      latest_paid_invoice_id=case when excluded.paid_until >= coalesce(private.billing_subscriptions.paid_until,'-infinity')
        then excluded.latest_paid_invoice_id else private.billing_subscriptions.latest_paid_invoice_id end,
      updated_at=now()`,
    [sub.id, userId, priceId, sub.status, renewalCanceled, paidUntil, invoiceId],
  );
}
export async function reconcileCustomer(
  db: Client,
  stripe: Stripe,
  userId: string,
  customerId: string,
  priceId: string,
) {
  const subs = await boundedStripeList(stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 }));
  const matching = subs.filter((s) => isPremiumSubscription(s, customerId, priceId));
  // Apply terminal subscriptions first so an earlier canceled purchase does not
  // conflict with the unique live-subscription constraint.
  matching.sort(
    (a, b) =>
      Number(!["canceled", "incomplete_expired"].includes(a.status)) -
      Number(!["canceled", "incomplete_expired"].includes(b.status)),
  );
  for (const sub of matching) {
    assertSandbox(sub);
    await reconcileSubscription(db, stripe, userId, customerId, sub, priceId);
  }
  return subs;
}
