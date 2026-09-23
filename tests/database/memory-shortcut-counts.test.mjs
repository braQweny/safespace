import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "./database-fixture.mjs";

const AVATAR = "cbt-guide";
const OTHER_AVATAR = "psychodynamic-listener";

// The dashboard used to count the full lists; the new reads must return the
// same three numbers. These mirror the old page code exactly: the list length
// and `listPendingLinks` (a `suggested` link without a user decision).
const listLength = async (owner, fn, avatar) =>
  (await owner.client.query(`select jsonb_array_length(public.${fn}($1)) as length`, [avatar])).rows[0].length;
const pendingFromList = async (owner, avatar) =>
  (await owner.client.query("select public.list_difficulty_cards($1) as cards", [avatar])).rows[0].cards.flatMap(
    (card) => card.persons.filter((person) => person.state === "suggested" && !person.userDecided),
  ).length;
// The people count is a PostgREST head count under owner RLS; this is its SQL.
const headCountPeople = async (owner, avatar) =>
  Number(
    (
      await owner.client.query(
        "select count(*) as count from public.people_persons where user_id = $1 and avatar_id = $2",
        [owner.userId, avatar],
      )
    ).rows[0].count,
  );
const countDifficulties = async (owner, avatar) =>
  (await owner.client.query("select public.count_difficulty_cards($1) as counts", [avatar])).rows[0].counts;

describe("Memory shortcut counts against all migrations in real PostgreSQL", () => {
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

  // A user note keeps a card out of the empty-card pruning that forgetting
  // a person runs, as a card with facts or entries would be.
  async function person(owner, avatar, name) {
    await owner.client.query(
      "insert into public.people_memories(user_id, avatar_id) values ($1, $2) on conflict do nothing",
      [owner.userId, avatar],
    );
    const { rows } = await owner.client.query(
      "insert into public.people_persons(user_id, avatar_id, display_name, user_note) values ($1, $2, $3, 'note') returning id",
      [owner.userId, avatar, name],
    );
    return rows[0].id;
  }

  async function difficulty(owner, avatar, label) {
    const { rows } = await owner.client.query(
      "insert into public.difficulties(user_id, avatar_id, label, user_note) values ($1, $2, $3, 'note') returning id",
      [owner.userId, avatar, label],
    );
    return rows[0].id;
  }

  async function link(owner, difficultyId, personId, state) {
    await owner.client.query(
      "insert into public.difficulty_persons(difficulty_id, person_id, user_id, state) values ($1, $2, $3, $4)",
      [difficultyId, personId, owner.userId, state],
    );
  }

  it("returns the same numbers as the full lists, with every filter the lists apply", async () => {
    const owner = await db.owner();
    const stranger = await db.owner();

    const marta = await person(owner, AVATAR, "Marta");
    const tomek = await person(owner, AVATAR, "Tomek");
    const ola = await person(owner, AVATAR, "Ola");
    const forgotten = await person(owner, AVATAR, "Kasia");
    const elsewhere = await person(owner, OTHER_AVATAR, "Jan");
    const strangersPerson = await person(stranger, AVATAR, "Ewa");

    const sleep = await difficulty(owner, AVATAR, "Sen");
    const work = await difficulty(owner, AVATAR, "Praca");
    const family = await difficulty(owner, AVATAR, "Rodzina");
    const otherTopic = await difficulty(owner, OTHER_AVATAR, "Inne");
    const strangersTopic = await difficulty(stranger, AVATAR, "Obce");

    // Forgetting deletes the person and its links (and prunes undecided,
    // entry-less links), so it runs before the links the test counts.
    await link(owner, sleep, forgotten, "suggested");
    assert.equal((await owner.client.query("select public.forget_person($1) as ok", [forgotten])).rows[0].ok, true);

    await link(owner, sleep, marta, "suggested"); // pending
    await link(owner, sleep, tomek, "confirmed");
    await link(owner, work, marta, "suggested");
    await owner.client.query("select public.decide_difficulty_person($1, $2, 'rejected')", [work, marta]);
    await link(owner, work, tomek, "suggested");
    await owner.client.query("select public.decide_difficulty_person($1, $2, 'confirmed')", [work, tomek]);
    // A "less current" topic is still listed, so its uncertain link still counts.
    await link(owner, family, ola, "suggested"); // pending
    await owner.client.query("select public.update_difficulty_card($1, 'Rodzina', '', true)", [family]);
    await link(owner, sleep, ola, "suggested");
    await owner.client.query(
      "update public.difficulty_persons set user_decided = true where difficulty_id = $1 and person_id = $2",
      [sleep, ola],
    );
    await link(owner, otherTopic, elsewhere, "suggested");
    await link(stranger, strangersTopic, strangersPerson, "suggested");
    // A link to a person the owner cannot see is hidden from the card by RLS,
    // so it must not be counted either.
    await link(owner, sleep, strangersPerson, "suggested");

    for (const avatar of [AVATAR, OTHER_AVATAR]) {
      assert.equal(await headCountPeople(owner, avatar), await listLength(owner, "list_person_cards", avatar), avatar);
      assert.deepEqual(
        await countDifficulties(owner, avatar),
        {
          cards: await listLength(owner, "list_difficulty_cards", avatar),
          pendingLinks: await pendingFromList(owner, avatar),
        },
        avatar,
      );
    }

    assert.equal(await headCountPeople(owner, AVATAR), 3);
    assert.deepEqual(await countDifficulties(owner, AVATAR), { cards: 3, pendingLinks: 2 });
    assert.deepEqual(await countDifficulties(owner, OTHER_AVATAR), { cards: 1, pendingLinks: 1 });
    assert.deepEqual(await countDifficulties(stranger, AVATAR), { cards: 1, pendingLinks: 1 });
  });

  it("counts nothing for a perspective without cards", async () => {
    const owner = await db.owner();

    assert.equal(await headCountPeople(owner, AVATAR), 0);
    assert.deepEqual(await countDifficulties(owner, AVATAR), { cards: 0, pendingLinks: 0 });
  });

  it("is an owner-bound security invoker function callable only by signed-in users", async () => {
    const { rows } = await db.admin.query(
      `select p.prosecdef, p.provolatile, p.proconfig,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
         has_function_privilege('public', p.oid, 'EXECUTE') as public_execute,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
       from pg_proc p where p.oid = 'public.count_difficulty_cards(text)'::regprocedure`,
    );
    assert.equal(rows[0].prosecdef, false);
    assert.equal(rows[0].provolatile, "s");
    assert.deepEqual(rows[0].proconfig, ['search_path=""']);
    assert.equal(rows[0].anon_execute, false);
    assert.equal(rows[0].public_execute, false);
    assert.equal(rows[0].authenticated_execute, true);
  });
});
