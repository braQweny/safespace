import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = fileURLToPath(
  new URL("../../../../supabase/migrations/20260826165029_add_atomic_admin_user_mutations.sql", import.meta.url),
);

describe("atomic admin mutation migration", () => {
  it("keeps profile changes and audit inserts in locked-down transactional functions", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toContain("create function public.set_private_admin_user_block_state");
    expect(sql).toContain("create function public.set_private_admin_user_plan_state");
    expect(sql.match(/security definer/g)).toHaveLength(2);
    expect(sql.match(/if auth\.uid\(\) is null or not public\.is_private_admin\(\)/g)).toHaveLength(2);
    expect(sql).toContain("revoke update on table public.admin_user_profiles from authenticated");
    expect(sql).toContain("revoke insert on table public.admin_audit_events from authenticated");
    expect(sql.match(/insert into public\.admin_audit_events/g)).toHaveLength(2);
    expect(sql).toContain(
      "revoke all on function public.set_private_admin_user_block_state(uuid, text, text) from public",
    );
    expect(sql).toContain(
      "revoke all on function public.set_private_admin_user_plan_state(uuid, text, text) from public",
    );
    expect(sql.match(/set search_path = ''/g)).toHaveLength(2);
  });
});
