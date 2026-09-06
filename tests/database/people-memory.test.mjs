import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "./database-fixture.mjs";

const AVATAR = "cbt-guide";
const OTHER_AVATAR = "psychodynamic-listener";
const PEOPLE_TABLES = [
  "people_memories",
  "people_memory_sources",
  "people_persons",
  "people_facts",
  "people_fact_sources",
  "people_person_mentions",
  "people_exclusions",
];
const PEOPLE_FUNCTIONS = [
  "public.get_people_memory_batch(text, integer)",
  "public.save_people_memory_batch(text, uuid, jsonb, jsonb)",
  "public.list_person_cards(text)",
  "public.get_person_card(uuid)",
  "public.update_person_card(uuid, text, text, text)",
  "public.update_person_fact(uuid, text)",
  "public.delete_person_fact(uuid)",
  "public.forget_person(uuid)",
  "public.set_people_memory_enabled(boolean)",
  "public.disable_and_delete_people_memory()",
];

describe("People cards against all migrations in real PostgreSQL", () => {
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

  // Bez limitu trzech rozmów planu free: te scenariusze potrzebują więcej sesji.
  async function premiumOwner(userId) {
    const owner = await db.owner(userId);
    await db.admin.query("update public.admin_user_profiles set premium_granted_at = now() where user_id = $1", [
      owner.userId,
    ]);
    return owner;
  }

  async function endedSession(owner, contents, { modality = "cbt", avatar = AVATAR } = {}) {
    const { rows } = await owner.client.query(
      `insert into public.therapy_sessions(user_id, modality_id, avatar_id, duration_bucket_seconds)
       values ($1, $2, $3, 900) returning id`,
      [owner.userId, modality, avatar],
    );
    const id = rows[0].id;
    await owner.client.query(
      `update public.therapy_sessions set status = 'active', started_at = clock_timestamp(),
       expires_at = clock_timestamp() + interval '15 minutes' where id = $1`,
      [id],
    );
    for (let index = 0; index < contents.length; index++) {
      await owner.client.query(
        `insert into public.session_messages(session_id, user_id, role, sequence_index, content)
         values ($1, $2, $3, $4, $5)`,
        [id, owner.userId, index % 2 === 0 ? "user" : "assistant", index, contents[index]],
      );
    }
    await owner.client.query("update public.therapy_sessions set status = 'completed' where id = $1", [id]);
    return id;
  }

  const peopleBatch = async (owner, avatar = AVATAR, maxChars = 16000) =>
    (await owner.client.query("select public.get_people_memory_batch($1, $2) as work", [avatar, maxChars])).rows[0]
      .work;
  const memoryBatch = async (owner, avatar = AVATAR) =>
    (await owner.client.query("select public.get_avatar_memory_batch($1) as work", [avatar])).rows[0].work;
  const cursorsOf = (work) => [
    ...new Map(
      work.messages.map(({ sessionId, sequenceIndex, characterOffset }) => [
        sessionId,
        { sessionId, sequenceIndex, characterOffset },
      ]),
    ).values(),
  ];
  const savePeople = async (owner, work, changes, { cursors = cursorsOf(work), avatar = AVATAR } = {}) =>
    (
      await owner.client.query("select public.save_people_memory_batch($1, $2, $3, $4) as saved", [
        avatar,
        work.revision,
        JSON.stringify(cursors),
        JSON.stringify(changes),
      ])
    ).rows[0].saved;
  const saveMemory = async (owner, work, text = "Pamięć", avatar = AVATAR) =>
    (
      await owner.client.query("select public.save_avatar_memory_batch($1, $2, $3, $4) as saved", [
        avatar,
        work.revision,
        JSON.stringify(cursorsOf(work)),
        text,
      ])
    ).rows[0].saved;
  const cards = async (owner, avatar = AVATAR) =>
    (await owner.client.query("select public.list_person_cards($1) as cards", [avatar])).rows[0].cards;
  const fact = (sourceSessionId, kind = "account", text = "Skomentowała pomysł przy zespole.") => ({
    kind,
    text,
    sourceSessionId,
  });
  const newPerson = (
    name,
    relation,
    sourceSessionId,
    facts = [fact(sourceSessionId, "who", `${name}: ${relation ?? "bez relacji"}`)],
  ) => ({
    name,
    relation,
    relationSourceSessionId: relation ? sourceSessionId : null,
    facts,
  });
  const noChanges = { newPersons: [], updates: [] };
  const tombstone = (owner, sessionId) =>
    owner.client.query(
      "update public.therapy_sessions set status = 'deleted', deletion_reason_code = 'user_request' where id = $1",
      [sessionId],
    );
  async function pinnedSession(owner, avatar = AVATAR, aboutPersonId = null) {
    const work = await memoryBatch(owner, avatar);
    if (work.messages.length > 0) assert.equal(await saveMemory(owner, work, "Pamięć", avatar), true);
    const { rows } = await owner.client.query(
      `insert into public.therapy_sessions(user_id, modality_id, avatar_id, uses_avatar_memory, about_person_id)
       values ($1, 'cbt', $2, true, $3) returning id`,
      [owner.userId, avatar, aboutPersonId],
    );
    return rows[0].id;
  }
  const brief = async (owner, sessionId) =>
    (
      await owner.client.query("select people_brief_text from public.avatar_session_contexts where session_id = $1", [
        sessionId,
      ])
    ).rows[0].people_brief_text;
  const count = async (table, userId) =>
    (await db.admin.query(`select count(*)::int as n from public.${table} where user_id = $1`, [userId])).rows[0].n;

  it("starts enabled and empty, on cursors independent from the avatar memory", async () => {
    const owner = await premiumOwner();
    const session = await endedSession(owner, ["Marta z pracy znowu skomentowała mój pomysł.", "Co wtedy poczułeś?"]);
    const empty = await peopleBatch(owner);
    assert.equal(empty.enabled, true);
    assert.deepEqual(empty.persons, []);
    assert.deepEqual(empty.forgottenPeople, []);
    assert.equal(empty.messages.length, 2);
    assert.equal(empty.messages[0].sessionId, session);
    assert.equal(await saveMemory(owner, await memoryBatch(owner)), true);
    assert.equal((await peopleBatch(owner)).messages.length, 2);
    assert.deepEqual((await memoryBatch(owner)).messages, []);
    assert.deepEqual((await memoryBatch(owner)).forgottenPeople, []);
    // Budżet partii jest przycinany do bezpiecznego zakresu.
    assert.equal((await peopleBatch(owner, AVATAR, 1)).messages.length, 2);
    assert.equal((await peopleBatch(owner, AVATAR, 1_000_000)).messages.length, 2);
  });

  it("records two people who share a name, with sources, mentions and owner-only cards", async () => {
    const owner = await premiumOwner();
    const session = await endedSession(owner, ["Marta z pracy i kuzynka Marta.", "Opowiedz o obu."]);
    const work = await peopleBatch(owner);
    assert.equal(
      await savePeople(owner, work, {
        newPersons: [
          newPerson("Marta", "koleżanka z pracy", session, [
            fact(session, "who", "Koleżanka z zespołu."),
            fact(session, "account", "Skomentowała pomysł przy zespole."),
          ]),
          newPerson("Marta", "kuzynka", session),
        ],
        updates: [],
      }),
      true,
    );
    const list = await cards(owner);
    assert.deepEqual(list.map((card) => card.relation).sort(), ["koleżanka z pracy", "kuzynka"]);
    const work2 = list.find((card) => card.relation === "koleżanka z pracy");
    assert.equal(work2.facts.length, 2);
    assert.deepEqual(
      work2.facts[0].sources.map((source) => source.sessionId),
      [session],
    );
    assert.equal(work2.mentionCount, 1);
    assert.equal(work2.avatarId, AVATAR);
    assert.equal(work2.nameLocked, false);
    assert.equal(work2.userNote, "");
    const again = await peopleBatch(owner);
    assert.deepEqual(again.messages, []);
    assert.equal(again.persons.length, 2);
    assert.notEqual(again.revision, work.revision);
    const indexed = again.persons.find((person) => person.relation === "koleżanka z pracy");
    assert.deepEqual(indexed.facts[0], {
      id: work2.facts[0].id,
      kind: "who",
      text: "Koleżanka z zespołu.",
      userEdited: false,
    });
    assert.equal(indexed.nameLocked, false);

    const other = await premiumOwner();
    assert.equal(
      (await other.client.query("select public.get_person_card($1) as card", [work2.id])).rows[0].card,
      null,
    );
    assert.deepEqual(await cards(other), []);
  });

  it("answers false on every race and rejects a source outside the batch with 22023", async () => {
    const owner = await premiumOwner();
    const first = await endedSession(owner, ["Marta.", "Tak."]);
    const work = await peopleBatch(owner);
    assert.equal(await savePeople(owner, work, noChanges), true);
    assert.equal(await savePeople(owner, work, noChanges), false);

    const second = await endedSession(owner, ["Marta znowu.", "Mhm."]);
    assert.equal(
      await savePeople(owner, await peopleBatch(owner), noChanges, {
        cursors: [{ sessionId: second, sequenceIndex: 1, characterOffset: 4 }],
      }),
      true,
    );
    const settled = await peopleBatch(owner);
    assert.equal(
      await savePeople(owner, settled, noChanges, {
        cursors: [{ sessionId: second, sequenceIndex: 0, characterOffset: 12 }],
      }),
      false,
    );

    const { rows } = await owner.client.query(
      `insert into public.therapy_sessions(user_id, modality_id, avatar_id, duration_bucket_seconds)
       values ($1, 'cbt', 'cbt-guide', 900) returning id`,
      [owner.userId],
    );
    const live = rows[0].id;
    await owner.client.query(
      `update public.therapy_sessions set status = 'active', started_at = clock_timestamp(),
       expires_at = clock_timestamp() + interval '15 minutes' where id = $1`,
      [live],
    );
    await owner.client.query(
      `insert into public.session_messages(session_id, user_id, role, sequence_index, content)
       values ($1, $2, 'user', 0, 'Trwa')`,
      [live, owner.userId],
    );
    assert.equal(
      await savePeople(owner, settled, noChanges, {
        cursors: [{ sessionId: live, sequenceIndex: 0, characterOffset: 4 }],
      }),
      false,
    );
    const elsewhere = await endedSession(owner, ["Inna perspektywa.", "Ok."], {
      modality: "psychodynamic",
      avatar: OTHER_AVATAR,
    });
    assert.equal(
      await savePeople(owner, settled, noChanges, {
        cursors: [{ sessionId: elsewhere, sequenceIndex: 1, characterOffset: 3 }],
      }),
      false,
    );

    await endedSession(owner, ["Trzecia.", "Ok."]);
    const third = await peopleBatch(owner);
    await assert.rejects(savePeople(owner, third, { newPersons: [newPerson("Ola", null, first)], updates: [] }), {
      code: "22023",
    });
    await assert.rejects(savePeople(owner, third, { newPersons: "nope", updates: [] }), { code: "22023" });
    assert.equal((await peopleBatch(owner)).messages.length, 2);
  });

  it("removes what a deleted conversation contributed and nothing else, refreshing pinned briefs", async () => {
    const owner = await premiumOwner();
    const sessionA = await endedSession(owner, ["Marta A.", "Ok."]);
    const sessionB = await endedSession(owner, ["Marta B.", "Ok."]);
    assert.equal(
      await savePeople(owner, await peopleBatch(owner), {
        newPersons: [
          newPerson("Marta", "koleżanka z pracy", sessionA, [
            fact(sessionA, "who", "Z pracy."),
            fact(sessionB, "account", "Pomogła."),
          ]),
        ],
        updates: [],
      }),
      true,
    );
    const [card] = await cards(owner);
    assert.equal(card.mentionCount, 2);
    const pinned = await pinnedSession(owner);
    const initial = await brief(owner, pinned);
    assert.ok(
      initial.includes("Marta (koleżanka z pracy)") && initial.includes("Z pracy.") && initial.includes("Pomogła."),
    );

    const sessionC = await endedSession(owner, ["Marta C.", "Ok."]);
    const factA = card.facts.find((entry) => entry.text === "Z pracy.");
    assert.equal(
      await savePeople(owner, await peopleBatch(owner), {
        newPersons: [],
        updates: [
          {
            personId: card.id,
            relation: null,
            relationSourceSessionId: null,
            addFacts: [],
            replaceFacts: [
              { factId: factA.id, kind: "who", text: "Z pracy, ten sam zespół.", sourceSessionId: sessionC },
            ],
            removeFactIds: [],
            mentionedSessionIds: [sessionC],
          },
        ],
      }),
      true,
    );
    const [replacedCard] = await cards(owner);
    const replaced = replacedCard.facts.find((entry) => entry.text === "Z pracy, ten sam zespół.");
    assert.deepEqual(replaced.sources.map((source) => source.sessionId).sort(), [sessionA, sessionC].sort());
    assert.equal(replacedCard.mentionCount, 3);

    await tombstone(owner, sessionA);
    const [afterA] = await cards(owner);
    assert.deepEqual(
      afterA.facts.map((entry) => entry.text),
      ["Pomogła."],
    );
    assert.equal(afterA.relation, null);
    assert.equal(afterA.mentionCount, 2);
    assert.equal(
      (
        await owner.client.query("select count(*)::int as n from public.people_memory_sources where session_id = $1", [
          sessionA,
        ])
      ).rows[0].n,
      0,
    );
    const refreshed = await brief(owner, pinned);
    assert.ok(!refreshed.includes("Z pracy") && refreshed.includes("Pomogła."));

    await tombstone(owner, sessionB);
    assert.deepEqual(await cards(owner), []);
    assert.equal(await brief(owner, pinned), null);
    assert.equal(await count("people_persons", owner.userId), 0);
    assert.equal(await count("people_facts", owner.userId), 0);
  });

  it("forgets a person durably, relation-aware, and invalidates the avatar memory like a deletion", async () => {
    const owner = await premiumOwner();
    const first = await endedSession(owner, ["Marta z pracy i kuzynka Marta.", "Ok."]);
    assert.equal(
      await savePeople(owner, await peopleBatch(owner), {
        newPersons: [newPerson("Marta", "koleżanka z pracy", first), newPerson("Marta", "kuzynka", first)],
        updates: [],
      }),
      true,
    );
    assert.equal(await saveMemory(owner, await memoryBatch(owner), "Pamięć z Martą"), true);
    const pinned = await pinnedSession(owner);
    const colleague = (await cards(owner)).find((card) => card.relation === "koleżanka z pracy");

    assert.equal((await owner.client.query("select public.forget_person($1) as ok", [colleague.id])).rows[0].ok, true);
    assert.equal((await owner.client.query("select public.forget_person($1) as ok", [colleague.id])).rows[0].ok, false);
    assert.deepEqual(
      (await cards(owner)).map((card) => card.relation),
      ["kuzynka"],
    );
    const forgotten = [{ name: "marta", relation: "koleżanka z pracy" }];
    assert.deepEqual((await peopleBatch(owner)).forgottenPeople, forgotten);
    const memory = await memoryBatch(owner);
    assert.deepEqual(memory.forgottenPeople, forgotten);
    assert.equal(memory.summaryText, "");
    assert.equal(memory.messages.length, 2);
    assert.equal(
      (
        await owner.client.query("select summary_text from public.avatar_session_contexts where session_id = $1", [
          pinned,
        ])
      ).rows[0].summary_text,
      "",
    );
    const refreshed = await brief(owner, pinned);
    assert.ok(refreshed.includes("kuzynka") && !refreshed.includes("koleżanka z pracy"));

    const second = await endedSession(owner, ["Znowu Marta.", "Ok."]);
    assert.equal(
      await savePeople(owner, await peopleBatch(owner), {
        newPersons: [
          newPerson("Marta", "koleżanka z pracy", second),
          newPerson("marta", null, second),
          newPerson("MARTA", "Koleżanka  z pracy", second),
          newPerson("Marta", "sąsiadka", second),
        ],
        updates: [],
      }),
      true,
    );
    assert.deepEqual((await cards(owner)).map((card) => card.relation).sort(), ["kuzynka", "sąsiadka"]);
  });

  it("keeps the user's corrections ahead of a later, correctly started batch and fences an in-flight one", async () => {
    const owner = await premiumOwner();
    const first = await endedSession(owner, ["Marta.", "Ok."]);
    assert.equal(
      await savePeople(owner, await peopleBatch(owner), {
        newPersons: [
          newPerson("Marta", "koleżanka", first, [
            fact(first, "account", "Skomentowała."),
            fact(first, "feeling", "Złość."),
          ]),
        ],
        updates: [],
      }),
      true,
    );
    const [card] = await cards(owner);
    const edited = (
      await owner.client.query("select public.update_person_card($1, $2, $3, $4) as card", [
        card.id,
        " Marta K. ",
        "koleżanka z pracy",
        "Moja uwaga",
      ])
    ).rows[0].card;
    assert.equal(edited.name, "Marta K.");
    assert.equal(edited.nameLocked, true);
    assert.equal(edited.relationLocked, true);
    assert.equal(edited.userNote, "Moja uwaga");
    await assert.rejects(
      owner.client.query("select public.update_person_card($1, $2, $3, $4)", [card.id, "", null, ""]),
      { code: "22023" },
    );
    const feeling = card.facts.find((entry) => entry.kind === "feeling");
    const account = card.facts.find((entry) => entry.kind === "account");
    const factEdited = (
      await owner.client.query("select public.update_person_fact($1, $2) as card", [
        feeling.id,
        "Raczej rozczarowanie.",
      ])
    ).rows[0].card;
    assert.equal(factEdited.facts.find((entry) => entry.id === feeling.id).userEdited, true);

    const second = await endedSession(owner, ["Marta znowu.", "Ok."]);
    const later = await peopleBatch(owner);
    assert.equal(later.persons[0].nameLocked, true);
    assert.equal(later.persons[0].relationLocked, true);
    assert.equal(
      await savePeople(owner, later, {
        newPersons: [],
        updates: [
          {
            personId: card.id,
            relation: "szefowa",
            relationSourceSessionId: second,
            addFacts: [fact(second, "wish", "Chcę spokojnie reagować.")],
            replaceFacts: [
              { factId: feeling.id, kind: "feeling", text: "Nadpisane.", sourceSessionId: second },
              { factId: account.id, kind: "account", text: "Doprecyzowane.", sourceSessionId: second },
            ],
            removeFactIds: [feeling.id],
            mentionedSessionIds: [second],
          },
        ],
      }),
      true,
    );
    const [afterBatch] = await cards(owner);
    assert.equal(afterBatch.name, "Marta K.");
    assert.equal(afterBatch.relation, "koleżanka z pracy");
    assert.deepEqual(
      afterBatch.facts.map((entry) => entry.text).sort(),
      ["Chcę spokojnie reagować.", "Doprecyzowane.", "Raczej rozczarowanie."].sort(),
    );
    assert.equal(afterBatch.mentionCount, 2);

    await endedSession(owner, ["Marta trzeci raz.", "Ok."]);
    const stale = await peopleBatch(owner);
    await owner.client.query("select public.update_person_card($1, $2, $3, $4)", [
      card.id,
      "Marta K.",
      "koleżanka z pracy",
      "Nowa uwaga",
    ]);
    assert.equal(await savePeople(owner, stale, noChanges), false);
    assert.equal(await savePeople(owner, await peopleBatch(owner), noChanges), true);

    const wish = afterBatch.facts.find((entry) => entry.kind === "wish");
    const afterDelete = (await owner.client.query("select public.delete_person_fact($1) as result", [wish.id])).rows[0]
      .result;
    assert.equal(afterDelete.personId, card.id);
    assert.equal(afterDelete.card.facts.length, 2);
    assert.equal(
      (await owner.client.query("select public.delete_person_fact($1) as result", [wish.id])).rows[0].result,
      null,
    );
  });

  it("disables by detaching briefs and refusing saves, re-enables from now on, and deletes everything but the memory", async () => {
    const owner = await premiumOwner();
    const first = await endedSession(owner, ["Marta.", "Ok."]);
    assert.equal(
      await savePeople(owner, await peopleBatch(owner), {
        newPersons: [newPerson("Marta", "koleżanka", first)],
        updates: [],
      }),
      true,
    );
    const pinned = await pinnedSession(owner);
    assert.ok(await brief(owner, pinned));
    await endedSession(owner, ["Marta znowu.", "Ok."]);
    const inflight = await peopleBatch(owner);
    assert.equal(inflight.messages.length, 2);

    assert.equal((await owner.client.query("select public.set_people_memory_enabled(false) as ok")).rows[0].ok, true);
    assert.equal(await brief(owner, pinned), null);
    assert.equal(await savePeople(owner, inflight, noChanges), false);
    const disabled = await peopleBatch(owner);
    assert.equal(disabled.enabled, false);
    assert.deepEqual(disabled.messages, []);
    assert.deepEqual(disabled.persons, []);
    assert.equal(await brief(owner, await pinnedSession(owner)), null);
    assert.equal((await memoryBatch(owner)).messages.length, 0);

    await endedSession(owner, ["W czasie wyłączenia.", "Ok."]);
    assert.equal((await owner.client.query("select public.set_people_memory_enabled(true) as ok")).rows[0].ok, true);
    const enabled = await peopleBatch(owner);
    assert.equal(enabled.enabled, true);
    assert.deepEqual(enabled.messages, []);
    assert.equal(enabled.persons.length, 1);
    assert.equal(await count("people_memory_sources", owner.userId), 3);
    await endedSession(owner, ["Po włączeniu.", "Ok."]);
    assert.equal((await peopleBatch(owner)).messages.length, 2);

    await owner.client.query(
      "insert into public.user_preferences(user_id, locale) values ($1, 'pl') on conflict (user_id) do update set locale = excluded.locale",
      [owner.userId],
    );
    assert.deepEqual(
      (
        await owner.client.query(
          "select locale, people_memory_enabled from public.user_preferences where user_id = $1",
          [owner.userId],
        )
      ).rows[0],
      { locale: "pl", people_memory_enabled: true },
    );
    await owner.client.query("select public.set_people_memory_enabled(false)");
    assert.equal(
      (await owner.client.query("select locale from public.user_preferences where user_id = $1", [owner.userId]))
        .rows[0].locale,
      "pl",
    );

    assert.equal(await saveMemory(owner, await memoryBatch(owner), "Pamięć zostaje"), true);
    assert.equal((await owner.client.query("select public.disable_and_delete_people_memory() as ok")).rows[0].ok, true);
    for (const table of PEOPLE_TABLES) assert.equal(await count(table, owner.userId), 0, table);
    assert.equal((await memoryBatch(owner)).summaryText, "Pamięć zostaje");
  });

  it("renders the chosen person first with one fact per kind, and rejects a foreign or cross-avatar choice", async () => {
    const owner = await premiumOwner();
    const first = await endedSession(owner, ["Marta i Ola.", "Ok."]);
    assert.equal(
      await savePeople(owner, await peopleBatch(owner), {
        newPersons: [
          newPerson("Ola", "siostra", first),
          newPerson("Marta", "koleżanka z pracy", first, [
            fact(first, "who", "Z zespołu."),
            fact(first, "account", "Pierwszy komentarz."),
            fact(first, "account", "Drugi komentarz."),
            fact(first, "feeling", "Złość."),
            fact(first, "wish", "Spokojnie reagować."),
          ]),
        ],
        updates: [],
      }),
      true,
    );
    const list = await cards(owner);
    const marta = list.find((card) => card.name === "Marta");
    await owner.client.query("select public.update_person_card($1, $2, $3, $4)", [
      marta.id,
      "Marta",
      "koleżanka z pracy",
      "Uwaga użytkownika",
    ]);
    const pinned = await pinnedSession(owner, AVATAR, marta.id);
    const text = await brief(owner, pinned);
    assert.ok(text.startsWith("- Marta (koleżanka z pracy) — the user chose to talk about this person today"), text);
    assert.ok(text.indexOf("Marta") < text.indexOf("Ola"));
    assert.ok(text.includes("user's own note: Uwaga użytkownika"));
    assert.equal((text.match(/what the user said happened:/g) ?? []).length, 1);
    assert.ok(text.includes("Drugi komentarz.") && !text.includes("Pierwszy komentarz."));
    for (const label of [
      "who they are to the user:",
      "how the user feels about it:",
      "what the user would like to change:",
    ]) {
      assert.ok(text.includes(label), label);
    }
    assert.equal(
      (await owner.client.query("select about_person_id from public.therapy_sessions where id = $1", [pinned])).rows[0]
        .about_person_id,
      marta.id,
    );

    const other = await premiumOwner();
    await assert.rejects(
      other.client.query(
        `insert into public.therapy_sessions(user_id, modality_id, avatar_id, about_person_id) values ($1, 'cbt', 'cbt-guide', $2)`,
        [other.userId, marta.id],
      ),
      { code: "P0012" },
    );
    await assert.rejects(
      owner.client.query(
        `insert into public.therapy_sessions(user_id, modality_id, avatar_id, about_person_id)
         values ($1, 'psychodynamic', $2, $3)`,
        [owner.userId, OTHER_AVATAR, marta.id],
      ),
      { code: "P0012" },
    );

    await owner.client.query("select public.forget_person($1)", [marta.id]);
    assert.equal(
      (await owner.client.query("select about_person_id from public.therapy_sessions where id = $1", [pinned])).rows[0]
        .about_person_id,
      null,
    );
    assert.ok((await brief(owner, pinned)).startsWith("- Ola (siostra)"));
  });

  it("records agreed attempts and later outcomes and ranks them right after who in the brief", async () => {
    const owner = await premiumOwner();
    const first = await endedSession(owner, ["Marta znowu.", "Spróbujesz z nią porozmawiać?", "Tak.", "Ok."]);
    assert.equal(
      await savePeople(owner, await peopleBatch(owner), {
        newPersons: [
          newPerson("Marta", "koleżanka z pracy", first, [
            fact(first, "who", "Z zespołu."),
            fact(first, "account", "Skomentowała pomysł."),
            fact(first, "feeling", "Złość."),
            fact(first, "wish", "Spokojnie reagować."),
            fact(first, "attempt", "Porozmawiać z nią w cztery oczy."),
            fact(first, "outcome", "Rozmowa się odbyła, było spokojnie."),
            fact(first, "homework", "Nieznany rodzaj jest pomijany."),
          ]),
        ],
        updates: [],
      }),
      true,
    );
    const [marta] = await cards(owner);
    assert.deepEqual(
      new Set(marta.facts.map((entry) => entry.kind)),
      new Set(["who", "account", "feeling", "wish", "attempt", "outcome"]),
    );
    await assert.rejects(
      owner.client.query(
        `insert into public.people_facts(person_id, user_id, avatar_id, kind, text) values ($1, $2, $3, 'homework', 'x')`,
        [marta.id, owner.userId, AVATAR],
      ),
      { code: "23514" },
    );

    const text = await brief(owner, await pinnedSession(owner));
    const labels = [
      "who they are to the user:",
      "something the user agreed to try:",
      "what the user later said came of it:",
      "what the user would like to change:",
      "what the user said happened:",
    ];
    const positions = labels.map((label) => text.indexOf(label));
    assert.ok(
      positions.every((position) => position >= 0),
      text,
    );
    assert.deepEqual(
      positions,
      [...positions].sort((a, b) => a - b),
    );
    // Five of six kinds fit: the feeling is the one that yields to the timeline.
    assert.ok(!text.includes("how the user feels about it:"), text);
    assert.ok(text.includes("Porozmawiać z nią w cztery oczy.") && text.includes("Rozmowa się odbyła"));
  });

  it("serializes a forget against a concurrent pin so no pinned brief carries a forgotten person", async () => {
    const owner = await premiumOwner();
    const first = await endedSession(owner, ["Marta i Ola.", "Ok."]);
    assert.equal(
      await savePeople(owner, await peopleBatch(owner), {
        newPersons: [newPerson("Marta", "koleżanka", first), newPerson("Ola", "siostra", first)],
        updates: [],
      }),
      true,
    );
    assert.equal(await saveMemory(owner, await memoryBatch(owner)), true);
    const marta = (await cards(owner)).find((card) => card.name === "Marta");
    const second = await db.owner(owner.userId);
    await owner.client.query("begin");
    // Ta sama kolejność blokad co w forget_person: najpierw pamięć awatara.
    await owner.client.query(
      "update public.avatar_memories set revision = revision where user_id = $1 and avatar_id = $2",
      [owner.userId, AVATAR],
    );
    const pin = second.client.query(
      `insert into public.therapy_sessions(user_id, modality_id, avatar_id, uses_avatar_memory)
       values ($1, 'cbt', 'cbt-guide', true) returning id`,
      [owner.userId],
    );
    await db.waitForLock(second.client);
    await owner.client.query("select public.forget_person($1)", [marta.id]);
    await owner.client.query("commit");
    // Przypięcie czekało na blokadę, więc widzi skutek zapomnienia: pamięć
    // awatara została unieważniona i start musi ją najpierw odbudować.
    await assert.rejects(pin, { code: "P0011" });
    assert.equal(await saveMemory(owner, await memoryBatch(owner)), true);
    const text = await brief(owner, await pinnedSession(owner));
    assert.ok(text.includes("Ola") && !text.includes("Marta"), text);
  });

  it("isolates every people table and function from other owners, admins and anon", async () => {
    const owner = await premiumOwner();
    const other = await premiumOwner();
    await db.admin.query("insert into public.admin_users(user_id) values ($1)", [other.userId]);
    const first = await endedSession(owner, ["Marta i Ola.", "Ok."]);
    assert.equal(
      await savePeople(owner, await peopleBatch(owner), {
        newPersons: [newPerson("Marta", "koleżanka", first), newPerson("Ola", "siostra", first)],
        updates: [],
      }),
      true,
    );
    const list = await cards(owner);
    const ola = list.find((card) => card.name === "Ola");
    const marta = list.find((card) => card.name === "Marta");
    await owner.client.query("select public.forget_person($1)", [ola.id]);
    for (const table of PEOPLE_TABLES) assert.ok((await count(table, owner.userId)) > 0, `${table} must be seeded`);

    for (const table of PEOPLE_TABLES) {
      assert.equal(
        (await other.client.query(`select count(*)::int as n from public.${table} where user_id = $1`, [owner.userId]))
          .rows[0].n,
        0,
        table,
      );
      assert.equal(
        (
          await other.client.query(`update public.${table} set user_id = $1 where user_id = $2`, [
            other.userId,
            owner.userId,
          ])
        ).rowCount,
        0,
        table,
      );
      assert.equal(
        (await other.client.query(`delete from public.${table} where user_id = $1`, [owner.userId])).rowCount,
        0,
        table,
      );
      const { rows } = await db.admin.query("select has_table_privilege('anon', $1, 'SELECT') as readable", [
        `public.${table}`,
      ]);
      assert.equal(rows[0].readable, false, table);
    }
    await assert.rejects(
      other.client.query("insert into public.people_memories(user_id, avatar_id) values ($1, 'cbt-guide')", [
        owner.userId,
      ]),
      { code: "42501" },
    );
    assert.equal(
      (await other.client.query("select public.get_person_card($1) as card", [marta.id])).rows[0].card,
      null,
    );
    assert.equal((await other.client.query("select public.forget_person($1) as ok", [marta.id])).rows[0].ok, false);
    assert.equal(
      (await other.client.query("select public.update_person_card($1, 'X', null, '') as card", [marta.id])).rows[0]
        .card,
      null,
    );
    assert.equal(
      (await other.client.query("select public.update_person_fact($1, 'X') as card", [marta.facts[0].id])).rows[0].card,
      null,
    );
    assert.equal(
      (await other.client.query("select public.delete_person_fact($1) as card", [marta.facts[0].id])).rows[0].card,
      null,
    );
    assert.deepEqual((await peopleBatch(other)).persons, []);
    assert.deepEqual(
      (await cards(owner)).map((card) => card.name),
      ["Marta"],
    );
    for (const signature of PEOPLE_FUNCTIONS) {
      const { rows } = await db.admin.query(
        `select has_function_privilege('anon', $1, 'EXECUTE') as anon_can,
                has_function_privilege('authenticated', $1, 'EXECUTE') as owner_can,
                (select prosecdef from pg_proc where oid = $1::regprocedure) as definer`,
        [signature],
      );
      assert.deepEqual(rows[0], { anon_can: false, owner_can: true, definer: false }, signature);
    }
  });

  it("cascades with the account, exclusions included, and survives the auth admin deleting the user", async () => {
    const owner = await premiumOwner();
    const first = await endedSession(owner, ["Marta i Ola.", "Ok."]);
    assert.equal(
      await savePeople(owner, await peopleBatch(owner), {
        newPersons: [newPerson("Marta", "koleżanka", first), newPerson("Ola", "siostra", first)],
        updates: [],
      }),
      true,
    );
    const ola = (await cards(owner)).find((card) => card.name === "Ola");
    await owner.client.query("select public.forget_person($1)", [ola.id]);
    await pinnedSession(owner);
    for (const table of PEOPLE_TABLES) assert.ok((await count(table, owner.userId)) > 0, `${table} must be seeded`);
    assert.equal((await owner.client.query("select public.delete_own_account('USUWAM') as ok")).rows[0].ok, true);
    for (const table of PEOPLE_TABLES) assert.equal(await count(table, owner.userId), 0, table);

    const second = await premiumOwner();
    const session = await endedSession(second, ["Marta.", "Ok."]);
    assert.equal(
      await savePeople(second, await peopleBatch(second), {
        newPersons: [newPerson("Marta", "koleżanka", session)],
        updates: [],
      }),
      true,
    );
    await db.admin.query(
      "create role supabase_auth_admin nologin; grant usage on schema auth to supabase_auth_admin; grant select, delete on auth.users to supabase_auth_admin",
    );
    await db.admin.query("set role supabase_auth_admin");
    try {
      await db.admin.query("delete from auth.users where id = $1", [second.userId]);
    } finally {
      await db.admin.query("reset role");
    }
    for (const table of PEOPLE_TABLES) assert.equal(await count(table, second.userId), 0, table);
  });

  it("keeps the legacy single-session memory RPCs working on the shared collector", async () => {
    const owner = await premiumOwner();
    await endedSession(owner, ["Ważny fakt.", "Ok."]);
    const legacy = (await owner.client.query("select public.get_avatar_memory_work($1) as work", [AVATAR])).rows[0]
      .work;
    assert.notEqual(legacy.sessionId, null);
    const last = legacy.messages.at(-1);
    assert.equal(
      (
        await owner.client.query("select public.save_avatar_memory_work($1, $2, $3, $4, $5, $6) as saved", [
          AVATAR,
          legacy.revision,
          legacy.sessionId,
          last.sequenceIndex,
          Array.from(last.content).length,
          "Pamięć starym RPC",
        ])
      ).rows[0].saved,
      true,
    );
    const batch = await memoryBatch(owner);
    assert.deepEqual(batch.messages, []);
    assert.equal(batch.summaryText, "Pamięć starym RPC");
    assert.deepEqual(batch.forgottenPeople, []);
  });
});
