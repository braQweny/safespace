import { describe, expect, it, vi } from "vitest";
import { FREE_PLAN_SESSION_LIMIT_SQLSTATE, mapSupabaseWriteError } from "../errors";
import { countOwnedSessions, getOwnedAccountPlan, toOwnedAccountPlan } from "../repository";
import type { SessionDataContext } from "../types";

function createContext(tableResult: { data?: unknown; count?: number | null; error: unknown }) {
  const calls: [string, ...unknown[]][] = [];
  const terminal = Promise.resolve({
    data: tableResult.data ?? null,
    count: tableResult.count ?? null,
    error: tableResult.error,
  });
  const query = {
    select: vi.fn((...args: unknown[]) => {
      calls.push(["select", ...args]);
      return query;
    }),
    eq: vi.fn((...args: unknown[]) => {
      calls.push(["eq", ...args]);
      return Object.assign(terminal, { maybeSingle: () => terminal });
    }),
  };

  return {
    calls,
    context: {
      user: {
        id: "user-1",
      },
      supabase: {
        from: vi.fn((table: string) => {
          calls.push(["from", table]);
          return query;
        }),
      },
    } as unknown as SessionDataContext,
  };
}

describe("owned account plan", () => {
  it("maps the premium timestamp to the plan and defaults to free", () => {
    expect(toOwnedAccountPlan({ user_id: "user-1", premium_granted_at: "2026-08-01T10:00:00.000Z" })).toEqual({
      plan: "premium",
      premiumGrantedAt: "2026-08-01T10:00:00.000Z",
    });
    expect(toOwnedAccountPlan({ user_id: "user-1", premium_granted_at: null })).toEqual({
      plan: "free",
      premiumGrantedAt: null,
    });
    expect(toOwnedAccountPlan(null)).toEqual({ plan: "free", premiumGrantedAt: null });
    expect(toOwnedAccountPlan({ premium_granted_at: 42 })).toEqual({ plan: "free", premiumGrantedAt: null });
  });

  it("reads only the owner's plan columns from the safe profile row", async () => {
    const { calls, context } = createContext({
      data: { user_id: "user-1", premium_granted_at: "2026-08-01T10:00:00.000Z" },
      error: null,
    });

    await expect(getOwnedAccountPlan(context)).resolves.toEqual({
      ok: true,
      data: { plan: "premium", premiumGrantedAt: "2026-08-01T10:00:00.000Z" },
    });
    expect(calls).toEqual([
      ["from", "admin_user_profiles"],
      ["select", "user_id,premium_granted_at"],
      ["eq", "user_id", "user-1"],
    ]);
  });

  it("maps raw read failures to a stable code", async () => {
    const { context } = createContext({ error: { code: "42501", message: "raw permission details" } });
    const result = await getOwnedAccountPlan(context);

    expect(result).toEqual({ ok: false, error: { code: "read_failed" } });
    expect(JSON.stringify(result)).not.toContain("raw permission");
  });
});

describe("owned session count", () => {
  it("counts every owned session row with a head-only query", async () => {
    const { calls, context } = createContext({ count: 3, error: null });

    await expect(countOwnedSessions(context)).resolves.toEqual({ ok: true, data: 3 });
    expect(calls).toEqual([
      ["from", "therapy_sessions"],
      ["select", "id", { count: "exact", head: true }],
      ["eq", "user_id", "user-1"],
    ]);
  });

  it("treats a missing count as zero and maps failures", async () => {
    await expect(countOwnedSessions(createContext({ count: null, error: null }).context)).resolves.toEqual({
      ok: true,
      data: 0,
    });
    await expect(countOwnedSessions(createContext({ error: { code: "XX000" } }).context)).resolves.toEqual({
      ok: false,
      error: { code: "read_failed" },
    });
  });
});

describe("free-plan limit error mapping", () => {
  it("maps the trigger's SQLSTATE to the stable session_limit_reached code", () => {
    expect(mapSupabaseWriteError({ code: FREE_PLAN_SESSION_LIMIT_SQLSTATE })).toBe("session_limit_reached");
    expect(
      mapSupabaseWriteError({ code: FREE_PLAN_SESSION_LIMIT_SQLSTATE }, { conflictCode: "trial_already_claimed" }),
    ).toBe("session_limit_reached");
    expect(mapSupabaseWriteError({ code: "23505" }, { conflictCode: "trial_already_claimed" })).toBe(
      "trial_already_claimed",
    );
  });
});
