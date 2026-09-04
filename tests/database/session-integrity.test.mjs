import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { activeSession, claim, complete, startDatabase } from "./database-fixture.mjs";

describe("Session integrity against all migrations in real PostgreSQL", () => {
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

  it("rejects reopening terminal sessions, including the created-state timer bypass", async () => {
    for (const status of ["completed", "expired", "interrupted", "deleted"]) {
      const owner = await db.owner();
      const sessionId = await activeSession(owner);
      await owner.client.query(
        `update public.therapy_sessions set status = $2,
        deletion_reason_code = case when $2 = 'deleted' then 'user_request' else null end where id = $1`,
        [sessionId, status],
      );
      for (const target of ["active", "created"]) {
        await assert.rejects(
          owner.client.query("update public.therapy_sessions set status = $2 where id = $1", [sessionId, target]),
          { code: "P0004" },
        );
      }
    }
  });

  it("rejects direct active inserts and activation without a valid current deadline", async () => {
    const owner = await db.owner();
    await assert.rejects(
      owner.client.query("insert into public.therapy_sessions(user_id, status) values ($1, 'active')", [owner.userId]),
      { code: "P0004" },
    );
    const { rows } = await owner.client.query(
      "insert into public.therapy_sessions(user_id, duration_bucket_seconds) values ($1, 900) returning id",
      [owner.userId],
    );
    await assert.rejects(
      owner.client.query("update public.therapy_sessions set status = 'active' where id = $1", [rows[0].id]),
      { code: "P0006" },
    );
    await assert.rejects(
      owner.client.query(
        `update public.therapy_sessions set status = 'active',
      started_at = now() + interval '1 day', expires_at = now() + interval '1 day 15 minutes' where id = $1`,
        [rows[0].id],
      ),
      { code: "P0006" },
    );
  });

  it("keeps the old Worker's direct active-message insert compatible", async () => {
    const owner = await db.owner();
    const sessionId = await activeSession(owner);
    await owner.client.query(
      `insert into public.session_messages(session_id, user_id, role, sequence_index, content)
      values ($1, $2, 'assistant', 0, 'Otwarcie'), ($1, $2, 'user', 1, 'Pytanie')`,
      [sessionId, owner.userId],
    );
    assert.equal(
      (
        await owner.client.query("select count(*)::int as count from public.session_messages where session_id = $1", [
          sessionId,
        ])
      ).rows[0].count,
      2,
    );
  });

  it("replays the saved turn after response loss and completion without duplicating content", async () => {
    const owner = await db.owner();
    const sessionId = await activeSession(owner);
    const id = randomUUID();
    const reservation = await claim(owner.client, sessionId, id);
    const saved = await complete(owner.client, sessionId, id, reservation.attempt_id);
    await owner.client.query("update public.therapy_sessions set status = 'completed' where id = $1", [sessionId]);
    const replay = await claim(owner.client, sessionId, id);
    assert.equal(replay.kind, "completed");
    assert.deepEqual(replay.messages, saved.messages);
    assert.equal(
      (
        await owner.client.query("select count(*)::int as count from public.session_messages where session_id = $1", [
          sessionId,
        ])
      ).rows[0].count,
      2,
    );
    await assert.rejects(claim(owner.client, sessionId, id, "Inna wiadomość"), { code: "P0009" });
  });

  it("lets only one concurrent request reserve a generation for the session", async () => {
    const owner = await db.owner();
    const second = await db.owner(owner.userId);
    const sessionId = await activeSession(owner);
    const id = randomUUID();
    const outcomes = await Promise.allSettled([
      claim(owner.client, sessionId, id),
      claim(second.client, sessionId, id),
    ]);
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(outcomes.find((result) => result.status === "rejected").reason.code, "P0008");
    await assert.rejects(claim(owner.client, sessionId, randomUUID()), { code: "P0008" });
  });

  it("fences an abandoned attempt after its lease has expired and a retry takes over", async () => {
    const owner = await db.owner();
    const sessionId = await activeSession(owner);
    const id = randomUUID();
    const old = await claim(owner.client, sessionId, id);
    await owner.client.query(
      "update public.session_message_turns set lease_until = now() - interval '1 second' where session_id = $1",
      [sessionId],
    );
    const current = await claim(owner.client, sessionId, id);
    await assert.rejects(complete(owner.client, sessionId, id, old.attempt_id), { code: "P0009" });
    await owner.client.query("select public.release_session_message_turn($1, $2, $3)", [sessionId, id, old.attempt_id]);
    assert.equal((await complete(owner.client, sessionId, id, current.attempt_id)).messages.length, 2);
  });

  it("serializes ending with a late response and refuses the late pair", async () => {
    const owner = await db.owner();
    const sender = await db.owner(owner.userId);
    const sessionId = await activeSession(owner);
    const id = randomUUID();
    const reservation = await claim(sender.client, sessionId, id);
    await owner.client.query("begin");
    try {
      await owner.client.query("update public.therapy_sessions set status = 'completed' where id = $1", [sessionId]);
      const pending = complete(sender.client, sessionId, id, reservation.attempt_id).then(
        () => null,
        (error) => error,
      );
      await db.waitForLock(sender.client);
      await owner.client.query("commit");
      assert.equal((await pending).code, "P0004");
      assert.equal(
        (
          await owner.client.query("select count(*)::int as count from public.session_messages where session_id = $1", [
            sessionId,
          ])
        ).rows[0].count,
        0,
      );
    } finally {
      await owner.client.query("rollback");
    }
  });

  it("deletion purges receipts and prevents legacy inserts from resurrecting content", async () => {
    const owner = await db.owner();
    const sender = await db.owner(owner.userId);
    const sessionId = await activeSession(owner);
    await claim(owner.client, sessionId, randomUUID());
    await owner.client.query("begin");
    try {
      await owner.client.query("select public.delete_owned_session($1, 'user_request')", [sessionId]);
      const pending = sender.client
        .query(
          `insert into public.session_messages(session_id, user_id, role, sequence_index, content)
        values ($1, $2, 'user', 0, 'Spóźniona wiadomość')`,
          [sessionId, owner.userId],
        )
        .then(
          () => null,
          (error) => error,
        );
      await db.waitForLock(sender.client);
      await owner.client.query("commit");
      assert.equal((await pending).code, "P0002");
      assert.equal(
        (
          await owner.client.query(
            "select count(*)::int as count from public.session_message_turns where session_id = $1",
            [sessionId],
          )
        ).rows[0].count,
        0,
      );
      await assert.rejects(
        owner.client.query(
          `insert into public.session_summaries(session_id, user_id, summary_text)
        values ($1, $2, 'Spóźnione podsumowanie')`,
          [sessionId, owner.userId],
        ),
        { code: "P0002" },
      );
    } finally {
      await owner.client.query("rollback");
    }
  });

  it("checks elapsed time at commit even when status still says active", async () => {
    const owner = await db.owner();
    const sessionId = await activeSession(owner);
    const id = randomUUID();
    const reservation = await claim(owner.client, sessionId, id);
    // Administrative fixture clock adjustment; application writes cannot move it.
    await db.admin.query("alter table public.therapy_sessions disable trigger therapy_sessions_set_metadata");
    try {
      await db.admin.query(
        "update public.therapy_sessions set started_at = now() - interval '16 minutes', expires_at = now() - interval '1 minute' where id = $1",
        [sessionId],
      );
    } finally {
      await db.admin.query("alter table public.therapy_sessions enable trigger therapy_sessions_set_metadata");
    }
    await assert.rejects(complete(owner.client, sessionId, id, reservation.attempt_id), { code: "P0007" });
  });

  it("enforces ownership for content and receipts even when the other user is an admin", async () => {
    const owner = await db.owner();
    const other = await db.owner();
    await db.admin.query("insert into public.admin_users(user_id) values ($1)", [other.userId]);
    const sessionId = await activeSession(owner);
    const id = randomUUID();
    const reservation = await claim(owner.client, sessionId, id);
    await complete(owner.client, sessionId, id, reservation.attempt_id);
    for (const table of ["session_messages", "session_message_turns"]) {
      assert.equal(
        (
          await other.client.query(`select count(*)::int as count from public.${table} where session_id = $1`, [
            sessionId,
          ])
        ).rows[0].count,
        0,
      );
    }
    await assert.rejects(claim(other.client, sessionId, id), { code: "P0002" });
    await assert.rejects(complete(other.client, sessionId, id, reservation.attempt_id), { code: "P0002" });
  });
});
