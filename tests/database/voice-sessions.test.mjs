import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, describe, it } from "node:test";
import { activeSession, startDatabase } from "./database-fixture.mjs";

const VOICE_TRIAL_BUCKET = 600;

function utterance(role, content) {
  return { utterance_id: randomUUID(), role, content };
}

async function append(client, sessionId, utterances) {
  const { rows } = await client.query("select public.append_voice_session_utterances($1, $2::jsonb) as result", [
    sessionId,
    JSON.stringify(utterances),
  ]);
  return rows[0].result;
}

async function messages(client, sessionId) {
  const { rows } = await client.query(
    "select role, sequence_index, content, utterance_id from public.session_messages where session_id = $1 order by sequence_index",
    [sessionId],
  );
  return rows;
}

describe("Voice sessions against all migrations in real PostgreSQL", () => {
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

  async function premium(owner) {
    await db.admin.query("update public.admin_user_profiles set premium_granted_at = now() where user_id = $1", [
      owner.userId,
    ]);
  }

  // Timestamps are server-owned now; only a trigger-free superuser write can
  // put them where a test needs them (a past end, hours of history).
  async function forge(sql, params) {
    await db.admin.query("set session_replication_role = replica");
    try {
      await db.admin.query(sql, params);
    } finally {
      await db.admin.query("set session_replication_role = default");
    }
  }

  async function usage(client, since, excludeSessionId = null) {
    const { rows } = await client.query("select public.get_owned_voice_usage($1::timestamptz, $2::uuid) as result", [
      since,
      excludeSessionId,
    ]);
    return rows[0].result;
  }

  it("defaults legacy inserts to the text mode and lets nobody change the mode afterwards", async () => {
    const owner = await db.owner();
    const { rows } = await owner.client.query(
      "insert into public.therapy_sessions(user_id, duration_bucket_seconds) values ($1, 900) returning mode",
      [owner.userId],
    );
    assert.equal(rows[0].mode, "text");
    await assert.rejects(
      owner.client.query("update public.therapy_sessions set mode = 'voice' where user_id = $1", [owner.userId]),
      { code: "42501" },
    );
    await assert.rejects(
      owner.client.query("insert into public.therapy_sessions(user_id, mode) values ($1, 'spoken')", [owner.userId]),
      { code: "23514" },
    );
  });

  it("gives a free account one voice trial of 600 seconds that even a deleted conversation consumes", async () => {
    const owner = await db.owner();
    await assert.rejects(
      owner.client.query(
        "insert into public.therapy_sessions(user_id, mode, duration_bucket_seconds) values ($1, 'voice', 900)",
        [owner.userId],
      ),
      { code: "P0006" },
    );
    const { rows } = await owner.client.query(
      "insert into public.therapy_sessions(user_id, mode, duration_bucket_seconds) values ($1, 'voice', $2) returning id",
      [owner.userId, VOICE_TRIAL_BUCKET],
    );
    await assert.rejects(
      owner.client.query(
        "insert into public.therapy_sessions(user_id, mode, duration_bucket_seconds) values ($1, 'voice', $2)",
        [owner.userId, VOICE_TRIAL_BUCKET],
      ),
      { code: "P0016" },
    );
    await owner.client.query(
      "update public.therapy_sessions set status = 'deleted', deletion_reason_code = 'user_request' where id = $1",
      [rows[0].id],
    );
    const tombstone = await owner.client.query("select mode, status from public.therapy_sessions where id = $1", [
      rows[0].id,
    ]);
    assert.deepEqual(tombstone.rows[0], { mode: "voice", status: "deleted" });
    await assert.rejects(
      owner.client.query(
        "insert into public.therapy_sessions(user_id, mode, duration_bucket_seconds) values ($1, 'voice', $2)",
        [owner.userId, VOICE_TRIAL_BUCKET],
      ),
      { code: "P0016" },
    );
  });

  it("keeps the voice trial outside the three-text-conversation allowance", async () => {
    const owner = await db.owner();
    await owner.client.query(
      "insert into public.therapy_sessions(user_id, mode, duration_bucket_seconds) values ($1, 'voice', $2)",
      [owner.userId, VOICE_TRIAL_BUCKET],
    );
    for (let index = 0; index < 3; index += 1) {
      await owner.client.query(
        "insert into public.therapy_sessions(user_id, duration_bucket_seconds) values ($1, 900)",
        [owner.userId],
      );
    }
    await assert.rejects(
      owner.client.query("insert into public.therapy_sessions(user_id, duration_bucket_seconds) values ($1, 900)", [
        owner.userId,
      ]),
      { code: "P0005" },
    );
  });

  it("does not cap a premium account's voice conversations and lets them carry the hour budget", async () => {
    const owner = await db.owner();
    await premium(owner);
    for (let index = 0; index < 3; index += 1) {
      await owner.client.query(
        "insert into public.therapy_sessions(user_id, mode, duration_bucket_seconds) values ($1, 'voice', 3600)",
        [owner.userId],
      );
    }
    const { rows } = await owner.client.query(
      "select count(*)::int as n from public.therapy_sessions where user_id = $1 and mode = 'voice'",
      [owner.userId],
    );
    assert.equal(rows[0].n, 3);
  });

  it("records the first audio connection once, with database time, and freezes it against later updates", async () => {
    const owner = await db.owner();
    const id = await activeSession(owner, { mode: "voice", bucket: VOICE_TRIAL_BUCKET });
    const first = await owner.client.query(
      "update public.therapy_sessions set voice_connected_at = '2099-01-01T00:00:00Z' where id = $1 and voice_connected_at is null returning voice_connected_at, now() as db_now",
      [id],
    );
    assert.equal(first.rowCount, 1);
    // A forged future (or 1970) connection time would zero the pool usage: the database stamps its own clock.
    assert.equal(new Date(first.rows[0].voice_connected_at).getTime(), new Date(first.rows[0].db_now).getTime());
    const second = await owner.client.query(
      "update public.therapy_sessions set voice_connected_at = '1970-01-01T00:00:00Z' where id = $1 returning voice_connected_at",
      [id],
    );
    assert.equal(
      new Date(second.rows[0].voice_connected_at).getTime(),
      new Date(first.rows[0].voice_connected_at).getTime(),
    );
  });

  it("stamps ended_at at the terminal transition with database time and never moves it afterwards", async () => {
    const owner = await db.owner();
    const id = await activeSession(owner, { mode: "voice", bucket: VOICE_TRIAL_BUCKET });

    // A conversation that is still active cannot carry an end.
    const early = await owner.client.query(
      "update public.therapy_sessions set ended_at = clock_timestamp() where id = $1 returning ended_at",
      [id],
    );
    assert.equal(early.rows[0].ended_at, null);

    // `ended_at = voice_connected_at` used to zero the pool usage; the request's value is ignored.
    const done = await owner.client.query(
      "update public.therapy_sessions set status = 'completed', ended_at = '1970-01-01T00:00:00Z' where id = $1 returning ended_at, now() as db_now",
      [id],
    );
    const endedAt = new Date(done.rows[0].ended_at).getTime();
    assert.equal(endedAt, new Date(done.rows[0].db_now).getTime());

    // A later end would stretch the one-minute drain window: frozen, also through the deletion RPC.
    await owner.client.query(
      "update public.therapy_sessions set ended_at = clock_timestamp() + interval '1 day' where id = $1",
      [id],
    );
    await owner.client.query(
      "select public.delete_owned_session($1, 'user_request', clock_timestamp() + interval '1 day')",
      [id],
    );
    const { rows } = await db.admin.query("select status, ended_at from public.therapy_sessions where id = $1", [id]);
    assert.equal(rows[0].status, "deleted");
    assert.equal(new Date(rows[0].ended_at).getTime(), endedAt);
  });

  it("never lets a start sent together with the status change push the end into the future", async () => {
    const owner = await db.owner();

    // active → completed with a forged start: the frozen start wins, the end is the database's now.
    const id = await activeSession(owner, { mode: "voice", bucket: VOICE_TRIAL_BUCKET });
    const before = await db.admin.query("select started_at from public.therapy_sessions where id = $1", [id]);
    const done = await owner.client.query(
      `update public.therapy_sessions set status = 'completed', started_at = '2099-01-01T00:00:00Z'
      where id = $1 returning started_at, ended_at, now() as db_now`,
      [id],
    );
    assert.equal(new Date(done.rows[0].ended_at).getTime(), new Date(done.rows[0].db_now).getTime());
    assert.equal(new Date(done.rows[0].started_at).getTime(), new Date(before.rows[0].started_at).getTime());

    // created → expired with a forged far start: refused instead of stamping a future end.
    const pending = await owner.client.query(
      `insert into public.therapy_sessions (user_id, status, started_at, expires_at, duration_bucket_seconds)
      values ($1, 'created', clock_timestamp(), clock_timestamp() + interval '15 minutes', 900) returning id`,
      [owner.userId],
    );
    await assert.rejects(
      owner.client.query(
        `update public.therapy_sessions set status = 'expired', started_at = '2099-01-01T00:00:00Z',
        expires_at = '2099-01-01T00:10:00Z' where id = $1`,
        [pending.rows[0].id],
      ),
      { code: "23514" },
    );
    const untouched = await db.admin.query("select status, ended_at from public.therapy_sessions where id = $1", [
      pending.rows[0].id,
    ]);
    assert.deepEqual(untouched.rows[0], { status: "created", ended_at: null });

    // A Worker clock a few seconds ahead still ends a created row, with the end at its start.
    const skewed = await owner.client.query(
      `update public.therapy_sessions set status = 'interrupted', started_at = clock_timestamp() + interval '3 seconds'
      where id = $1 returning started_at, ended_at, now() as db_now`,
      [pending.rows[0].id],
    );
    const skewedEnd = new Date(skewed.rows[0].ended_at).getTime();
    assert.equal(skewedEnd, new Date(skewed.rows[0].started_at).getTime());
    assert.ok(skewedEnd <= new Date(skewed.rows[0].db_now).getTime() + 5_000);
  });

  it("keeps every lifecycle write the deployed Worker performs working, with the end stamped by the database", async () => {
    // The same PATCH `transitionSessionLifecycle` sends: status plus the Worker's own clock for `ended_at`.
    const owner = await db.owner();
    const transition = (id, from, status, endedAt) =>
      owner.client.query(
        `update public.therapy_sessions set status = $3, ended_at = $4, deletion_reason_code = null
        where id = $1 and user_id = $2 and status = $5 returning status, ended_at, now() as db_now`,
        [id, owner.userId, status, endedAt, from],
      );

    for (const status of ["completed", "expired", "interrupted"]) {
      const { rows } = await owner.client.query(
        `insert into public.therapy_sessions (user_id, status, started_at, expires_at, duration_bucket_seconds)
        values ($1, 'created', clock_timestamp(), clock_timestamp() + interval '15 minutes', 900) returning id`,
        [owner.userId],
      );
      const active = await transition(rows[0].id, "created", "active", null);
      assert.equal(active.rowCount, 1);
      assert.equal(active.rows[0].ended_at, null);

      const workerNow = new Date(Date.now() - 1_000).toISOString();
      const ended = await transition(rows[0].id, "active", status, workerNow);
      assert.equal(ended.rowCount, 1);
      assert.equal(ended.rows[0].status, status);
      assert.equal(new Date(ended.rows[0].ended_at).getTime(), new Date(ended.rows[0].db_now).getTime());
    }
  });

  it("gives a conversation deleted mid-way a real end and one that never started none", async () => {
    const owner = await db.owner();
    const live = await activeSession(owner);
    const deleted = await owner.client.query(
      "select (public.delete_owned_session($1, 'user_request')).ended_at as ended_at",
      [live],
    );
    assert.ok(deleted.rows[0].ended_at);

    const { rows } = await owner.client.query(
      "insert into public.therapy_sessions(user_id, duration_bucket_seconds) values ($1, 900) returning id",
      [owner.userId],
    );
    const pending = await owner.client.query(
      "select (public.delete_owned_session($1, 'user_request', clock_timestamp())).ended_at as ended_at",
      [rows[0].id],
    );
    assert.equal(pending.rows[0].ended_at, null);
  });

  it("counts every voice conversation in the pool, far beyond the old 200-row read", async () => {
    const owner = await db.owner();
    await forge(
      `insert into public.therapy_sessions
        (user_id, mode, status, started_at, expires_at, ended_at, voice_connected_at, duration_bucket_seconds)
      select $1, 'voice', 'completed', t, t + interval '1 hour', t + interval '60 seconds', t, 3600
      from (
        select now() - interval '5 hours' + make_interval(mins => g) as t from generate_series(1, 205) as g
      ) as history`,
      [owner.userId],
    );
    const result = await usage(owner.client, new Date(Date.now() - 6 * 3_600_000).toISOString());
    assert.deepEqual(result, { used_seconds: 205 * 60, reserved_seconds: 0 });
  });

  it("counts spoken time up to the end, the deadline or now, and reserves what running conversations may still use", async () => {
    const owner = await db.owner();
    const other = randomUUID();
    const connecting = randomUUID();
    await forge(
      `insert into public.therapy_sessions
        (id, user_id, mode, status, started_at, expires_at, ended_at, voice_connected_at, duration_bucket_seconds)
      values
        -- finished after ten minutes
        (gen_random_uuid(), $1, 'voice', 'completed', now() - interval '30 minutes', now() + interval '30 minutes',
          now() - interval '20 minutes', now() - interval '30 minutes', 3600),
        -- expired, reconciled hours after its deadline: counted only up to the deadline
        (gen_random_uuid(), $1, 'voice', 'expired', now() - interval '3 hours', now() - interval '150 minutes',
          now(), now() - interval '3 hours', 3600),
        -- another conversation still running: ten minutes spoken, twenty reserved
        ($2, $1, 'voice', 'active', now() - interval '10 minutes', now() + interval '20 minutes',
          null, now() - interval '10 minutes', 3600),
        -- the conversation being connected: five minutes spoken, nothing reserved for itself
        ($3, $1, 'voice', 'active', now() - interval '5 minutes', now() + interval '25 minutes',
          null, now() - interval '5 minutes', 3600),
        -- never connected, connected before the window, or a written conversation: not counted
        (gen_random_uuid(), $1, 'voice', 'completed', now() - interval '40 minutes', now() + interval '20 minutes',
          now() - interval '35 minutes', null, 3600),
        (gen_random_uuid(), $1, 'voice', 'completed', now() - interval '40 days', now() - interval '40 days' + interval '1 hour',
          now() - interval '40 days' + interval '10 minutes', now() - interval '40 days', 3600),
        (gen_random_uuid(), $1, 'text', 'completed', now() - interval '40 minutes', now() - interval '25 minutes',
          now() - interval '26 minutes', null, 900)`,
      [owner.userId, other, connecting],
    );
    // A deleted conversation still counts: deleting never returns minutes.
    await forge(
      `insert into public.therapy_sessions
        (user_id, mode, status, started_at, expires_at, ended_at, voice_connected_at, duration_bucket_seconds,
          deleted_at, deletion_reason_code)
      values ($1, 'voice', 'deleted', now() - interval '50 minutes', now() + interval '10 minutes',
        now() - interval '45 minutes', now() - interval '50 minutes', 3600, now(), 'user_request')`,
      [owner.userId],
    );
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();

    assert.deepEqual(await usage(owner.client, since, connecting), { used_seconds: 3600, reserved_seconds: 1200 });
    assert.deepEqual(await usage(owner.client, since), { used_seconds: 3600, reserved_seconds: 2700 });

    // Never more than the bucket, whatever the timestamps say.
    const capped = await db.owner();
    await forge(
      `insert into public.therapy_sessions
        (user_id, mode, status, started_at, expires_at, ended_at, voice_connected_at, duration_bucket_seconds)
      values ($1, 'voice', 'completed', now() - interval '2 hours', now() + interval '1 hour', now(), now() - interval '2 hours', 600)`,
      [capped.userId],
    );
    assert.deepEqual(await usage(capped.client, since), { used_seconds: 600, reserved_seconds: 0 });

    // Owner-bound: a stranger reads nothing of it, anon cannot call it at all.
    const stranger = await db.owner();
    assert.deepEqual(await usage(stranger.client, since), { used_seconds: 0, reserved_seconds: 0 });
    const { rows } = await db.admin.query(
      `select has_function_privilege('anon', 'public.get_owned_voice_usage(timestamptz, uuid)', 'execute') as anon_can,
              has_function_privilege('authenticated', 'public.get_owned_voice_usage(timestamptz, uuid)', 'execute') as owner_can,
              (select prosecdef from pg_proc where proname = 'get_owned_voice_usage') as definer`,
    );
    assert.deepEqual(rows[0], { anon_can: false, owner_can: true, definer: false });
  });

  it("appends voice utterances only to the owner's voice conversation, in order and idempotently", async () => {
    const owner = await db.owner();
    const textId = await activeSession(owner);
    await assert.rejects(append(owner.client, textId, [utterance("user", "Cześć")]), { code: "P0015" });

    const voiceId = await activeSession(owner, { mode: "voice", bucket: VOICE_TRIAL_BUCKET });
    const batch = [utterance("user", "Cześć. Źle sypiam."), utterance("assistant", "Mhm, słucham.")];
    const first = await append(owner.client, voiceId, batch);
    assert.equal(first.inserted, 2);
    assert.equal(first.skipped, 0);
    assert.deepEqual(
      first.messages.map((row) => [row.role, row.sequence_index]),
      [
        ["user", 0],
        ["assistant", 1],
      ],
    );

    const replay = await append(owner.client, voiceId, [...batch, utterance("user", "I ciągle myślę o mamie.")]);
    assert.equal(replay.inserted, 1);
    assert.equal(replay.skipped, 2);
    const rows = await messages(owner.client, voiceId);
    assert.deepEqual(
      rows.map((row) => [row.role, row.sequence_index, row.content]),
      [
        ["user", 0, "Cześć. Źle sypiam."],
        ["assistant", 1, "Mhm, słucham."],
        ["user", 2, "I ciągle myślę o mamie."],
      ],
    );
    assert.ok(rows.every((row) => row.utterance_id));

    await assert.rejects(append(owner.client, voiceId, [utterance("system_boundary", "x")]), { code: "22023" });
    await assert.rejects(append(owner.client, voiceId, [{ utterance_id: "nope", role: "user", content: "x" }]), {
      code: "22023",
    });
    await assert.rejects(append(owner.client, voiceId, [utterance("user", "   ")]), { code: "22023" });
    await assert.rejects(append(owner.client, voiceId, [utterance("user", "x".repeat(3001))]), { code: "22023" });
    const empty = await append(owner.client, voiceId, []);
    assert.deepEqual(empty, { inserted: 0, skipped: 0, messages: [] });

    const stranger = await db.owner();
    await assert.rejects(append(stranger.client, voiceId, [utterance("user", "Hej")]), { code: "P0002" });
  });

  it("keeps a drain window of one minute after a voice conversation ends and closes it afterwards", async () => {
    const owner = await db.owner();
    const id = await activeSession(owner, { mode: "voice", bucket: VOICE_TRIAL_BUCKET });
    await owner.client.query(
      "update public.therapy_sessions set status = 'completed', ended_at = clock_timestamp() where id = $1",
      [id],
    );
    const late = await append(owner.client, id, [utterance("assistant", "Do zobaczenia.")]);
    assert.equal(late.inserted, 1);

    // A second voice row for a free account trips the trial gate; grant premium first.
    // The conversation started ten minutes ago so an end two minutes ago keeps the time order.
    await premium(owner);
    const stale = await owner.client.query(
      "insert into public.therapy_sessions(user_id, mode, duration_bucket_seconds) values ($1, 'voice', 3600) returning id",
      [owner.userId],
    );
    const staleId = stale.rows[0].id;
    await owner.client.query(
      `update public.therapy_sessions set status = 'active',
      started_at = clock_timestamp() - interval '10 minutes', expires_at = clock_timestamp() + interval '50 minutes' where id = $1`,
      [staleId],
    );
    await owner.client.query("update public.therapy_sessions set status = 'expired' where id = $1", [staleId]);
    // The owner cannot backdate the end any more (it is server-owned), so the test forges it.
    await forge(
      "update public.therapy_sessions set ended_at = clock_timestamp() - interval '2 minutes' where id = $1",
      [staleId],
    );
    await assert.rejects(append(owner.client, staleId, [utterance("assistant", "Za późno.")]), { code: "P0004" });

    // A text conversation never gets the window: the guard trigger still demands an active session.
    const textId = await activeSession(owner);
    await owner.client.query(
      "update public.therapy_sessions set status = 'completed', ended_at = clock_timestamp() where id = $1",
      [textId],
    );
    await assert.rejects(
      owner.client.query(
        "insert into public.session_messages(session_id, user_id, role, sequence_index, content) values ($1, $2, 'user', 0, 'x')",
        [textId, owner.userId],
      ),
      { code: "P0004" },
    );
  });

  it("rejects utterances for an active conversation whose deadline has passed", async () => {
    // The deadline is frozen once a session is active, so pin a one-second budget at activation.
    const owner = await db.owner();
    const { rows } = await owner.client.query(
      "insert into public.therapy_sessions(user_id, mode, duration_bucket_seconds) values ($1, 'voice', $2) returning id",
      [owner.userId, VOICE_TRIAL_BUCKET],
    );
    await owner.client.query(
      `update public.therapy_sessions set status = 'active',
      started_at = clock_timestamp(), expires_at = clock_timestamp() + interval '1 second' where id = $1`,
      [rows[0].id],
    );
    await delay(1_300);
    await assert.rejects(append(owner.client, rows[0].id, [utterance("user", "Halo?")]), { code: "P0007" });
  });

  it("serializes concurrent drains on the session row so sequence indexes never collide", async () => {
    const owner = await db.owner();
    const id = await activeSession(owner, { mode: "voice", bucket: VOICE_TRIAL_BUCKET });
    const other = await db.owner(owner.userId);

    await owner.client.query("begin");
    const heldBatch = [utterance("user", "Pierwsza"), utterance("assistant", "Druga")];
    await append(owner.client, id, heldBatch);
    const concurrent = append(other.client, id, [utterance("user", "Trzecia")]);
    await db.waitForLock(other.client);
    await owner.client.query("commit");
    const result = await concurrent;
    assert.equal(result.inserted, 1);
    assert.deepEqual(
      (await messages(owner.client, id)).map((row) => row.sequence_index),
      [0, 1, 2],
    );
  });

  it("purges utterances with the conversation while the tombstone keeps the mode", async () => {
    const owner = await db.owner();
    const id = await activeSession(owner, { mode: "voice", bucket: VOICE_TRIAL_BUCKET });
    await append(owner.client, id, [utterance("user", "Coś prywatnego")]);
    await owner.client.query(
      "update public.therapy_sessions set status = 'completed', ended_at = clock_timestamp() where id = $1",
      [id],
    );
    await owner.client.query("select public.delete_owned_session($1, 'user_request')", [id]);
    const { rows } = await db.admin.query(
      "select count(*)::int as n from public.session_messages where session_id = $1",
      [id],
    );
    assert.equal(rows[0].n, 0);
    const tombstone = await db.admin.query("select mode, status from public.therapy_sessions where id = $1", [id]);
    assert.deepEqual(tombstone.rows[0], { mode: "voice", status: "deleted" });
  });

  it("keeps the RPC away from anon and the trial gate away from PostgREST bypasses", async () => {
    const { rows } = await db.admin.query(
      `select has_function_privilege('anon', 'public.append_voice_session_utterances(uuid, jsonb)', 'execute') as anon_can,
              has_function_privilege('authenticated', 'public.append_voice_session_utterances(uuid, jsonb)', 'execute') as owner_can,
              (select prosecdef from pg_proc where proname = 'append_voice_session_utterances') as definer`,
    );
    assert.deepEqual(rows[0], { anon_can: false, owner_can: true, definer: false });
  });
});
