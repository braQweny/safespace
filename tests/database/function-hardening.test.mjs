import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startDatabase } from "./database-fixture.mjs";

describe("Function hardening against all migrations in real PostgreSQL", () => {
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

  // A definer runs with its owner's rights, so every name it uses must be
  // schema-qualified: an empty path means nothing resolves through a schema
  // that someone else could add objects to (`pg_catalog` is always searched).
  it("pins an empty search_path on every SECURITY DEFINER function in public and private", async () => {
    const { rows } = await db.admin.query(
      `select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as signature,
         p.proconfig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prosecdef
         and (p.proconfig is null or not ('search_path=""' = any(p.proconfig)))
       order by 1`,
    );

    assert.deepEqual(rows, []);
  });

  it("still finds definer functions to check", async () => {
    const { rows } = await db.admin.query(
      `select count(*)::int as definers from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prosecdef`,
    );

    assert.ok(rows[0].definers > 0);
  });
});
