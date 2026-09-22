import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ADMIN_SELF_TARGET_SQLSTATE } from "@/lib/admin/errors";

const MIGRATION_PATH = fileURLToPath(
  new URL("../../../../supabase/migrations/20260922120100_forbid_admin_self_target.sql", import.meta.url),
);

describe("admin self-target migration", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("refuses the acting admin as the target in both definer RPCs with the SQLSTATE the app maps", () => {
    expect(sql).toContain("create or replace function public.set_private_admin_user_block_state");
    expect(sql).toContain("create or replace function public.set_private_admin_user_plan_state");

    const guards = [
      ...sql.matchAll(
        /if input_target_user_id = \(select auth\.uid\(\)\) then\s+raise exception using errcode = '([A-Z0-9]{5})', message = 'admin_self_target_forbidden';/g,
      ),
    ];
    expect(guards.map((guard) => guard[1])).toEqual([ADMIN_SELF_TARGET_SQLSTATE, ADMIN_SELF_TARGET_SQLSTATE]);

    // The guard runs right after the admin check, before any validation or write.
    for (const name of ["set_private_admin_user_block_state", "set_private_admin_user_plan_state"]) {
      const body = sql.slice(sql.indexOf(`function public.${name}`));
      expect(body.indexOf("active_admin_required")).toBeLessThan(body.indexOf("admin_self_target_forbidden"));
      expect(body.indexOf("admin_self_target_forbidden")).toBeLessThan(
        body.indexOf("update public.admin_user_profiles"),
      );
    }
  });

  it("keeps both functions definer, pinned to an empty search path and closed to anon", () => {
    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/set search_path = ''/g)).toHaveLength(2);
    expect(sql.match(/if auth\.uid\(\) is null or not public\.is_private_admin\(\)/g)).toHaveLength(2);
    expect(sql.match(/insert into public\.admin_audit_events/g)).toHaveLength(2);
    expect(sql).toContain(
      "revoke all on function public.set_private_admin_user_block_state(uuid, text, text) from public, anon",
    );
    expect(sql).toContain(
      "revoke all on function public.set_private_admin_user_plan_state(uuid, text, text) from public, anon",
    );
  });
});
