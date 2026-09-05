import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "./database-fixture.mjs";

describe("Billing authorization and expiry against real PostgreSQL", () => {
  let db;
  before(
    async () => {
      db = await startDatabase();
    },
    { timeout: 120_000 },
  );
  after(async () => {
    if (db) await db.stop();
  });

  const account = async () => {
    const owner = await db.owner();
    const billing = await db.billing();
    await billing.query("insert into private.billing_accounts(user_id, stripe_customer_id) values ($1, $2)", [
      owner.userId,
      `cus_${randomUUID()}`,
    ]);
    return { ...owner, billing };
  };
  const paid = async (owner, until = "now() + interval '1 month'") => {
    const id = `sub_${randomUUID()}`;
    await owner.billing.query(
      `insert into private.billing_subscriptions(stripe_subscription_id,user_id,stripe_price_id,status,paid_until,latest_paid_invoice_id)
      values ($1,$2,'price_test','active',${until},$3)`,
      [id, owner.userId, `in_${randomUUID()}`],
    );
    return id;
  };
  const checkout = (client, userId) =>
    client.query(
      `insert into private.billing_checkout_attempts
    (user_id,stripe_price_id,success_url,cancel_url,locale,expires_at)
    values ($1,'price_test','http://localhost:4321/account/billing?checkout=success','http://localhost:4321/account/billing','pl',now()+interval '30 minutes') returning id`,
      [userId],
    );
  const premium = async (owner) =>
    (await owner.client.query("select effective_premium from public.account_access where user_id=$1", [owner.userId]))
      .rows[0]?.effective_premium;

  it("permits an active account's first purchase before the billing row is provisioned and refuses blocked users", async () => {
    const owner = await db.owner();
    const billing = await db.billing();
    assert.equal(
      (await billing.query("select private.billing_account_can_purchase($1) as allowed", [owner.userId])).rows[0]
        .allowed,
      true,
    );
    await db.admin.query(
      "update public.admin_user_profiles set blocked_at=now(), block_reason_code='owner_request' where user_id=$1",
      [owner.userId],
    );
    assert.equal(
      (await billing.query("select private.billing_account_can_purchase($1) as allowed", [owner.userId])).rows[0]
        .allowed,
      false,
    );
    assert.equal(
      (await billing.query("select private.billing_account_can_purchase($1) as allowed", [randomUUID()])).rows[0]
        .allowed,
      false,
    );
  });

  it("keeps billing writes and Stripe identifiers inaccessible to owners and session content inaccessible to the billing role", async () => {
    const owner = await account();
    const stranger = await db.owner();
    await paid(owner);
    assert.equal(
      (await owner.client.query("select paid_premium_active,has_customer from public.billing_status")).rows[0]
        .paid_premium_active,
      true,
    );
    assert.equal((await stranger.client.query("select * from public.billing_status")).rowCount, 0);
    assert.equal(
      (await stranger.client.query("select * from public.account_access where user_id=$1", [owner.userId])).rowCount,
      0,
    );
    for (const table of ["billing_accounts", "billing_subscriptions", "billing_checkout_attempts", "billing_events"]) {
      await assert.rejects(owner.client.query(`select * from private.${table}`), { code: "42501" });
    }
    await assert.rejects(
      owner.client.query("update public.billing_entitlements set paid_until=now()+interval '1 year'"),
      { code: "42501" },
    );
    await assert.rejects(owner.client.query("select private.billing_account_can_purchase($1)", [stranger.userId]), {
      code: "42501",
    });
    await assert.rejects(owner.billing.query("select content from public.session_messages"), { code: "42501" });
    await assert.rejects(owner.billing.query("select summary_text from public.session_summaries"), { code: "42501" });
    await assert.rejects(owner.billing.query("update public.admin_user_profiles set premium_granted_at=now()"), {
      code: "42501",
    });
    await assert.rejects(owner.billing.query("delete from private.billing_accounts where user_id=$1", [owner.userId]), {
      code: "42501",
    });
  });

  it("requires a paid invoice, grants the fourth 60-minute session, and expires by DB time while a started session keeps its budget", async () => {
    const owner = await account();
    for (let i = 0; i < 3; i += 1)
      await owner.client.query("insert into public.therapy_sessions(user_id,duration_bucket_seconds) values ($1,900)", [
        owner.userId,
      ]);
    await assert.rejects(
      owner.client.query("insert into public.therapy_sessions(user_id,duration_bucket_seconds) values ($1,900)", [
        owner.userId,
      ]),
      { code: "P0005" },
    );
    await assert.rejects(
      owner.billing.query(
        "insert into private.billing_subscriptions(stripe_subscription_id,user_id,stripe_price_id,status,paid_until) values ('sub_bad',$1,'price_test','active',now()+interval '1 day')",
        [owner.userId],
      ),
      { code: "23514" },
    );
    const id = await paid(owner);
    assert.equal(await premium(owner), true);
    const session = (
      await owner.client.query(
        "insert into public.therapy_sessions(user_id,duration_bucket_seconds) values ($1,3600) returning id",
        [owner.userId],
      )
    ).rows[0].id;
    await owner.client.query(
      "update public.therapy_sessions set status='active',started_at=now(),expires_at=now()+interval '1 hour' where id=$1",
      [session],
    );
    await owner.billing.query(
      "update private.billing_subscriptions set paid_until=now()-interval '1 second',status='past_due' where stripe_subscription_id=$1",
      [id],
    );
    assert.equal(await premium(owner), false);
    assert.equal(
      (await owner.client.query("select paid_premium_active from public.billing_status")).rows[0].paid_premium_active,
      false,
    );
    await owner.client.query("update public.therapy_sessions set status='completed' where id=$1", [session]);
    assert.equal(
      (
        await owner.client.query(
          "select duration_bucket_seconds,extract(epoch from expires_at-started_at)::int as seconds from public.therapy_sessions where id=$1",
          [session],
        )
      ).rows[0].seconds,
      3600,
    );
    await assert.rejects(
      owner.client.query("insert into public.therapy_sessions(user_id,duration_bucket_seconds) values ($1,3600)", [
        owner.userId,
      ]),
      { code: "P0006" },
    );
  });

  it("expires a paid entitlement as database time passes without another webhook", async () => {
    const owner = await account();
    await paid(owner, "clock_timestamp() + interval '200 milliseconds'");
    assert.equal(await premium(owner), true);
    await owner.client.query("select pg_sleep(0.25)");
    assert.equal(await premium(owner), false);
  });

  it("retains paid access after ordinary cancellation and manual premium after payment expiry", async () => {
    const owner = await account();
    const id = await paid(owner);
    await owner.billing.query(
      "update private.billing_subscriptions set cancel_at_period_end=true where stripe_subscription_id=$1",
      [id],
    );
    assert.equal(await premium(owner), true);
    await db.admin.query("update public.admin_user_profiles set premium_granted_at=now() where user_id=$1", [
      owner.userId,
    ]);
    await owner.billing.query(
      "update private.billing_subscriptions set paid_until=now()-interval '1 day',status='canceled' where stripe_subscription_id=$1",
      [id],
    );
    assert.equal(await premium(owner), true);
    const row = (await owner.client.query("select * from public.account_access")).rows[0];
    assert.ok(row.premium_granted_at);
    await db.admin.query("update public.admin_user_profiles set premium_granted_at=null where user_id=$1", [
      owner.userId,
    ]);
    assert.equal(await premium(owner), false);
  });

  it("uses the same paid premium rule in admin filters, aggregates and mutation replies", async () => {
    const owner = await account();
    const admin = await db.owner();
    await db.admin.query("insert into public.admin_users(user_id,is_active) values ($1,true)", [admin.userId]);
    await paid(owner);
    const args = [`${owner.userId}@example.test`, "all", "created_desc", 1, 20, "premium"];
    const rows = (await admin.client.query("select * from public.list_private_admin_users_v2($1,$2,$3,$4,$5,$6)", args))
      .rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].effective_premium, true);
    assert.equal(rows[0].premium_granted_at, null);
    const mutation = (
      await admin.client.query(
        "select public.set_private_admin_user_plan_state($1,'revoke','owner_request') as result",
        [owner.userId],
      )
    ).rows[0].result;
    assert.equal(mutation.profile.effective_premium, true);
    assert.equal(mutation.profile.premium_granted_at, null);
    const overview = (await admin.client.query("select public.get_private_admin_overview() as result")).rows[0].result;
    assert.ok(overview.premiumUsers > 0);
    assert.equal(
      (
        await admin.client.query(
          "select * from public.list_private_admin_users($1,$2,$3,$4,$5,'free')",
          args.slice(0, 5),
        )
      ).rowCount,
      0,
    );
  });

  it("serializes concurrent checkout reservations and prevents duplicate live subscriptions", async () => {
    const owner = await account();
    const second = await db.billing();
    const outcomes = await Promise.allSettled([checkout(owner.billing, owner.userId), checkout(second, owner.userId)]);
    assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(outcomes.find((r) => r.status === "rejected").reason.code, "23505");
    assert.equal(
      (await owner.client.query("select pending_checkout from public.billing_status")).rows[0].pending_checkout,
      true,
    );
    await paid(owner);
    await assert.rejects(paid(owner), { code: "23505" });
  });

  it("pins subscription ownership and checkout recovery parameters", async () => {
    const owner = await account();
    const stranger = await account();
    await checkout(owner.billing, owner.userId);
    await assert.rejects(
      owner.billing.query(
        "update private.billing_checkout_attempts set stripe_price_id='price_other' where user_id=$1",
        [owner.userId],
      ),
      { code: "P0010" },
    );
    await assert.rejects(
      owner.billing.query("update private.billing_checkout_attempts set user_id=$2 where user_id=$1", [
        owner.userId,
        stranger.userId,
      ]),
      { code: "P0010" },
    );
    const id = await paid(owner);
    await assert.rejects(
      owner.billing.query("update private.billing_subscriptions set user_id=$2 where stripe_subscription_id=$1", [
        id,
        stranger.userId,
      ]),
      { code: "P0010" },
    );
  });

  it("commits event deduplication with entitlement changes, including rollback", async () => {
    const owner = await account();
    const id = `evt_${randomUUID()}`;
    await owner.billing.query("begin");
    await paid(owner);
    await owner.billing.query(
      "insert into private.billing_events(stripe_event_id,user_id,event_type) values ($1,$2,'invoice.paid')",
      [id, owner.userId],
    );
    await owner.billing.query("rollback");
    assert.equal(await premium(owner), false);
    await owner.billing.query("begin");
    await paid(owner);
    await owner.billing.query(
      "insert into private.billing_events(stripe_event_id,user_id,event_type) values ($1,$2,'invoice.paid')",
      [id, owner.userId],
    );
    await owner.billing.query("commit");
    assert.equal(await premium(owner), true);
    await assert.rejects(
      owner.billing.query(
        "insert into private.billing_events(stripe_event_id,user_id,event_type) values ($1,$2,'invoice.paid')",
        [id, owner.userId],
      ),
      { code: "23505" },
    );
  });

  it("requires durable cancellation before direct RPC deletion and permits retries after Stripe failure", async () => {
    const owner = await account();
    const id = await paid(owner);
    await assert.rejects(owner.client.query("select public.delete_own_account('USUWAM')"), { code: "P0010" });
    await owner.billing.query("update private.billing_accounts set deletion_requested_at=now() where user_id=$1", [
      owner.userId,
    ]);
    await assert.rejects(checkout(owner.billing, owner.userId), { code: "P0010" });
    await assert.rejects(
      owner.billing.query("update private.billing_accounts set cancellation_confirmed_at=now() where user_id=$1", [
        owner.userId,
      ]),
      { code: "P0010" },
    );
    await assert.rejects(owner.client.query("select public.delete_own_account('USUWAM')"), { code: "P0010" });
    await owner.billing.query(
      "update private.billing_subscriptions set status='canceled' where stripe_subscription_id=$1",
      [id],
    );
    await owner.billing.query("update private.billing_accounts set cancellation_confirmed_at=now() where user_id=$1", [
      owner.userId,
    ]);
    assert.equal(
      (await owner.client.query("select public.delete_own_account('USUWAM') as deleted")).rows[0].deleted,
      true,
    );
    assert.equal(
      (await owner.billing.query("select * from private.billing_accounts where user_id=$1", [owner.userId])).rowCount,
      0,
    );
  });

  it("blocks deletion on unresolved checkout and never permits an immutable deletion flag to be cleared", async () => {
    const owner = await account();
    await checkout(owner.billing, owner.userId);
    await owner.billing.query("update private.billing_accounts set deletion_requested_at=now() where user_id=$1", [
      owner.userId,
    ]);
    await assert.rejects(
      owner.billing.query("update private.billing_accounts set deletion_requested_at=null where user_id=$1", [
        owner.userId,
      ]),
      { code: "P0010" },
    );
    await assert.rejects(
      owner.billing.query("update private.billing_accounts set cancellation_confirmed_at=now() where user_id=$1", [
        owner.userId,
      ]),
      { code: "P0010" },
    );
    await owner.billing.query("update private.billing_checkout_attempts set state='expired' where user_id=$1", [
      owner.userId,
    ]);
    await owner.billing.query("update private.billing_accounts set cancellation_confirmed_at=now() where user_id=$1", [
      owner.userId,
    ]);
    assert.equal(
      (await owner.client.query("select public.delete_own_account('USUWAM') as deleted")).rows[0].deleted,
      true,
    );
  });

  it("serializes first billing-account creation with deletion even before a billing row exists", async () => {
    const owner = await db.owner();
    const billing = await db.billing();
    await owner.client.query("begin");
    await owner.client.query("select public.delete_own_account('USUWAM')");
    const pending = billing.query("insert into private.billing_accounts(user_id) values ($1)", [owner.userId]).then(
      () => null,
      (error) => error,
    );
    await db.waitForLock(billing);
    await owner.client.query("commit");
    assert.equal((await pending).code, "23503");
  });

  it("serializes deletion behind a first checkout intent and observes the new account", async () => {
    const owner = await db.owner();
    const billing = await db.billing();
    await billing.query("begin");
    await billing.query("insert into private.billing_accounts(user_id) values ($1)", [owner.userId]);
    await checkout(billing, owner.userId);
    const pending = owner.client.query("select public.delete_own_account('USUWAM')").then(
      () => null,
      (error) => error,
    );
    await db.waitForLock(owner.client);
    await billing.query("commit");
    assert.equal((await pending).code, "P0010");
    assert.equal((await db.admin.query("select 1 from auth.users where id=$1", [owner.userId])).rowCount, 1);
  });
});
