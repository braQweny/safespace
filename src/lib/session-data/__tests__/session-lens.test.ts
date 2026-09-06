import { describe, expect, it, vi } from "vitest";
import { setOwnedSessionLens } from "../sessions";
import type { SessionDataContext } from "../types";

function createUpdateChain(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[][]> = {};
  const chain: Record<string, unknown> = {};
  for (const method of ["update", "eq", "is", "select"]) {
    chain[method] = vi.fn((...args: unknown[]) => {
      (calls[method] ??= []).push(args);
      return chain;
    });
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  return { chain, calls };
}

function createContext(result: { data: unknown; error: unknown }) {
  const { chain, calls } = createUpdateChain(result);
  const from = vi.fn(() => chain);
  return { context: { supabase: { from }, user: { id: "user-1" } } as unknown as SessionDataContext, from, calls };
}

describe("setOwnedSessionLens", () => {
  it("pins the lens only on the owner's active session while the column is still empty", async () => {
    const { context, from, calls } = createContext({ data: { id: "session-1" }, error: null });

    await expect(setOwnedSessionLens(context, "session-1", "work_burnout")).resolves.toEqual({
      ok: true,
      data: true,
    });
    expect(from).toHaveBeenCalledWith("therapy_sessions");
    expect(calls.update).toEqual([[{ session_lens: "work_burnout" }]]);
    expect(calls.eq).toEqual([
      ["id", "session-1"],
      ["user_id", "user-1"],
      ["status", "active"],
    ]);
    expect(calls.is).toEqual([["session_lens", null]]);
    // Only the id comes back: the row's content is not needed to know it matched.
    expect(calls.select).toEqual([["id"]]);
  });

  it("reports false, not an error, when the session already has a lens or has ended", async () => {
    const { context } = createContext({ data: null, error: null });

    await expect(setOwnedSessionLens(context, "session-1", "anxiety_avoidance")).resolves.toEqual({
      ok: true,
      data: false,
    });
  });

  it("maps a database failure to a stable code without leaking the raw message", async () => {
    const { context } = createContext({ data: null, error: { code: "42501", message: "permission denied" } });
    const result = await setOwnedSessionLens(context, "session-1", "family_of_origin");

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("permission denied");
  });
});
