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

  it("records the first audio connection once and freezes it against later updates", async () => {
    const owner = await db.owner();
    const id = await activeSession(owner, { mode: "voice", bucket: VOICE_TRIAL_BUCKET });
    const first = await owner.client.query(
      "update public.therapy_sessions set voice_connected_at = '2026-09-12T10:00:00Z' where id = $1 and voice_connected_at is null returning voice_connected_at",
      [id],
    );
    assert.equal(first.rowCount, 1);
    const second = await owner.client.query(
      "update public.therapy_sessions set voice_connected_at = '2026-09-12T11:00:00Z' where id = $1 returning voice_connected_at",
      [id],
    );
    assert.equal(new Date(second.rows[0].voice_connected_at).toISOString(), "2026-09-12T10:00:00.000Z");
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
    await owner.client.query(
      "update public.therapy_sessions set status = 'expired', ended_at = clock_timestamp() - interval '2 minutes' where id = $1",
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
