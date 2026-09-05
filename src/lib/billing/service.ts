import type Stripe from "stripe";
import type { Client } from "pg";
import type { Locale } from "@/lib/i18n/locale";
import { BillingError, type BillingConfig } from "./config";
import { billingTransaction, withBillingDatabase } from "./database";
import {
  assertConfiguredPrice,
  assertSandbox,
  boundedStripeList,
  createBillingStripe,
  stripeId,
  validateStripeRedirect,
} from "./stripe";
import { reconcileCustomer } from "./reconcile";

interface BillingAccount {
  user_id: string;
  stripe_customer_id: string | null;
  customer_idempotency_key: string;
  deletion_requested_at: Date | null;
  cancellation_confirmed_at: Date | null;
}
interface CheckoutAttempt {
  id: string;
  user_id: string;
  stripe_checkout_session_id: string | null;
  stripe_idempotency_key: string;
  stripe_price_id: string;
  state: string;
  checkout_url: string | null;
  expires_at: Date;
  created_at: Date;
  success_url: string;
  cancel_url: string;
  locale: Locale;
}
async function lockAccount(db: Client, userId: string): Promise<BillingAccount | undefined> {
  const result = await db.query<BillingAccount>("select * from private.billing_accounts where user_id=$1 for update", [
    userId,
  ]);
  return result.rows[0];
}
async function requirePurchasable(db: Client, userId: string) {
  const result = await db.query<{ allowed: boolean }>("select private.billing_account_can_purchase($1) as allowed", [
    userId,
  ]);
  if (!result.rows[0]?.allowed) throw new BillingError("account_blocked");
}
async function pendingAttempt(db: Client, userId: string): Promise<CheckoutAttempt | undefined> {
  const result = await db.query<CheckoutAttempt>(
    "select * from private.billing_checkout_attempts where user_id=$1 and state in ('creating','open') for update",
    [userId],
  );
  return result.rows[0];
}
async function saveCheckout(
  db: Client,
  attempt: CheckoutAttempt,
  session: Stripe.Checkout.Session,
  customerId: string,
) {
  assertSandbox(session);
  if (
    stripeId(session.customer) !== customerId ||
    session.client_reference_id !== attempt.id ||
    session.mode !== "subscription" ||
    session.managed_payments?.enabled !== true
  )
    throw new BillingError("billing_unavailable");
  const state = session.status === "complete" ? "completed" : session.status === "expired" ? "expired" : "open";
  const url = state === "open" ? validateStripeRedirect(session.url, "checkout") : null;
  await db.query(
    `update private.billing_checkout_attempts set stripe_checkout_session_id=$2,state=$3,checkout_url=$4 where id=$1`,
    [attempt.id, session.id, state, url],
  );
  return { state, url };
}
async function recoverCheckout(stripe: Stripe, attempt: CheckoutAttempt, customerId: string) {
  if (attempt.stripe_checkout_session_id) return stripe.checkout.sessions.retrieve(attempt.stripe_checkout_session_id);
  // Before Stripe may discard an idempotency key, recover by a persisted random
  // attempt reference on the dedicated customer, never retry an expired key.
  if (
    Date.now() - attempt.created_at.getTime() > 23 * 60 * 60 * 1000 ||
    Date.now() >= attempt.expires_at.getTime() - 30 * 60 * 1000
  ) {
    const sessions = await boundedStripeList(stripe.checkout.sessions.list({ customer: customerId, limit: 100 }));
    const existing = sessions.find((s) => s.client_reference_id === attempt.id);
    if (existing) return existing;
    // Absence from a list is not proof that an old timed-out request cannot
    // finish. Never retire an uncertain intent or reuse a pruned key.
    if (Date.now() - attempt.created_at.getTime() > 23 * 60 * 60 * 1000) throw new BillingError("billing_unavailable");
    // Replaying the exact key either recovers the original response or fails
    // closed (including expired params / an operation still running at Stripe).
  }
  return stripe.checkout.sessions.create(
    {
      customer: customerId,
      client_reference_id: attempt.id,
      mode: "subscription",
      line_items: [{ price: attempt.stripe_price_id, quantity: 1 }],
      managed_payments: { enabled: true },
      locale: attempt.locale,
      success_url: attempt.success_url,
      cancel_url: attempt.cancel_url,
      expires_at: Math.floor(attempt.expires_at.getTime() / 1000),
      allow_promotion_codes: false,
    },
    { idempotencyKey: attempt.stripe_idempotency_key },
  );
}
async function closeCheckout(stripe: Stripe, session: Stripe.Checkout.Session) {
  assertSandbox(session);
  if (session.status !== "open") return session;
  // A lost expiry response may still mean Checkout completed or expired.
  // Confirm by the known ID; absence from a customer list is not evidence.
  try {
    await stripe.checkout.sessions.expire(session.id);
  } catch {
    // Retrieval below resolves the outcome without trusting the error payload.
  }
  const terminal = await stripe.checkout.sessions.retrieve(session.id);
  assertSandbox(terminal);
  if (!["complete", "expired"].includes(terminal.status ?? "")) throw new BillingError("billing_unavailable");
  return terminal;
}
export async function createCheckout(config: BillingConfig, userId: string, locale: Locale) {
  const stripe = createBillingStripe(config);
  await assertConfiguredPrice(stripe, config.priceId);
  return withBillingDatabase(config, async (db) => {
    // Persist customer intent before Stripe. If its response is lost, the key
    // is reused. A Checkout intent is only recorded after customer ID commits.
    await billingTransaction(db, userId, async () => {
      await requirePurchasable(db, userId);
      await db.query("insert into private.billing_accounts(user_id) values($1) on conflict do nothing", [userId]);
    });
    await billingTransaction(db, userId, async () => {
      await requirePurchasable(db, userId);
      const account = await lockAccount(db, userId);
      if (!account) throw new BillingError("billing_unavailable");
      if (!account.stripe_customer_id) {
        const customer = await stripe.customers.create({}, { idempotencyKey: account.customer_idempotency_key });
        assertSandbox(customer);
        await db.query("update private.billing_accounts set stripe_customer_id=$2 where user_id=$1", [
          userId,
          customer.id,
        ]);
      }
    });
    await billingTransaction(db, userId, async () => {
      await requirePurchasable(db, userId);
      const account = await lockAccount(db, userId);
      if (!account?.stripe_customer_id) throw new BillingError("billing_unavailable");
      if (await pendingAttempt(db, userId)) return;
      const subs = await reconcileCustomer(db, stripe, userId, account.stripe_customer_id, config.priceId);
      if (subs.some((s) => !["canceled", "incomplete_expired"].includes(s.status)))
        throw new BillingError("subscription_exists");
      await db.query(
        `insert into private.billing_checkout_attempts(user_id,stripe_price_id,success_url,cancel_url,locale,expires_at)
        values($1,$2,$3,$4,$5,date_trunc('second',now())+interval '1 hour')`,
        [
          userId,
          config.priceId,
          `${config.appUrl}/account/billing?checkout=success`,
          `${config.appUrl}/account/billing?checkout=canceled`,
          locale,
        ],
      );
    });
    const result = await billingTransaction(db, userId, async () => {
      await requirePurchasable(db, userId);
      const account = await lockAccount(db, userId),
        attempt = await pendingAttempt(db, userId);
      if (!account?.stripe_customer_id || !attempt) throw new BillingError("billing_unavailable");
      const session = await recoverCheckout(stripe, attempt, account.stripe_customer_id);
      const saved = await saveCheckout(db, attempt, session, account.stripe_customer_id);
      return saved.url;
    });
    // Returning to billing after a completed/expired session never grants access.
    return result ?? `${config.appUrl}/account/billing?checkout=success`;
  });
}
export async function createPortal(config: BillingConfig, userId: string, locale: Locale) {
  const stripe = createBillingStripe(config);
  return withBillingDatabase(config, (db) =>
    billingTransaction(db, userId, async () => {
      const account = await lockAccount(db, userId);
      if (!account?.stripe_customer_id) throw new BillingError("billing_unavailable");
      // Pin a configuration per call; no dependency on account-wide portal defaults
      // that could accidentally enable upgrades, coupons, or immediate cancellation.
      const portalConfig = await stripe.billingPortal.configurations.create(
        {
          business_profile: { headline: "SafeSpace Premium" },
          default_return_url: `${config.appUrl}/account/billing`,
          features: {
            customer_update: { enabled: false },
            invoice_history: { enabled: true },
            payment_method_update: { enabled: true },
            subscription_update: { enabled: false },
            subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
          },
        },
        { idempotencyKey: `safespace-portal-v1-${new URL(config.appUrl).host}` },
      );
      assertSandbox(portalConfig);
      const session = await stripe.billingPortal.sessions.create({
        customer: account.stripe_customer_id,
        configuration: portalConfig.id,
        return_url: `${config.appUrl}/account/billing`,
        locale,
      });
      return validateStripeRedirect(session.url, "portal");
    }),
  );
}
export async function processBillingEvent(config: BillingConfig, event: Stripe.Event) {
  assertSandbox(event);
  if (
    !/^(checkout\.session\.(completed|expired|async_payment_succeeded|async_payment_failed)|customer\.subscription\.(created|updated|deleted)|invoice\.(paid|payment_succeeded|payment_failed|payment_action_required))$/.test(
      event.type,
    )
  )
    return;
  const object = event.data.object;
  const customerId = "customer" in object ? stripeId(object.customer) : null;
  if (!customerId) return;
  const stripe = createBillingStripe(config);
  await withBillingDatabase(config, async (db) => {
    const found = await db.query<{ user_id: string }>(
      "select user_id from private.billing_accounts where stripe_customer_id=$1",
      [customerId],
    );
    const userId = (found.rows[0] as { user_id: string } | undefined)?.user_id;
    // Unknown or erased customers cannot resurrect accounts from metadata.
    if (!userId) return;
    await billingTransaction(db, userId, async () => {
      const account = await lockAccount(db, userId);
      if (!account || account.deletion_requested_at) return;
      if ((await db.query("select 1 from private.billing_events where stripe_event_id=$1", [event.id])).rowCount)
        return;
      const pending = await pendingAttempt(db, userId);
      if (pending) {
        const sessions = await boundedStripeList(stripe.checkout.sessions.list({ customer: customerId, limit: 100 }));
        const session = sessions.find((s) => s.client_reference_id === pending.id);
        if (session) await saveCheckout(db, pending, await stripe.checkout.sessions.retrieve(session.id), customerId);
      }
      // Fetch current Stripe state AFTER acquiring the lock; old and duplicate
      // events can never overwrite a newer reconciliation with their payload.
      await reconcileCustomer(db, stripe, userId, customerId, config.priceId);
      await db.query("insert into private.billing_events(stripe_event_id,user_id,event_type) values($1,$2,$3)", [
        event.id,
        userId,
        event.type,
      ]);
    });
  });
}
export async function prepareBillingAccountDeletion(config: BillingConfig, userId: string) {
  const stripe = createBillingStripe(config);
  await withBillingDatabase(config, async (db) => {
    // Commit the tombstone independently of Stripe. A failed cancellation leaves
    // deletion retryable while every future purchase is durably refused.
    const hasBilling = await billingTransaction(db, userId, async () => {
      const account = await lockAccount(db, userId);
      if (!account) return false;
      await db.query(
        "update private.billing_accounts set deletion_requested_at=coalesce(deletion_requested_at,now()) where user_id=$1",
        [userId],
      );
      return true;
    });
    if (!hasBilling) return;
    await billingTransaction(db, userId, async () => {
      const account = await lockAccount(db, userId);
      if (!account || account.cancellation_confirmed_at) return;
      const customerId = account.stripe_customer_id;
      const pending = await pendingAttempt(db, userId);
      if (pending && !customerId) throw new BillingError("billing_unavailable");
      if (customerId) {
        if (pending) {
          const recovered = await recoverCheckout(stripe, pending, customerId);
          await saveCheckout(db, pending, await closeCheckout(stripe, recovered), customerId);
        }
        const sessions = await boundedStripeList(stripe.checkout.sessions.list({ customer: customerId, limit: 100 }));
        for (const session of sessions) {
          await closeCheckout(stripe, session);
        }
        // Checkout may complete concurrently with expiry. Subscriptions are read
        // only after every session is terminal, then canceled and re-read.
        const subs = await boundedStripeList(
          stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 }),
        );
        for (const sub of subs) {
          assertSandbox(sub);
          if (!["canceled", "incomplete_expired"].includes(sub.status)) {
            await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
            if ((await stripe.subscriptions.retrieve(sub.id)).status !== "canceled")
              throw new BillingError("billing_unavailable");
          }
        }
        const remaining = await boundedStripeList(
          stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 }),
        );
        if (remaining.some((s) => !["canceled", "incomplete_expired"].includes(s.status)))
          throw new BillingError("billing_unavailable");
      }
      await db.query(
        "update private.billing_checkout_attempts set state='expired',checkout_url=null where user_id=$1 and state in ('creating','open')",
        [userId],
      );
      await db.query(
        "update private.billing_subscriptions set status='canceled',paid_until=null,latest_paid_invoice_id=null,cancel_at_period_end=false where user_id=$1",
        [userId],
      );
      await db.query("update private.billing_accounts set cancellation_confirmed_at=now() where user_id=$1", [userId]);
    });
  });
}
