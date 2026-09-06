import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "./database-fixture.mjs";

const AVATAR = "cbt-guide";
const OTHER_AVATAR = "psychodynamic-listener";
const TOPIC_TABLES = [
  "difficulties",
  "difficulty_aliases",
  "difficulty_persons",
  "difficulty_entries",
  "difficulty_entry_sources",
  "difficulty_mentions",
];
const TOPIC_FUNCTIONS = [
  "public.list_difficulty_cards(text)",
  "public.get_difficulty_card(uuid)",
  "public.update_difficulty_card(uuid, text, text, boolean)",
  "public.delete_difficulty(uuid)",
  "public.decide_difficulty_person(uuid, uuid, text)",
  "public.update_difficulty_entry(uuid, text)",
  "public.delete_difficulty_entry(uuid)",
  "public.merge_difficulties(uuid, uuid)",
  "public.set_topic_map_enabled(boolean)",
  "public.disable_and_delete_topic_map()",
];

describe("Topic map against all migrations in real PostgreSQL", () => {
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

  const batch = async (owner, avatar = AVATAR, maxChars = 16000) =>
    (await owner.client.query("select public.get_people_memory_batch($1, $2) as work", [avatar, maxChars])).rows[0]
      .work;
  const cursorsOf = (work) => [
    ...new Map(
      work.messages.map(({ sessionId, sequenceIndex, characterOffset }) => [
        sessionId,
        { sessionId, sequenceIndex, characterOffset },
      ]),
    ).values(),
  ];
  const save = async (owner, work, changes, { cursors = cursorsOf(work), avatar = AVATAR } = {}) =>
    (
      await owner.client.query("select public.save_people_memory_batch($1, $2, $3, $4) as saved", [
        avatar,
        work.revision,
        JSON.stringify(cursors),
        JSON.stringify({ newPersons: [], updates: [], newDifficulties: [], difficultyUpdates: [], ...changes }),
      ])
    ).rows[0].saved;
  const cards = async (owner, avatar = AVATAR) =>
    (await owner.client.query("select public.list_difficulty_cards($1) as cards", [avatar])).rows[0].cards;
  const card = async (owner, id) =>
    (await owner.client.query("select public.get_difficulty_card($1) as card", [id])).rows[0].card;
  const personCards = async (owner, avatar = AVATAR) =>
    (await owner.client.query("select public.list_person_cards($1) as cards", [avatar])).rows[0].cards;
  const entry = (sourceSessionId, kind, text, overrides = {}) => ({
    kind,
    text,
    effect: null,
    personId: null,
    newPersonPosition: null,
    parentEntryId: null,
    parentPosition: null,
    sourceSessionId,
    ...overrides,
  });
  const change = (overrides = {}) => ({
    addAliases: [],
    addPersons: [],
    addEntries: [],
    replaceEntries: [],
    removeEntryIds: [],
    mentionedSessionIds: [],
    ...overrides,
  });
  const newDifficulty = (label, sourceSessionId, overrides = {}) => ({
    label,
    ...change({ addEntries: [entry(sourceSessionId, "how", `${label}: jak to wygląda`)], ...overrides }),
  });
  const newPerson = (name, relation, sourceSessionId) => ({
    name,
    relation,
    relationSourceSessionId: relation ? sourceSessionId : null,
    facts: [{ kind: "who", text: `${name}: ${relation ?? "bez relacji"}`, sourceSessionId }],
  });
  const tombstone = (owner, sessionId) =>
    owner.client.query(
      "update public.therapy_sessions set status = 'deleted', deletion_reason_code = 'user_request' where id = $1",
      [sessionId],
    );
  const count = async (table, userId) =>
    (await db.admin.query(`select count(*)::int as n from public.${table} where user_id = $1`, [userId])).rows[0].n;
  const byKind = (difficulty, kind) => difficulty.entries.filter((item) => item.kind === kind);

  it("starts enabled with an empty index beside the people index and shares the cursors", async () => {
    const owner = await premiumOwner();
    const session = await endedSession(owner, ["Trudno mi odmawiać w pracy.", "Opowiedz więcej."]);
    const work = await batch(owner);
    assert.equal(work.enabled, true);
    assert.equal(work.topicsEnabled, true);
    assert.deepEqual(work.difficulties, []);
    assert.equal(work.messages.length, 2);
    assert.equal(await save(owner, work, { newDifficulties: [newDifficulty("Trudno mi odmawiać", session)] }), true);
    const again = await batch(owner);
    assert.deepEqual(again.messages, []);
    assert.equal(again.difficulties.length, 1);
    assert.equal(again.difficulties[0].label, "Trudno mi odmawiać");
    assert.equal(again.difficulties[0].archived, false);
    assert.deepEqual(again.difficulties[0].aliases, []);
    assert.equal(again.difficulties[0].entries[0].kind, "how");
    assert.ok(again.difficulties[0].entries[0].conversationAt);
    const [saved] = await cards(owner);
    assert.equal(saved.avatarId, AVATAR);
    assert.equal(saved.mentionCount, 1);
    assert.deepEqual(
      saved.entries[0].sources.map((source) => source.sessionId),
      [session],
    );
  });

  it("folds a new difficulty matching a label or alias into the existing row and adds aliases", async () => {
    const owner = await premiumOwner();
    const first = await endedSession(owner, ["Nie umiem odmawiać.", "Mhm."]);
    assert.equal(
      await save(owner, await batch(owner), {
        newDifficulties: [
          newDifficulty("Nie umiem odmawiać", first, {
            addAliases: [{ text: "zawsze się zgadzam", sourceSessionId: first }],
          }),
        ],
      }),
      true,
    );
    const second = await endedSession(owner, ["Zawsze się zgadzam, nawet jak nie chcę.", "Mhm."]);
    assert.equal(
      await save(owner, await batch(owner), {
        newDifficulties: [
          // Etykieta równa aliasowi → składanie.
          newDifficulty("Zawsze się zgadzam", second, {
            addAliases: [{ text: "brak asertywności", sourceSessionId: second }],
          }),
          // Alias równy istniejącej etykiecie → składanie po własnym aliasie.
          newDifficulty("Coś zupełnie nowego", second, {
            addAliases: [{ text: "NIE UMIEM ODMAWIAĆ", sourceSessionId: second }],
          }),
        ],
      }),
      true,
    );
    const list = await cards(owner);
    assert.equal(list.length, 1);
    assert.equal(list[0].label, "Nie umiem odmawiać");
    assert.deepEqual(
      list[0].aliases.map((alias) => alias.alias),
      ["zawsze się zgadzam", "brak asertywności"],
    );
    assert.equal(list[0].entries.length, 3);
    assert.equal(list[0].mentionCount, 2);
    // Alias równy jakiejkolwiek etykiecie w perspektywie jest pomijany; limit sześciu.
    const third = await endedSession(owner, ["Jeszcze.", "Mhm."]);
    assert.equal(
      await save(owner, await batch(owner), { newDifficulties: [newDifficulty("Odkładanie zadań", third)] }),
      true,
    );
    const fourth = await endedSession(owner, ["I jeszcze.", "Mhm."]);
    assert.equal(
      await save(owner, await batch(owner), {
        difficultyUpdates: [
          {
            difficultyId: list[0].id,
            ...change({
              addAliases: [
                { text: "odkładanie zadań", sourceSessionId: fourth },
                ...Array.from({ length: 6 }, (_, i) => ({ text: `alias ${i}`, sourceSessionId: fourth })),
              ],
            }),
          },
        ],
      }),
      true,
    );
    assert.equal((await cards(owner)).length, 2);
    const updated = (await cards(owner)).find((item) => item.id === list[0].id);
    assert.equal(updated.aliases.length, 6);
    assert.ok(!updated.aliases.some((alias) => alias.alias === "odkładanie zadań"));
  });

  it("links people by id or by position in the same batch, keeps entries at persons behind edges, and confirms suggested edges", async () => {
    const owner = await premiumOwner();
    const session = await endedSession(owner, ["Marta z pracy i Anna.", "Opowiedz."]);
    assert.equal(
      await save(owner, await batch(owner), {
        newPersons: [newPerson("Marta", "przełożona", session), newPerson("Anna", "koleżanka", session)],
        newDifficulties: [
          newDifficulty("Trudno mi odmawiać", session, {
            addPersons: [
              { personId: null, newPersonPosition: 0, uncertain: false },
              { personId: null, newPersonPosition: 1, uncertain: true },
              { personId: null, newPersonPosition: 5, uncertain: false },
            ],
            addEntries: [
              entry(session, "how", "Ogólnie."),
              entry(session, "how", "Biorę dodatkowe zadania.", { newPersonPosition: 0 }),
              entry(session, "how", "Zgadzam się na spotkania.", { newPersonPosition: 1 }),
              entry(session, "how", "Przy nikim.", { newPersonPosition: 5 }),
            ],
          }),
        ],
      }),
      true,
    );
    const persons = await personCards(owner);
    const marta = persons.find((person) => person.name === "Marta");
    const anna = persons.find((person) => person.name === "Anna");
    let [difficulty] = await cards(owner);
    assert.deepEqual(difficulty.persons.map((link) => [link.name, link.state, link.userDecided]).sort(), [
      ["Anna", "suggested", false],
      ["Marta", "confirmed", false],
    ]);
    assert.equal(difficulty.entries.length, 3);
    assert.equal(difficulty.entries.filter((item) => item.personId === marta.id).length, 1);

    // Kolejna partia: pewne powiązanie potwierdza niepewne; wpis przy osobie bez krawędzi odpada.
    const next = await endedSession(owner, ["Anna znowu.", "Mhm."]);
    const olga = newPerson("Olga", "sąsiadka", next);
    assert.equal(
      await save(owner, await batch(owner), {
        newPersons: [olga],
        difficultyUpdates: [
          {
            difficultyId: difficulty.id,
            ...change({
              addPersons: [{ personId: anna.id, newPersonPosition: null, uncertain: false }],
              addEntries: [
                entry(next, "how", "Przy Annie znowu.", { personId: anna.id }),
                entry(next, "how", "Przy Oldze bez krawędzi.", { newPersonPosition: 0 }),
              ],
            }),
          },
        ],
      }),
      true,
    );
    [difficulty] = await cards(owner);
    assert.equal(difficulty.persons.find((link) => link.personId === anna.id).state, "confirmed");
    assert.equal(difficulty.entries.length, 4);

    // Decyzja użytkownika: odrzucenie kasuje wpisy przy osobie i blokuje model.
    const rejected = (
      await owner.client.query("select public.decide_difficulty_person($1, $2, 'rejected') as card", [
        difficulty.id,
        anna.id,
      ])
    ).rows[0].card;
    assert.deepEqual(
      rejected.persons.find((link) => link.personId === anna.id),
      { personId: anna.id, name: "Anna", relation: "koleżanka", state: "rejected", userDecided: true },
    );
    assert.equal(rejected.entries.filter((item) => item.personId === anna.id).length, 0);
    const later = await endedSession(owner, ["Anna po raz trzeci.", "Mhm."]);
    assert.equal(
      await save(owner, await batch(owner), {
        difficultyUpdates: [
          {
            difficultyId: difficulty.id,
            ...change({
              addPersons: [{ personId: anna.id, newPersonPosition: null, uncertain: false }],
              addEntries: [entry(later, "how", "Nie powinno wejść.", { personId: anna.id })],
            }),
          },
        ],
      }),
      true,
    );
    [difficulty] = await cards(owner);
    assert.equal(difficulty.persons.find((link) => link.personId === anna.id).state, "rejected");
    assert.equal(
      difficulty.entries.some((item) => item.text === "Nie powinno wejść."),
      false,
    );
    // Ręczne powiązanie: użytkownik sam łączy osobę; cudza osoba → null.
    const olgaCard = (await personCards(owner)).find((person) => person.name === "Olga");
    const linked = (
      await owner.client.query("select public.decide_difficulty_person($1, $2, 'confirmed') as card", [
        difficulty.id,
        olgaCard.id,
      ])
    ).rows[0].card;
    assert.equal(linked.persons.find((link) => link.personId === olgaCard.id).userDecided, true);
    const other = await premiumOwner();
    const foreign = await endedSession(other, ["Ktoś.", "Ok."]);
    await save(other, await batch(other), { newPersons: [newPerson("Ktoś", null, foreign)] });
    const foreignPerson = (await personCards(other))[0];
    assert.equal(
      (
        await owner.client.query("select public.decide_difficulty_person($1, $2, 'confirmed') as card", [
          difficulty.id,
          foreignPerson.id,
        ])
      ).rows[0].card,
      null,
    );
  });

  it("chains suggestion → agreement → outcome by position and by id, coerces bad parents and effects, and replaces in place", async () => {
    const owner = await premiumOwner();
    const first = await endedSession(owner, ["Odkładam ważne zadania.", "Może pierwszy mały krok?"]);
    assert.equal(
      await save(owner, await batch(owner), {
        newDifficulties: [
          newDifficulty("Odkładanie zadań", first, {
            addEntries: [
              entry(first, "suggested", "Wybrać pierwszy mały krok."),
              entry(first, "agreed", "Spróbuję od jutra.", { parentPosition: 0 }),
              // how nie może mieć rodzica; effect na how jest zerowany zamiast błędu.
              entry(first, "how", "Odkładam do wieczora.", { parentPosition: 0, effect: "worse" }),
              // outcome → how to zła para → rodzic zerowany, effect zostaje.
              entry(first, "outcome", "Bez rodzica.", { parentPosition: 2, effect: "same" }),
            ],
          }),
        ],
      }),
      true,
    );
    let [difficulty] = await cards(owner);
    const suggested = byKind(difficulty, "suggested")[0];
    const agreed = byKind(difficulty, "agreed")[0];
    const how = byKind(difficulty, "how").find((item) => item.text === "Odkładam do wieczora.");
    const orphan = byKind(difficulty, "outcome")[0];
    assert.equal(agreed.parentEntryId, suggested.id);
    assert.equal(how.parentEntryId, null);
    assert.equal(how.effect, null);
    assert.equal(orphan.parentEntryId, null);
    assert.equal(orphan.effect, "same");

    const second = await endedSession(owner, ["Zrobiłem pierwszy krok, pomogło.", "Świetnie."]);
    assert.equal(
      await save(owner, await batch(owner), {
        difficultyUpdates: [
          {
            difficultyId: difficulty.id,
            ...change({
              addEntries: [
                entry(second, "outcome", "Pomogło.", { parentEntryId: agreed.id, effect: "better" }),
                entry(second, "outcome", "Wprost do propozycji.", { parentEntryId: suggested.id, effect: "resolved" }),
                entry(second, "update", "Ogólnie lepiej.", { effect: "better" }),
              ],
              replaceEntries: [
                {
                  entryId: suggested.id,
                  kind: "suggested",
                  text: "Wybrać jeden mały krok.",
                  effect: "better",
                  sourceSessionId: second,
                },
                { entryId: agreed.id, kind: "outcome", text: "Zły rodzaj.", effect: null, sourceSessionId: second },
              ],
            }),
          },
        ],
      }),
      true,
    );
    [difficulty] = await cards(owner);
    const outcomes = byKind(difficulty, "outcome");
    assert.deepEqual(
      outcomes.map((item) => [item.text, item.parentEntryId, item.effect]).sort(),
      [
        ["Bez rodzica.", null, "same"],
        ["Pomogło.", agreed.id, "better"],
        ["Wprost do propozycji.", suggested.id, "resolved"],
      ].sort(),
    );
    const replaced = byKind(difficulty, "suggested")[0];
    assert.equal(replaced.id, suggested.id);
    assert.equal(replaced.text, "Wybrać jeden mały krok.");
    assert.equal(replaced.effect, null);
    assert.deepEqual(replaced.sources.map((source) => source.sessionId).sort(), [first, second].sort());
    assert.equal(byKind(difficulty, "agreed")[0].text, "Spróbuję od jutra.");
    assert.equal(byKind(difficulty, "agreed")[0].parentEntryId, suggested.id);
    assert.deepEqual(difficulty.currentState && [difficulty.currentState.text, difficulty.currentState.effect], [
      "Ogólnie lepiej.",
      "better",
    ]);
    // Bezpośredni insert z niedozwoloną parą jest odrzucany przez trigger.
    await assert.rejects(
      owner.client.query(
        `insert into public.difficulty_entries(difficulty_id, user_id, avatar_id, kind, text, parent_entry_id)
         values ($1, $2, $3, 'outcome', 'x', $4)`,
        [difficulty.id, owner.userId, AVATAR, how.id],
      ),
      { code: "23514" },
    );
    await assert.rejects(
      owner.client.query(
        `insert into public.difficulty_entries(difficulty_id, user_id, avatar_id, kind, text, effect)
         values ($1, $2, $3, 'how', 'x', 'better')`,
        [difficulty.id, owner.userId, AVATAR],
      ),
      { code: "23514" },
    );
  });

  it("keeps a rolling window of updates ordered by source conversation, never evicting a user-edited one", async () => {
    const owner = await premiumOwner();
    const sessions = [];
    for (let i = 0; i < 8; i++) sessions.push(await endedSession(owner, [`Stan ${i}.`, "Mhm."]));
    const work = await batch(owner);
    const cursorsFor = (ids) => cursorsOf(work).filter((cursor) => ids.includes(cursor.sessionId));
    // Pierwsza partia obejmuje trzy rozmowy, druga pięć kolejnych.
    assert.equal(
      await save(
        owner,
        work,
        {
          newDifficulties: [
            newDifficulty("Napięcie", sessions[0], {
              addEntries: [
                entry(sessions[0], "how", "Opis."),
                ...sessions.slice(0, 3).map((id, i) => entry(id, "update", `Stan ${i}`, { effect: "same" })),
              ],
            }),
          ],
        },
        { cursors: cursorsFor(sessions.slice(0, 3)) },
      ),
      true,
    );
    let [difficulty] = await cards(owner);
    const edited = byKind(difficulty, "update").find((item) => item.text === "Stan 0");
    await owner.client.query("select public.update_difficulty_entry($1, $2)", [edited.id, "Stan 0 poprawiony"]);
    const work2 = await batch(owner);
    assert.equal(work2.messages.length, 10);
    assert.equal(
      await save(owner, work2, {
        difficultyUpdates: [
          {
            difficultyId: difficulty.id,
            ...change({
              addEntries: sessions.slice(3).map((id, i) => entry(id, "update", `Stan ${i + 3}`, { effect: "better" })),
            }),
          },
        ],
      }),
      true,
    );
    [difficulty] = await cards(owner);
    const updates = byKind(difficulty, "update");
    assert.equal(updates.length, 7);
    assert.ok(updates.some((item) => item.text === "Stan 0 poprawiony" && item.userEdited));
    // Okno liczy sześć nieedytowanych: z ośmiu odpada tylko najstarszy nieedytowany.
    assert.ok(!updates.some((item) => item.text === "Stan 1"));
    assert.ok(updates.some((item) => item.text === "Stan 2"));
    assert.equal(difficulty.currentState.text, "Stan 7");
    assert.equal(byKind(difficulty, "how").length, 1);
  });

  it("caps entries, persons and difficulties per perspective without failing the batch", async () => {
    const owner = await premiumOwner();
    const session = await endedSession(owner, ["Dużo.", "Mhm."]);
    assert.equal(
      await save(owner, await batch(owner), {
        newDifficulties: Array.from({ length: 31 }, (_, i) =>
          newDifficulty(`Trudność ${i}`, session, {
            addEntries: Array.from({ length: 14 }, (_, j) => entry(session, "how", `Wpis ${j}`)),
          }),
        ),
      }),
      true,
    );
    const list = await cards(owner);
    assert.equal(list.length, 30);
    assert.equal(list[0].entries.length, 12);
  });

  it("archives only by the user, keeps recording under an archived difficulty and flags new entries", async () => {
    const owner = await premiumOwner();
    const first = await endedSession(owner, ["Napięcie.", "Mhm."]);
    assert.equal(await save(owner, await batch(owner), { newDifficulties: [newDifficulty("Napięcie", first)] }), true);
    let [difficulty] = await cards(owner);
    const archived = (
      await owner.client.query("select public.update_difficulty_card($1, $2, $3, true) as card", [
        difficulty.id,
        "Napięcie",
        "Moja notatka",
      ])
    ).rows[0].card;
    assert.ok(archived.archivedAt);
    assert.equal(archived.labelLocked, false);
    assert.equal(archived.hasNewEntriesSinceArchived, false);
    const second = await endedSession(owner, ["Napięcie wróciło.", "Mhm."]);
    assert.equal(await save(owner, await batch(owner), { newDifficulties: [newDifficulty("NAPIĘCIE", second)] }), true);
    const list = await cards(owner);
    assert.equal(list.length, 1);
    [difficulty] = list;
    assert.ok(difficulty.archivedAt);
    assert.equal(difficulty.hasNewEntriesSinceArchived, true);
    assert.equal(difficulty.entries.length, 2);
    const unarchived = (
      await owner.client.query("select public.update_difficulty_card($1, $2, $3, false) as card", [
        difficulty.id,
        "Napięcie",
        "",
      ])
    ).rows[0].card;
    assert.equal(unarchived.archivedAt, null);
  });

  it("rejects a rename onto another difficulty's label or alias and turns the old label into an alias", async () => {
    const owner = await premiumOwner();
    const session = await endedSession(owner, ["Dwie trudności.", "Mhm."]);
    assert.equal(
      await save(owner, await batch(owner), {
        newDifficulties: [
          newDifficulty("Odmawianie", session, { addAliases: [{ text: "asertywność", sourceSessionId: session }] }),
          newDifficulty("Odkładanie", session),
        ],
      }),
      true,
    );
    const list = await cards(owner);
    const odkladanie = list.find((item) => item.label === "Odkładanie");
    for (const taken of ["odmawianie", "Asertywność"]) {
      await assert.rejects(
        owner.client.query("select public.update_difficulty_card($1, $2, '', false)", [odkladanie.id, taken]),
        { code: "P0014" },
      );
    }
    await assert.rejects(
      owner.client.query("select public.update_difficulty_card($1, $2, '', false)", [odkladanie.id, ""]),
      { code: "22023" },
    );
    const renamed = (
      await owner.client.query("select public.update_difficulty_card($1, $2, $3, false) as card", [
        odkladanie.id,
        "Prokrastynacja",
        "",
      ])
    ).rows[0].card;
    assert.equal(renamed.label, "Prokrastynacja");
    assert.equal(renamed.labelLocked, true);
    assert.deepEqual(
      renamed.aliases.map((alias) => alias.alias),
      ["Odkładanie"],
    );
    // Stare sformułowanie dalej składa się do tej trudności.
    const later = await endedSession(owner, ["Odkładanie znowu.", "Mhm."]);
    assert.equal(
      await save(owner, await batch(owner), { newDifficulties: [newDifficulty("odkładanie", later)] }),
      true,
    );
    assert.equal((await cards(owner)).length, 2);
    assert.equal((await card(owner, odkladanie.id)).entries.length, 2);
    // Zmiana etykiety na własny alias jest dozwolona i zdejmuje ten alias.
    const own = (
      await owner.client.query("select public.update_difficulty_card($1, $2, $3, false) as card", [
        odkladanie.id,
        "odkładanie",
        "",
      ])
    ).rows[0].card;
    assert.equal(own.label, "odkładanie");
    assert.deepEqual(
      own.aliases.map((alias) => alias.alias),
      ["Prokrastynacja"],
    );
  });

  it("merges: edge precedence, rejected target edge drops entries, parents kept, aliases and mentions carried", async () => {
    const owner = await premiumOwner();
    const session = await endedSession(owner, ["Marta i Anna.", "Mhm."]);
    assert.equal(
      await save(owner, await batch(owner), {
        newPersons: [newPerson("Marta", "przełożona", session), newPerson("Anna", "koleżanka", session)],
        newDifficulties: [
          newDifficulty("Cel", session, {
            addAliases: [{ text: "cel alias", sourceSessionId: session }],
            addPersons: [{ personId: null, newPersonPosition: 0, uncertain: true }],
            addEntries: [entry(session, "how", "Cel: ogólnie.")],
          }),
          newDifficulty("Źródło", session, {
            addAliases: [{ text: "źródło alias", sourceSessionId: session }],
            addPersons: [
              { personId: null, newPersonPosition: 0, uncertain: false },
              { personId: null, newPersonPosition: 1, uncertain: false },
            ],
            addEntries: [
              entry(session, "suggested", "Propozycja.", { newPersonPosition: 1 }),
              entry(session, "agreed", "Zgoda.", { parentPosition: 0 }),
              entry(session, "how", "Przy Marcie.", { newPersonPosition: 0 }),
            ],
          }),
        ],
      }),
      true,
    );
    const anna = (await personCards(owner)).find((person) => person.name === "Anna");
    let list = await cards(owner);
    const target = list.find((item) => item.label === "Cel");
    const source = list.find((item) => item.label === "Źródło");
    // Użytkownik odrzuca Annę w celu; Marta w celu niepewna, w źródle pewna.
    await owner.client.query("select public.decide_difficulty_person($1, $2, 'rejected')", [target.id, anna.id]);
    await owner.client.query(
      "insert into public.therapy_sessions(user_id, modality_id, avatar_id, duration_bucket_seconds, about_difficulty_id) values ($1, 'cbt', $2, 900, $3)",
      [owner.userId, AVATAR, source.id],
    );
    await assert.rejects(owner.client.query("select public.merge_difficulties($1, $1)", [source.id]), {
      code: "22023",
    });
    const merged = (
      await owner.client.query("select public.merge_difficulties($1, $2) as card", [source.id, target.id])
    ).rows[0].card;
    assert.equal(merged.id, target.id);
    assert.deepEqual(merged.persons.map((link) => [link.name, link.state, link.userDecided]).sort(), [
      ["Anna", "rejected", true],
      ["Marta", "confirmed", false],
    ]);
    const suggested = byKind(merged, "suggested");
    assert.equal(suggested.length, 0, "entry at the rejected person is dropped");
    const agreed = byKind(merged, "agreed")[0];
    assert.equal(agreed.text, "Zgoda.");
    assert.equal(agreed.parentEntryId, null, "parent deleted → child stays in chronology");
    assert.equal(byKind(merged, "how").length, 2);
    assert.deepEqual(merged.aliases.map((alias) => alias.alias).sort(), ["Źródło", "cel alias", "źródło alias"].sort());
    assert.equal(merged.mentionCount, 1);
    list = await cards(owner);
    assert.equal(list.length, 1);
    assert.equal(
      (
        await owner.client.query(
          "select about_difficulty_id from public.therapy_sessions where about_difficulty_id = $1",
          [target.id],
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (await owner.client.query("select public.merge_difficulties($1, $2) as card", [source.id, target.id])).rows[0]
        .card,
      null,
    );
    // Między perspektywami → 22023.
    const elsewhere = await endedSession(owner, ["Inna.", "Ok."], { modality: "psychodynamic", avatar: OTHER_AVATAR });
    assert.equal(
      await save(
        owner,
        await batch(owner, OTHER_AVATAR),
        { newDifficulties: [newDifficulty("Obca", elsewhere)] },
        {
          avatar: OTHER_AVATAR,
        },
      ),
      true,
    );
    const foreign = (await cards(owner, OTHER_AVATAR))[0];
    await assert.rejects(owner.client.query("select public.merge_difficulties($1, $2)", [foreign.id, target.id]), {
      code: "22023",
    });
    // Trudność wybrana na dziś z innej perspektywy → P0013.
    await assert.rejects(
      owner.client.query(
        "insert into public.therapy_sessions(user_id, modality_id, avatar_id, duration_bucket_seconds, about_difficulty_id) values ($1, 'cbt', $2, 900, $3)",
        [owner.userId, AVATAR, foreign.id],
      ),
      { code: "P0013" },
    );
  });

  it("forgets a person by dropping their edges and entries, keeps general difficulties and prunes empty ones", async () => {
    const owner = await premiumOwner();
    const session = await endedSession(owner, ["Marta.", "Mhm."]);
    assert.equal(
      await save(owner, await batch(owner), {
        newPersons: [newPerson("Marta", "przełożona", session)],
        newDifficulties: [
          newDifficulty("Ogólna", session, {
            addPersons: [{ personId: null, newPersonPosition: 0, uncertain: false }],
            addEntries: [
              entry(session, "how", "Ogólnie."),
              entry(session, "how", "Przy Marcie.", { newPersonPosition: 0 }),
            ],
          }),
          newDifficulty("Tylko z Martą", session, {
            addPersons: [{ personId: null, newPersonPosition: 0, uncertain: false }],
            addEntries: [entry(session, "how", "Przy Marcie.", { newPersonPosition: 0 })],
          }),
        ],
      }),
      true,
    );
    const marta = (await personCards(owner))[0];
    assert.equal((await cards(owner)).length, 2);
    await owner.client.query("select public.forget_person($1)", [marta.id]);
    const list = await cards(owner);
    assert.equal(list.length, 1);
    assert.equal(list[0].label, "Ogólna");
    assert.deepEqual(list[0].persons, []);
    assert.equal(list[0].entries.length, 1);
  });

  it("removes what a deleted conversation contributed: entries by source, mentions, empty edges and difficulties; children lose their parent", async () => {
    const owner = await premiumOwner();
    const first = await endedSession(owner, ["Pierwsza.", "Mhm."]);
    const second = await endedSession(owner, ["Druga.", "Mhm."]);
    assert.equal(
      await save(owner, await batch(owner), {
        newPersons: [newPerson("Marta", "przełożona", first)],
        newDifficulties: [
          newDifficulty("Trwała", first, {
            addPersons: [{ personId: null, newPersonPosition: 0, uncertain: false }],
            addEntries: [
              entry(first, "suggested", "Z pierwszej."),
              entry(second, "agreed", "Z drugiej.", { parentPosition: 0 }),
              entry(first, "how", "Przy Marcie z pierwszej.", { newPersonPosition: 0 }),
            ],
          }),
          newDifficulty("Ulotna", first),
        ],
      }),
      true,
    );
    assert.equal((await cards(owner)).length, 2);
    await tombstone(owner, first);
    const list = await cards(owner);
    assert.equal(list.length, 1);
    const [durable] = list;
    assert.equal(durable.label, "Trwała");
    assert.deepEqual(durable.persons, [], "edge without entries and without a user decision is pruned");
    assert.equal(durable.entries.length, 1);
    assert.equal(durable.entries[0].kind, "agreed");
    assert.equal(durable.entries[0].parentEntryId, null);
    assert.equal(durable.mentionCount, 1);
  });

  it("refuses saves when both parts are off, runs the map alone when cards are off, and re-enables from now on", async () => {
    const owner = await premiumOwner();
    const first = await endedSession(owner, ["Marta i trudność.", "Mhm."]);
    assert.equal(
      await save(owner, await batch(owner), {
        newPersons: [newPerson("Marta", "przełożona", first)],
        newDifficulties: [newDifficulty("Trudność", first)],
      }),
      true,
    );
    await owner.client.query("select public.set_people_memory_enabled(false)");
    const second = await endedSession(owner, ["Bez kart.", "Mhm."]);
    const work = await batch(owner);
    assert.equal(work.enabled, false);
    assert.equal(work.topicsEnabled, true);
    assert.deepEqual(work.persons, []);
    assert.deepEqual(work.forgottenPeople, []);
    assert.equal(work.difficulties.length, 1);
    assert.equal(work.messages.length, 2);
    // Zmiany osób są pomijane, trudności zapisane, kursory idą dalej.
    assert.equal(
      await save(owner, work, {
        newPersons: [newPerson("Anna", "koleżanka", second)],
        difficultyUpdates: [
          {
            difficultyId: work.difficulties[0].id,
            ...change({ addEntries: [entry(second, "coping", "Sam sobie radzę.")] }),
          },
        ],
      }),
      true,
    );
    assert.equal((await personCards(owner)).length, 1);
    assert.equal((await cards(owner))[0].entries.length, 2);
    assert.deepEqual((await batch(owner)).messages, []);

    await owner.client.query("select public.set_topic_map_enabled(false)");
    const third = await endedSession(owner, ["Obie wyłączone.", "Mhm."]);
    const off = await batch(owner);
    assert.equal(off.topicsEnabled, false);
    assert.deepEqual(off.messages, []);
    assert.deepEqual(off.difficulties, []);
    assert.equal(
      await save(owner, off, {}, { cursors: [{ sessionId: third, sequenceIndex: 1, characterOffset: 4 }] }),
      false,
    );
    assert.equal((await owner.client.query("select public.set_topic_map_enabled(true) as ok")).rows[0].ok, true);
    assert.deepEqual((await batch(owner)).messages, [], "re-enable fast-forwards past conversations held while off");
    assert.equal(await count("people_memory_sources", owner.userId), 3);
    await endedSession(owner, ["Po włączeniu.", "Mhm."]);
    assert.equal((await batch(owner)).messages.length, 2);
    await assert.rejects(owner.client.query("select public.set_topic_map_enabled(null)"), { code: "22023" });
  });

  it("deletes all people cards while keeping general difficulties and the aggregate, and deletes the map while keeping people", async () => {
    const owner = await premiumOwner();
    const session = await endedSession(owner, ["Marta.", "Mhm."]);
    assert.equal(
      await save(owner, await batch(owner), {
        newPersons: [newPerson("Marta", "przełożona", session)],
        newDifficulties: [
          newDifficulty("Ogólna", session, {
            addPersons: [{ personId: null, newPersonPosition: 0, uncertain: false }],
            addEntries: [
              entry(session, "how", "Ogólnie."),
              entry(session, "how", "Przy Marcie.", { newPersonPosition: 0 }),
            ],
          }),
        ],
      }),
      true,
    );
    assert.equal((await owner.client.query("select public.disable_and_delete_people_memory() as ok")).rows[0].ok, true);
    assert.equal(await count("people_persons", owner.userId), 0);
    assert.equal(
      await count("people_memories", owner.userId),
      1,
      "aggregate stays for the perspective with difficulties",
    );
    assert.equal(await count("people_memory_sources", owner.userId), 1);
    const list = await cards(owner);
    assert.equal(list.length, 1);
    assert.deepEqual(list[0].persons, []);
    assert.equal(list[0].entries.length, 1);

    await owner.client.query("select public.set_people_memory_enabled(true)");
    const more = await endedSession(owner, ["Anna.", "Mhm."]);
    assert.equal(await save(owner, await batch(owner), { newPersons: [newPerson("Anna", "koleżanka", more)] }), true);
    assert.equal((await owner.client.query("select public.disable_and_delete_topic_map() as ok")).rows[0].ok, true);
    for (const table of TOPIC_TABLES) assert.equal(await count(table, owner.userId), 0, table);
    assert.equal((await personCards(owner)).length, 1);
    assert.equal((await batch(owner)).topicsEnabled, false);
  });

  it("keeps the user's corrections ahead of a later batch and fences an in-flight one", async () => {
    const owner = await premiumOwner();
    const first = await endedSession(owner, ["Trudność.", "Mhm."]);
    assert.equal(
      await save(owner, await batch(owner), {
        newDifficulties: [newDifficulty("Trudność", first, { addEntries: [entry(first, "how", "Model.")] })],
      }),
      true,
    );
    let [difficulty] = await cards(owner);
    const second = await endedSession(owner, ["Druga.", "Mhm."]);
    const inflight = await batch(owner);
    const edited = (
      await owner.client.query("select public.update_difficulty_entry($1, $2) as card", [
        difficulty.entries[0].id,
        "Poprawione przez użytkownika",
      ])
    ).rows[0].card;
    assert.equal(edited.entries[0].userEdited, true);
    // Edycja bumpnęła rewizję: partia w toku przegrywa CAS.
    assert.equal(
      await save(owner, inflight, {
        difficultyUpdates: [
          {
            difficultyId: difficulty.id,
            ...change({
              replaceEntries: [
                {
                  entryId: difficulty.entries[0].id,
                  kind: "how",
                  text: "Nadpisane",
                  effect: null,
                  sourceSessionId: second,
                },
              ],
              removeEntryIds: [difficulty.entries[0].id],
            }),
          },
        ],
      }),
      false,
    );
    assert.equal(
      await save(owner, await batch(owner), {
        difficultyUpdates: [
          {
            difficultyId: difficulty.id,
            ...change({
              replaceEntries: [
                {
                  entryId: difficulty.entries[0].id,
                  kind: "how",
                  text: "Nadpisane",
                  effect: null,
                  sourceSessionId: second,
                },
              ],
              removeEntryIds: [difficulty.entries[0].id],
            }),
          },
        ],
      }),
      true,
    );
    [difficulty] = await cards(owner);
    assert.equal(difficulty.entries[0].text, "Poprawione przez użytkownika");
    const deleted = (
      await owner.client.query("select public.delete_difficulty_entry($1) as result", [difficulty.entries[0].id])
    ).rows[0].result;
    assert.equal(deleted.difficultyId, difficulty.id);
    assert.equal(deleted.card, null, "last entry gone → difficulty pruned");
    assert.deepEqual(await cards(owner), []);
    assert.equal(
      (await owner.client.query("select public.delete_difficulty_entry($1) as result", [difficulty.entries[0].id]))
        .rows[0].result,
      null,
    );
    // Trudność z notatką nie znika po usunięciu ostatniego wpisu; delete_difficulty ją usuwa.
    const third = await endedSession(owner, ["Trzecia.", "Mhm."]);
    assert.equal(await save(owner, await batch(owner), { newDifficulties: [newDifficulty("Z notatką", third)] }), true);
    const [noted] = await cards(owner);
    await owner.client.query("select public.update_difficulty_card($1, $2, $3, false)", [
      noted.id,
      "Z notatką",
      "Notatka",
    ]);
    const kept = (
      await owner.client.query("select public.delete_difficulty_entry($1) as result", [noted.entries[0].id])
    ).rows[0].result;
    assert.equal(kept.card.entries.length, 0);
    assert.equal((await owner.client.query("select public.delete_difficulty($1) as ok", [noted.id])).rows[0].ok, true);
    assert.equal((await owner.client.query("select public.delete_difficulty($1) as ok", [noted.id])).rows[0].ok, false);
  });

  it("rejects an entry, alias or mention source outside the batch with 22023", async () => {
    const owner = await premiumOwner();
    const first = await endedSession(owner, ["Pierwsza.", "Mhm."]);
    assert.equal(await save(owner, await batch(owner), {}), true);
    await endedSession(owner, ["Druga.", "Mhm."]);
    const work = await batch(owner);
    for (const changes of [
      { newDifficulties: [newDifficulty("X", first)] },
      {
        newDifficulties: [
          newDifficulty("X", work.messages[0].sessionId, { addAliases: [{ text: "a", sourceSessionId: first }] }),
        ],
      },
      { newDifficulties: [newDifficulty("X", work.messages[0].sessionId, { mentionedSessionIds: [first] })] },
      { difficultyUpdates: "nope" },
    ]) {
      await assert.rejects(save(owner, work, changes), { code: "22023" });
    }
    assert.equal((await batch(owner)).messages.length, 2);
  });

  it("isolates every topic table and function from other owners, admins and anon", async () => {
    const owner = await premiumOwner();
    const other = await premiumOwner();
    await db.admin.query("insert into public.admin_users(user_id) values ($1)", [other.userId]);
    const session = await endedSession(owner, ["Marta.", "Mhm."]);
    assert.equal(
      await save(owner, await batch(owner), {
        newPersons: [newPerson("Marta", "przełożona", session)],
        newDifficulties: [
          newDifficulty("Trudność", session, {
            addAliases: [{ text: "alias", sourceSessionId: session }],
            addPersons: [{ personId: null, newPersonPosition: 0, uncertain: false }],
            addEntries: [entry(session, "how", "Przy Marcie.", { newPersonPosition: 0 })],
          }),
        ],
      }),
      true,
    );
    for (const table of TOPIC_TABLES) assert.ok((await count(table, owner.userId)) > 0, `${table} must be seeded`);
    const [difficulty] = await cards(owner);
    for (const table of TOPIC_TABLES) {
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
    assert.deepEqual(await cards(other), []);
    assert.equal(await card(other, difficulty.id), null);
    assert.equal(
      (await other.client.query("select public.update_difficulty_card($1, 'x', '', false) as card", [difficulty.id]))
        .rows[0].card,
      null,
    );
    assert.equal(
      (await other.client.query("select public.delete_difficulty($1) as ok", [difficulty.id])).rows[0].ok,
      false,
    );
    assert.equal(
      (await other.client.query("select public.update_difficulty_entry($1, 'x') as card", [difficulty.entries[0].id]))
        .rows[0].card,
      null,
    );
    for (const signature of TOPIC_FUNCTIONS) {
      const { rows } = await db.admin.query(
        `select has_function_privilege('anon', $1, 'EXECUTE') as anon_can,
                has_function_privilege('authenticated', $1, 'EXECUTE') as owner_can,
                (select prosecdef from pg_proc where oid = $1::regprocedure) as definer`,
        [signature],
      );
      assert.deepEqual(rows[0], { anon_can: false, owner_can: true, definer: false }, signature);
    }
    assert.equal((await card(owner, difficulty.id)).label, "Trudność");
  });

  it("cascades with the account and survives the auth admin deleting the user", async () => {
    const owner = await premiumOwner();
    const session = await endedSession(owner, ["Marta.", "Mhm."]);
    assert.equal(
      await save(owner, await batch(owner), {
        newPersons: [newPerson("Marta", "przełożona", session)],
        newDifficulties: [
          newDifficulty("Trudność", session, {
            addAliases: [{ text: "alias", sourceSessionId: session }],
            addPersons: [{ personId: null, newPersonPosition: 0, uncertain: false }],
            addEntries: [entry(session, "how", "Przy Marcie.", { newPersonPosition: 0 })],
          }),
        ],
      }),
      true,
    );
    for (const table of TOPIC_TABLES) assert.ok((await count(table, owner.userId)) > 0, `${table} must be seeded`);
    assert.equal((await owner.client.query("select public.delete_own_account('USUWAM') as ok")).rows[0].ok, true);
    for (const table of TOPIC_TABLES) assert.equal(await count(table, owner.userId), 0, table);

    const second = await premiumOwner();
    const later = await endedSession(second, ["Trudność.", "Mhm."]);
    assert.equal(
      await save(second, await batch(second), { newDifficulties: [newDifficulty("Trudność", later)] }),
      true,
    );
    await db.admin.query(
      "do $$ begin if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if; end $$",
    );
    await db.admin.query(
      "grant usage on schema auth to supabase_auth_admin; grant select, delete on auth.users to supabase_auth_admin",
    );
    await db.admin.query("set role supabase_auth_admin");
    try {
      await db.admin.query("delete from auth.users where id = $1", [second.userId]);
    } finally {
      await db.admin.query("reset role");
    }
    for (const table of TOPIC_TABLES) assert.equal(await count(table, second.userId), 0, table);
  });
});
