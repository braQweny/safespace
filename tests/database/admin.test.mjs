import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "./database-fixture.mjs";

describe("Admin mutations against all migrations in real PostgreSQL", () => {
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

  async function activeAdmin() {
    const admin = await db.owner();
    await db.admin.query("insert into public.admin_users(user_id, is_active) values ($1, true)", [admin.userId]);
    return admin;
  }

  async function profile(userId) {
    const { rows } = await db.admin.query(
      "select blocked_at, premium_granted_at from public.admin_user_profiles where user_id = $1",
      [userId],
    );
    return rows[0];
  }

  async function auditCount(userId) {
    const { rows } = await db.admin.query(
      "select count(*)::int as n from public.admin_audit_events where target_user_id = $1",
      [userId],
    );
    return rows[0].n;
  }

  it("refuses an admin blocking or changing the plan of their own account through the RPC", async () => {
    const admin = await activeAdmin();

    await assert.rejects(
      admin.client.query("select public.set_private_admin_user_block_state($1, 'block', 'other')", [admin.userId]),
      { code: "P0017", message: "admin_self_target_forbidden" },
    );
    await assert.rejects(
      admin.client.query("select public.set_private_admin_user_plan_state($1, 'grant', 'other')", [admin.userId]),
      { code: "P0017", message: "admin_self_target_forbidden" },
    );
    // Neither the profile nor the audit log moved: the lockout never happened.
    assert.deepEqual(await profile(admin.userId), { blocked_at: null, premium_granted_at: null });
    assert.equal(await auditCount(admin.userId), 0);
    // Still an active admin who can act.
    const { rows } = await admin.client.query("select public.is_private_admin() as active");
    assert.equal(rows[0].active, true);
  });

  it("still lets an admin block, unblock and change the plan of another account, audited", async () => {
    const admin = await activeAdmin();
    const target = await db.owner();

    const blocked = (
      await admin.client.query(
        "select public.set_private_admin_user_block_state($1, 'block', 'policy_violation') as r",
        [target.userId],
      )
    ).rows[0].r;
    assert.ok(blocked.profile.blocked_at);
    assert.equal(blocked.auditEvent.action, "account_blocked");
    await admin.client.query("select public.set_private_admin_user_block_state($1, 'unblock', 'owner_request')", [
      target.userId,
    ]);
    const granted = (
      await admin.client.query("select public.set_private_admin_user_plan_state($1, 'grant', 'other') as r", [
        target.userId,
      ])
    ).rows[0].r;
    assert.equal(granted.profile.effective_premium, true);
    assert.equal(await auditCount(target.userId), 3);
  });

  it("keeps the non-admin and anon gates in front of the self-target check", async () => {
    const owner = await db.owner();
    await assert.rejects(
      owner.client.query("select public.set_private_admin_user_block_state($1, 'block', 'other')", [owner.userId]),
      { code: "42501" },
    );
    const { rows } = await db.admin.query(
      `select has_function_privilege('anon', 'public.set_private_admin_user_block_state(uuid, text, text)', 'execute') as block_anon,
              has_function_privilege('anon', 'public.set_private_admin_user_plan_state(uuid, text, text)', 'execute') as plan_anon,
              has_function_privilege('authenticated', 'public.set_private_admin_user_block_state(uuid, text, text)', 'execute') as block_owner`,
    );
    assert.deepEqual(rows[0], { block_anon: false, plan_anon: false, block_owner: true });
  });
});
