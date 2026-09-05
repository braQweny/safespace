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

  const memoryWork = async (owner, avatar = "cbt-guide") =>
    (await owner.client.query("select public.get_avatar_memory_work($1) as work", [avatar])).rows[0].work;
  const saveMemory = async (owner, work, text, message = work.messages.at(-1)) =>
    (
      await owner.client.query("select public.save_avatar_memory_work('cbt-guide', $1, $2, $3, $4, $5) as saved", [
        work.revision,
        work.sessionId,
        message.sequenceIndex,
        Array.from(message.content).length,
        text,
      ])
    ).rows[0].saved;
  async function endedMemorySession(owner, content = "Ważny fakt z rozmowy") {
    const id = await activeSession(owner);
    await owner.client.query(
      `insert into public.session_messages(session_id, user_id, role, sequence_index, content)
      values ($1, $2, 'user', 0, $3)`,
      [id, owner.userId, content],
    );
    await owner.client.query("update public.therapy_sessions set status = 'completed' where id = $1", [id]);
    return id;
  }

  const memoryBatch = async (owner, avatar = "cbt-guide") =>
    (await owner.client.query("select public.get_avatar_memory_batch($1) as work", [avatar])).rows[0].work;
  const batchCursors = (work) => [
    ...new Map(
      work.messages.map(({ sessionId, sequenceIndex, characterOffset }) => [
        sessionId,
        { sessionId, sequenceIndex, characterOffset },
      ]),
    ).values(),
  ];
  const saveBatch = async (
    owner,
    work,
    summary = "Łączna pamięć",
    cursors = batchCursors(work),
    avatar = "cbt-guide",
  ) =>
    (
      await owner.client.query("select public.save_avatar_memory_batch($1, $2, $3, $4) as saved", [
        avatar,
        work.revision,
        JSON.stringify(cursors),
        summary,
      ])
    ).rows[0].saved;

  async function endedBatchSession(owner, contents) {
    const id = await activeSession(owner);
    for (let index = 0; index < contents.length; index++) {
      await owner.client.query(
        `insert into public.session_messages(session_id,user_id,role,sequence_index,content)
         values ($1,$2,$3,$4,$5)`,
        [id, owner.userId, index % 2 === 0 ? "user" : "assistant", index, contents[index]],
      );
    }
    await owner.client.query("update public.therapy_sessions set status='completed' where id=$1", [id]);
    return id;
  }

  it("combines ten short conversations into one batch and pins all of them with one save", async () => {
    const owner = await db.owner();
    await db.admin.query("update public.admin_user_profiles set premium_granted_at=now() where user_id=$1", [
      owner.userId,
    ]);
    const ids = [];
    for (let index = 0; index < 10; index++) {
      ids.push(
        await endedBatchSession(
          owner,
          Array.from({ length: 8 }, (_, turn) => `Fakt ${index}, wiadomość ${turn}.`),
        ),
      );
    }
    const work = await memoryBatch(owner);
    assert.equal(work.messages.length, 80);
    assert.deepEqual([...new Set(work.messages.map((m) => m.sessionId))], ids);
    assert.equal(await saveBatch(owner, work, "Fakty z dziesięciu rozmów"), true);
    assert.equal((await memoryBatch(owner)).messages.length, 0);
    // Starszy Worker i trigger kompletności rozumieją postęp zapisany nowym RPC.
    assert.equal((await memoryWork(owner)).sessionId, null);
    assert.equal(
      (
        await owner.client.query("select count(*)::int as n from public.avatar_memory_sources where user_id=$1", [
          owner.userId,
        ])
      ).rows[0].n,
      10,
    );
    const { rows } = await owner.client.query(
      `insert into public.therapy_sessions(user_id,modality_id,avatar_id,uses_avatar_memory)
       values ($1,'cbt','cbt-guide',true) returning id`,
      [owner.userId],
    );
    assert.equal(
      (
        await owner.client.query("select summary_text from public.avatar_session_contexts where session_id=$1", [
          rows[0].id,
        ])
      ).rows[0].summary_text,
      "Fakty z dziesięciu rozmów",
    );
  });

  it("fits forty 1200-character messages into one batch and bounds tiny-message overhead", async () => {
    const owner = await db.owner();
    await endedBatchSession(
      owner,
      Array.from({ length: 40 }, () => "🙂".repeat(1200)),
    );
    const work = await memoryBatch(owner);
    assert.equal(work.messages.length, 40);
    assert.equal(
      work.messages.reduce((sum, m) => sum + Array.from(m.content).length, 0),
      48000,
    );
    assert.equal(await saveBatch(owner, work), true);
    await endedBatchSession(
      owner,
      Array.from({ length: 129 }, () => "x"),
    );
    const tiny = await memoryBatch(owner);
    assert.equal(tiny.messages.length, 128);
    assert.equal(await saveBatch(owner, tiny), true);
    const rest = await memoryBatch(owner);
    assert.equal(rest.messages.length, 1);
    assert.equal(rest.messages[0].sequenceIndex, 128);
  });

  it("resumes an old partial cursor and traverses long Unicode text without dropping any character", async () => {
    const owner = await db.owner();
    const text = "🙂".repeat(98000) + "Koniec pierwszej rozmowy";
    const id = await endedMemorySession(owner, text);
    const legacy = await memoryWork(owner);
    assert.equal(
      (
        await owner.client.query(
          "select public.save_avatar_memory_work('cbt-guide',$1,$2,0,1200,'Stary postęp') as saved",
          [legacy.revision, id],
        )
      ).rows[0].saved,
      true,
    );
    await endedMemorySession(owner, "Druga rozmowa");
    const collected = [];
    for (let step = 0; step < 3; step++) {
      const batch = await memoryBatch(owner);
      assert.ok(batch.messages.length > 0);
      assert.ok(batch.messages.reduce((sum, m) => sum + Array.from(m.content).length, 0) <= 48000);
      collected.push(...batch.messages.map((m) => m.content));
      assert.equal(await saveBatch(owner, batch), true);
    }
    assert.equal(collected.join(""), Array.from(text).slice(1200).join("") + "Druga rozmowa");
    assert.equal((await memoryBatch(owner)).messages.length, 0);
    assert.equal((await memoryWork(owner)).sessionId, null);
  });

  it("excludes live conversations and other avatars, and rejects the whole batch if one cursor is invalid", async () => {
    const owner = await db.owner();
    const first = await endedMemorySession(owner);
    await endedMemorySession(owner, "Drugi fakt");
    const live = await activeSession(owner);
    await owner.client.query(
      "insert into public.session_messages(session_id,user_id,role,sequence_index,content) values ($1,$2,'user',0,'Jeszcze rozmawiam')",
      [live, owner.userId],
    );
    const work = await memoryBatch(owner);
    assert.equal(work.messages.length, 2);
    assert.ok(work.messages.every((m) => m.sessionId !== live));
    assert.equal((await memoryBatch(owner, "psychodynamic-listener")).messages.length, 0);
    const cursors = batchCursors(work);
    const invalid = cursors.map((c, index) => (index === 1 ? { ...c, characterOffset: 99999 } : c));
    assert.equal(await saveBatch(owner, work, "Nie zapisuj częściowo", invalid), false);
    assert.equal((await memoryBatch(owner)).revision, work.revision);
    assert.equal(
      (
        await owner.client.query("select count(*)::int as n from public.avatar_memory_sources where user_id=$1", [
          owner.userId,
        ])
      ).rows[0].n,
      0,
    );
    assert.equal(await saveBatch(owner, work, "Zły awatar", cursors, "psychodynamic-listener"), false);
    assert.equal(await saveBatch(owner, work, "Powtórzony kursor", [cursors[0], cursors[0]]), false);
    assert.equal(
      await saveBatch(owner, work, "Aktywna sesja", [
        ...cursors,
        { sessionId: live, sequenceIndex: 0, characterOffset: 1 },
      ]),
      false,
    );
    assert.equal(await saveBatch(owner, work, "Poprawna całość"), true);
    const updated = await memoryBatch(owner);
    assert.equal(
      await saveBatch(owner, updated, "Cofnięty postęp", [{ sessionId: first, sequenceIndex: 0, characterOffset: 1 }]),
      false,
    );
  });

  it("keeps batch RPCs owner-only, including when the other owner is an admin", async () => {
    const owner = await db.owner();
    const other = await db.owner();
    await db.admin.query("insert into public.admin_users(user_id) values ($1)", [other.userId]);
    await endedMemorySession(owner);
    const work = await memoryBatch(owner);
    assert.equal((await memoryBatch(other)).messages.length, 0);
    assert.equal(await saveBatch(other, work), false);
    for (const signature of [
      "public.get_avatar_memory_batch(text)",
      "public.save_avatar_memory_batch(text,uuid,jsonb,text)",
    ]) {
      const { rows } = await db.admin.query(
        "select has_function_privilege('anon',$1,'EXECUTE') as allowed, (select prosecdef from pg_proc where oid=$1::regprocedure) as definer",
        [signature],
      );
      assert.equal(rows[0].allowed, false);
      assert.equal(rows[0].definer, false);
    }
  });

  it("serializes competing batch saves and rejects an old Worker trying to overwrite newer memory", async () => {
    const owner = await db.owner();
    const other = await db.owner(owner.userId);
    await endedMemorySession(owner);
    await endedMemorySession(owner, "Drugi fakt");
    const work = await memoryBatch(owner);
    const legacy = await memoryWork(owner);
    const results = await Promise.all([
      saveBatch(owner, work, "Pierwsza wersja"),
      saveBatch(other, work, "Druga wersja"),
    ]);
    assert.deepEqual(results.sort(), [false, true]);
    assert.equal(await saveMemory(owner, legacy, "Spóźniony stary Worker"), false);
    assert.equal((await memoryBatch(owner)).messages.length, 0);
  });

  it("rejects every cursor after deletion races with a multi-conversation generation", async () => {
    const owner = await db.owner();
    const other = await db.owner(owner.userId);
    const deleted = await endedMemorySession(owner);
    const kept = await endedMemorySession(owner, "Pozostawiony fakt");
    const work = await memoryBatch(other);
    await owner.client.query("begin");
    try {
      await owner.client.query(
        "update public.therapy_sessions set status='deleted', deletion_reason_code='user_request' where id=$1",
        [deleted],
      );
      const pending = saveBatch(other, work, "Zawiera usunięty fakt");
      await db.waitForLock(other.client);
      await owner.client.query("commit");
      assert.equal(await pending, false);
    } finally {
      await owner.client.query("rollback");
    }
    const rebuilt = await memoryBatch(owner);
    assert.equal(rebuilt.summaryText, "");
    assert.deepEqual(
      rebuilt.messages.map((m) => m.sessionId),
      [kept],
    );
    assert.equal(
      (
        await owner.client.query("select count(*)::int as n from public.avatar_memory_sources where user_id=$1", [
          owner.userId,
        ])
      ).rows[0].n,
      0,
    );
    assert.equal(await saveBatch(owner, rebuilt, "Pozostawiony fakt"), true);
  });

  it("automatically covers all prior sessions, including more than three, and pins the full summary at start", async () => {
    const owner = await db.owner();
    await db.admin.query("update public.admin_user_profiles set premium_granted_at = now() where user_id = $1", [
      owner.userId,
    ]);
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await endedMemorySession(owner, `Fakt ${i}`));
    for (const id of ids) {
      const work = await memoryWork(owner);
      assert.equal(work.sessionId, id);
      assert.equal(await saveMemory(owner, work, `${work.summaryText} ${work.messages[0].content}`), true);
    }
    const work = await memoryWork(owner);
    assert.equal(work.sessionId, null);
    assert.match(work.summaryText, /Fakt 0.*Fakt 4/);
    const { rows } = await owner.client.query(
      `insert into public.therapy_sessions
      (user_id, modality_id, avatar_id, uses_avatar_memory, uses_approved_context) values ($1, 'cbt', 'cbt-guide', true, true) returning id`,
      [owner.userId],
    );
    const snapshot = (
      await owner.client.query("select summary_text from public.avatar_session_contexts where session_id = $1", [
        rows[0].id,
      ])
    ).rows[0];
    assert.equal(snapshot.summary_text, work.summaryText);
    await owner.client.query(
      "update public.avatar_memories set summary_text = 'Późniejsza pamięć' where user_id = $1",
      [owner.userId],
    );
    assert.equal(
      (
        await owner.client.query("select summary_text from public.avatar_session_contexts where session_id = $1", [
          rows[0].id,
        ])
      ).rows[0].summary_text,
      work.summaryText,
    );
  });

  it("never silently starts with incomplete history and does not consume a session on rejection", async () => {
    const owner = await db.owner();
    await endedMemorySession(owner);
    await assert.rejects(
      owner.client.query(
        `insert into public.therapy_sessions
      (user_id, modality_id, avatar_id, uses_avatar_memory) values ($1, 'cbt', 'cbt-guide', true)`,
        [owner.userId],
      ),
      { code: "P0011" },
    );
    assert.equal(
      (
        await owner.client.query("select count(*)::int as n from public.therapy_sessions where user_id = $1", [
          owner.userId,
        ])
      ).rows[0].n,
      1,
    );
  });

  it("isolates avatar memories, sources and session copies from other owners including admins", async () => {
    const owner = await db.owner();
    const other = await db.owner();
    await db.admin.query("insert into public.admin_users(user_id) values ($1)", [other.userId]);
    await endedMemorySession(owner);
    const work = await memoryWork(owner);
    assert.equal(await saveMemory(owner, work, "Prywatny fakt"), true);
    await owner.client.query(
      `insert into public.therapy_sessions
      (user_id, modality_id, avatar_id, uses_avatar_memory) values ($1, 'cbt', 'cbt-guide', true)`,
      [owner.userId],
    );
    assert.equal((await memoryWork(owner, "psychodynamic-listener")).summaryText, "");
    assert.equal((await memoryWork(other)).sessionId, null);
    assert.equal(await saveMemory(other, work, "Cudza pamięć"), false);
    for (const table of ["avatar_memories", "avatar_memory_sources", "avatar_session_contexts"]) {
      assert.equal(
        (await other.client.query(`select count(*)::int as n from public.${table} where user_id = $1`, [owner.userId]))
          .rows[0].n,
        0,
      );
      assert.equal(
        (
          await other.client.query(`update public.${table} set user_id = $1 where user_id = $2`, [
            other.userId,
            owner.userId,
          ])
        ).rowCount,
        0,
      );
      assert.equal(
        (await other.client.query(`delete from public.${table} where user_id = $1`, [owner.userId])).rowCount,
        0,
      );
    }
    await assert.rejects(
      other.client.query("insert into public.avatar_memories(user_id, avatar_id) values ($1, 'cbt-guide')", [
        owner.userId,
      ]),
      { code: "42501" },
    );
    await assert.rejects(
      other.client.query("update public.avatar_memories set user_id = $1 where user_id = $2", [
        owner.userId,
        other.userId,
      ]),
      { code: "42501" },
    );
    for (const table of ["avatar_memories", "avatar_memory_sources", "avatar_session_contexts"]) {
      const { rows } = await db.admin.query("select has_table_privilege('anon', $1, 'SELECT') as readable", [
        `public.${table}`,
      ]);
      assert.equal(rows[0].readable, false);
    }
  });

  it("resumes a long Unicode message without dropping the prefix or skipping later pages", async () => {
    const owner = await db.owner();
    const id = await activeSession(owner);
    const content = "🙂".repeat(1500) + "KONIEC";
    for (let i = 0; i < 18; i++)
      await owner.client.query(
        `insert into public.session_messages
      (session_id, user_id, role, sequence_index, content) values ($1, $2, 'user', $3, $4)`,
        [id, owner.userId, i, i === 0 ? content : `Wiadomość ${i}`],
      );
    await owner.client.query("update public.therapy_sessions set status = 'completed' where id = $1", [id]);
    const first = await memoryWork(owner);
    assert.equal(first.messages.length, 16);
    assert.equal(
      (
        await owner.client.query(
          "select public.save_avatar_memory_work('cbt-guide', $1, $2, 0, 1200, 'Pierwsza część') as saved",
          [first.revision, id],
        )
      ).rows[0].saved,
      true,
    );
    const second = await memoryWork(owner);
    assert.equal(second.characterOffset, 1200);
    assert.equal(second.messages[0].content, content);
    assert.equal(await saveMemory(owner, second, "Pamięć do wiadomości 15"), true);
    const third = await memoryWork(owner);
    assert.deepEqual(
      third.messages.map((m) => m.sequenceIndex),
      [16, 17],
    );
    assert.equal(await saveMemory(owner, third, "Wszystkie wiadomości"), true);
    assert.equal((await memoryWork(owner)).sessionId, null);
  });

  it("invalidates aggregate and pinned copies on deletion and fences an in-flight generation", async () => {
    const owner = await db.owner();
    const otherRequest = await db.owner(owner.userId);
    const id = await endedMemorySession(owner);
    const work = await memoryWork(owner);
    assert.equal(await saveMemory(owner, work, "Fakt do usunięcia"), true);
    await owner.client.query(
      `insert into public.therapy_sessions
      (user_id, modality_id, avatar_id, uses_avatar_memory) values ($1, 'cbt', 'cbt-guide', true)`,
      [owner.userId],
    );
    const nextId = await endedMemorySession(owner, "Fakt który zostaje");
    const pendingWork = await memoryWork(otherRequest);
    await owner.client.query("begin");
    try {
      await owner.client.query(
        "update public.therapy_sessions set status = 'deleted', deletion_reason_code = 'user_request' where id = $1",
        [id],
      );
      const pending = saveMemory(otherRequest, pendingWork, "Wygenerowane ze starej pamięci");
      await db.waitForLock(otherRequest.client);
      await owner.client.query("commit");
      assert.equal(await pending, false);
    } finally {
      await owner.client.query("rollback");
    }
    const reset = await memoryWork(owner);
    assert.equal(reset.summaryText, "");
    assert.equal(reset.sessionId, nextId);
    assert.equal(
      (
        await owner.client.query(
          "select count(*)::int as n from public.avatar_session_contexts where summary_text <> ''",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(await saveMemory(owner, reset, "Fakt który zostaje"), true);
    assert.equal((await memoryWork(owner)).summaryText, "Fakt który zostaje");
  });

  it("requires an authenticated owner and exact confirmation for account erasure", async () => {
    const owner = await db.owner();
    for (const confirmation of [null, "", "usuwam"]) {
      await assert.rejects(owner.client.query("select public.delete_own_account($1)", [confirmation]), {
        code: "22023",
      });
    }
    await owner.client.query("select set_config('request.jwt.claim.sub', '', false)");
    await assert.rejects(owner.client.query("select public.delete_own_account('USUWAM')"), { code: "42501" });
    await owner.client.query("set role anon");
    await assert.rejects(owner.client.query("select public.delete_own_account('USUWAM')"), { code: "42501" });
    await assert.rejects(owner.client.query("select private.delete_own_account('USUWAM')"), { code: "42501" });
    assert.equal(
      (await db.admin.query("select count(*)::int n from auth.users where id=$1", [owner.userId])).rows[0].n,
      1,
    );
  });

  it("erases only the owner and all private data, including active work, while preserving audit and other accounts", async () => {
    const owner = await db.owner();
    const other = await db.owner();
    const historyId = (await owner.client.query("select public.claim_free_trial_session('cbt', 'cbt-guide') as result"))
      .rows[0].result.session.id;
    await owner.client.query(
      `update public.therapy_sessions set status='active', started_at=now(), expires_at=now()+interval '15 minutes' where id=$1`,
      [historyId],
    );
    await owner.client.query(
      `insert into public.session_messages(session_id, user_id, role, sequence_index, content)
      values ($1, $2, 'user', 0, 'Historia do usunięcia')`,
      [historyId, owner.userId],
    );
    await owner.client.query("update public.therapy_sessions set status='completed' where id=$1", [historyId]);
    await saveMemory(owner, await memoryWork(owner), "Pamięć do skasowania");
    await owner.client.query(
      `insert into public.therapy_sessions(user_id, modality_id, avatar_id, uses_avatar_memory)
      values ($1, 'cbt', 'cbt-guide', true)`,
      [owner.userId],
    );
    const activeId = await activeSession(owner);
    const turnId = randomUUID();
    const turn = await claim(owner.client, activeId, turnId);
    await complete(owner.client, activeId, turnId, turn.attempt_id);
    await endedMemorySession(other, "Dane innego konta");
    await db.admin.query(
      `insert into public.user_avatar_choices(user_id, modality_id, avatar_id) values ($1, 'cbt', 'cbt-guide');`,
      [owner.userId],
    );
    await db.admin.query(`insert into public.user_preferences(user_id, locale) values ($1, 'pl');`, [owner.userId]);
    await owner.client.query(
      `insert into public.session_summaries(session_id, user_id, summary_text) values ($1, $2, 'Podsumowanie');`,
      [historyId, owner.userId],
    );
    await db.admin.query(`insert into public.admin_users(user_id) values ($1)`, [owner.userId]);
    // Both an audit actor and a blocked target must remain deletable. Deleting
    // an admin must not silently unblock an unrelated account they blocked.
    await db.admin.query(
      `update public.admin_user_profiles set blocked_at=now(), blocked_by=$1, block_reason_code='owner_request' where user_id in ($1, $2)`,
      [owner.userId, other.userId],
    );
    const audit = await db.admin.query(
      `insert into public.admin_audit_events(admin_user_id, target_user_id, action, reason_code)
      values ($1, $1, 'account_blocked', 'owner_request') returning id`,
      [owner.userId],
    );

    const tables = [
      "therapy_sessions",
      "session_messages",
      "session_summaries",
      "session_trial_claims",
      "session_message_turns",
      "avatar_memories",
      "avatar_memory_sources",
      "avatar_session_contexts",
      "user_avatar_choices",
      "user_preferences",
      "admin_user_profiles",
      "admin_users",
    ];
    for (const table of tables) {
      assert.ok(
        (await db.admin.query(`select count(*)::int n from public.${table} where user_id=$1`, [owner.userId])).rows[0]
          .n > 0,
        `${table} must be seeded`,
      );
    }
    assert.equal(
      (await owner.client.query("select public.delete_own_account('USUWAM') deleted")).rows[0].deleted,
      true,
    );
    for (const table of tables) {
      assert.equal(
        (await db.admin.query(`select count(*)::int n from public.${table} where user_id=$1`, [owner.userId])).rows[0]
          .n,
        0,
        table,
      );
    }
    assert.equal(
      (await db.admin.query("select count(*)::int n from auth.users where id=$1", [owner.userId])).rows[0].n,
      0,
    );
    assert.equal(
      (await db.admin.query("select content from public.session_messages where user_id=$1", [other.userId])).rows[0]
        .content,
      "Dane innego konta",
    );
    const auditRow = (
      await db.admin.query("select admin_user_id, target_user_id from public.admin_audit_events where id=$1", [
        audit.rows[0].id,
      ])
    ).rows[0];
    assert.deepEqual(auditRow, { admin_user_id: null, target_user_id: null });
    const blocked = (
      await db.admin.query("select blocked_at, blocked_by from public.admin_user_profiles where user_id=$1", [
        other.userId,
      ])
    ).rows[0];
    assert.ok(blocked.blocked_at);
    assert.equal(blocked.blocked_by, null);
    // A stale caller cannot restore data or cause another deletion.
    assert.equal(
      (await owner.client.query("select public.delete_own_account('USUWAM') deleted")).rows[0].deleted,
      false,
    );
    await assert.rejects(activeSession(owner), { code: "23503" });
    await assert.rejects(complete(owner.client, activeId, turnId, turn.attempt_id));
  });

  it("prevents an in-flight reply from recreating data after account deletion commits", async () => {
    const owner = await db.owner();
    const sender = await db.owner(owner.userId);
    const sessionId = await activeSession(owner);
    const messageId = randomUUID();
    const turn = await claim(sender.client, sessionId, messageId);
    await owner.client.query("begin");
    try {
      await owner.client.query("select public.delete_own_account('USUWAM')");
      const pending = complete(sender.client, sessionId, messageId, turn.attempt_id).then(
        () => null,
        (error) => error,
      );
      await db.waitForLock(sender.client);
      await owner.client.query("commit");
      assert.equal((await pending).code, "P0002");
      assert.equal(
        (await db.admin.query("select count(*)::int n from public.session_messages where user_id=$1", [owner.userId]))
          .rows[0].n,
        0,
      );
    } finally {
      await owner.client.query("rollback");
    }
  });

  it("lets the Auth database role delete an account without private-table privileges", async () => {
    const owner = await db.owner();
    await endedMemorySession(owner);
    assert.equal(await saveMemory(owner, await memoryWork(owner), "Prywatna pamięć konta"), true);
    await owner.client.query(
      `insert into public.therapy_sessions
      (user_id, modality_id, avatar_id, uses_avatar_memory) values ($1, 'cbt', 'cbt-guide', true)`,
      [owner.userId],
    );
    await db.admin.query(
      "create role supabase_auth_admin nologin; grant usage on schema auth to supabase_auth_admin; grant select, delete on auth.users to supabase_auth_admin",
    );
    await db.admin.query("set role supabase_auth_admin");
    try {
      await db.admin.query("delete from auth.users where id=$1", [owner.userId]);
    } finally {
      await db.admin.query("reset role");
    }
    for (const table of ["avatar_memories", "avatar_memory_sources", "avatar_session_contexts"]) {
      assert.equal(
        (await db.admin.query(`select count(*)::int as n from public.${table} where user_id=$1`, [owner.userId]))
          .rows[0].n,
        0,
      );
    }
  });

  // Preferencja języka: własny wiersz przez upsert w kształcie PostgREST
  // (każda kolumna payloadu ląduje w `on conflict do update set`).
  const upsertLocale = (client, userId, locale) =>
    client.query(
      `insert into public.user_preferences(user_id, locale) values ($1, $2)
       on conflict (user_id) do update set user_id = excluded.user_id, locale = excluded.locale
       returning locale, created_at, updated_at`,
      [userId, locale],
    );

  it("lets an owner upsert and read only their own locale preference", async () => {
    const owner = await db.owner();
    const first = (await upsertLocale(owner.client, owner.userId, "pl")).rows[0];
    assert.equal(first.locale, "pl");
    const second = (await upsertLocale(owner.client, owner.userId, "en")).rows[0];
    assert.equal(second.locale, "en");
    assert.equal(String(second.created_at), String(first.created_at));
    assert.ok(second.updated_at >= first.updated_at);
    assert.equal(
      (await owner.client.query("select locale from public.user_preferences where user_id=$1", [owner.userId])).rows[0]
        .locale,
      "en",
    );
    await assert.rejects(upsertLocale(owner.client, owner.userId, "de"), { code: "23514" });
    await assert.rejects(
      owner.client.query("update public.user_preferences set updated_at = now() where user_id=$1", [owner.userId]),
      { code: "42501" },
    );
  });

  it("isolates locale preferences from other users, admins and anon", async () => {
    const owner = await db.owner();
    const other = await db.owner();
    await db.admin.query("insert into public.admin_users(user_id) values ($1)", [other.userId]);
    await upsertLocale(owner.client, owner.userId, "pl");
    assert.equal(
      (await other.client.query("select count(*)::int n from public.user_preferences where user_id=$1", [owner.userId]))
        .rows[0].n,
      0,
    );
    assert.equal(
      (await other.client.query("update public.user_preferences set locale='en' where user_id=$1", [owner.userId]))
        .rowCount,
      0,
    );
    await assert.rejects(upsertLocale(other.client, owner.userId, "en"), { code: "42501" });
    await upsertLocale(other.client, other.userId, "en");
    // Przeniesienie wiersza na cudze konto: RLS odrzuca (0 wierszy) albo
    // trigger przypina stary `user_id` — obie drogi blokują przejęcie.
    const moved = await other.client.query(
      "update public.user_preferences set user_id=$1 where user_id=$2 returning user_id",
      [owner.userId, other.userId],
    );
    assert.equal(moved.rows[0]?.user_id ?? other.userId, other.userId);
    assert.equal(
      (await db.admin.query("select count(*)::int n from public.user_preferences where user_id=$1", [owner.userId]))
        .rows[0].n,
      1,
    );
    const { rows } = await db.admin.query(
      "select has_table_privilege('anon','public.user_preferences','SELECT') as readable",
    );
    assert.equal(rows[0].readable, false);
    await other.client.query("set role anon");
    await assert.rejects(other.client.query("select * from public.user_preferences"), { code: "42501" });
  });
});
