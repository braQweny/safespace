import { describe, expect, it, vi } from "vitest";
import { countOwnedDifficultyCards, countOwnedPersonCards } from "../repository";
import type { SessionDataContext } from "../types";

// Equivalence with the full lists (`list_person_cards`, `list_difficulty_cards`
// + `listPendingLinks`) is pinned on real PostgreSQL in
// `tests/database/memory-shortcut-counts.test.mjs`; these pin the query shape
// and the degradation contract.

function headCountContext(result: { count: number | null; error: unknown }) {
  const calls: [string, ...unknown[]][] = [];
  const query = {
    select: vi.fn((...args: unknown[]) => {
      calls.push(["select", ...args]);
      return query;
    }),
    eq: vi.fn((...args: unknown[]) => {
      calls.push(["eq", ...args]);
      return Object.assign(Promise.resolve({ data: null, ...result }), { eq: query.eq });
    }),
  };

  return {
    calls,
    context: {
      user: { id: "user-1" },
      supabase: {
        from: vi.fn((table: string) => {
          calls.push(["from", table]);
          return query;
        }),
      },
    } as unknown as SessionDataContext,
  };
}

function rpcContext(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { rpc, context: { user: { id: "user-1" }, supabase: { rpc } } as unknown as SessionDataContext };
}

describe("countOwnedPersonCards", () => {
  it("counts the perspective's cards with a head-only query and no content columns", async () => {
    const { calls, context } = headCountContext({ count: 4, error: null });

    await expect(countOwnedPersonCards(context, "cbt-guide")).resolves.toEqual({ ok: true, data: 4 });
    expect(calls).toEqual([
      ["from", "people_persons"],
      ["select", "id", { count: "exact", head: true }],
      ["eq", "user_id", "user-1"],
      ["eq", "avatar_id", "cbt-guide"],
    ]);
  });

  it.each([
    ["a failed read", { count: null, error: { code: "XX000" } }],
    // `null` here means "unknown", never "no cards": the page shows 0 either way.
    ["a missing count", { count: null, error: null }],
  ])("maps %s to read_failed", async (_label, result) => {
    await expect(countOwnedPersonCards(headCountContext(result).context, "cbt-guide")).resolves.toEqual({
      ok: false,
      error: { code: "read_failed" },
    });
  });
});

describe("countOwnedDifficultyCards", () => {
  it("reads both numbers with one owner-bound RPC", async () => {
    const { rpc, context } = rpcContext({ data: { cards: 5, pendingLinks: 2 }, error: null });

    await expect(countOwnedDifficultyCards(context, "cbt-guide")).resolves.toEqual({
      ok: true,
      data: { cards: 5, pendingLinks: 2 },
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("count_difficulty_cards", { p_avatar_id: "cbt-guide" });
  });

  it("keeps only the two counters", async () => {
    const { context } = rpcContext({ data: { cards: 1, pendingLinks: 0, label: "x" }, error: null });

    await expect(countOwnedDifficultyCards(context, "cbt-guide")).resolves.toEqual({
      ok: true,
      data: { cards: 1, pendingLinks: 0 },
    });
  });

  it.each([
    ["a failed read", { data: null, error: { code: "42883" } }],
    ["no data", { data: null, error: null }],
    ["an array", { data: [5, 2], error: null }],
    ["a missing counter", { data: { cards: 5 }, error: null }],
    ["a negative counter", { data: { cards: -1, pendingLinks: 0 }, error: null }],
    ["a fractional counter", { data: { cards: 1.5, pendingLinks: 0 }, error: null }],
    ["a string counter", { data: { cards: "5", pendingLinks: 0 }, error: null }],
  ])("maps %s to read_failed", async (_label, result) => {
    await expect(countOwnedDifficultyCards(rpcContext(result).context, "cbt-guide")).resolves.toEqual({
      ok: false,
      error: { code: "read_failed" },
    });
  });
});
