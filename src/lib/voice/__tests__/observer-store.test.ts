import { describe, expect, it, vi } from "vitest";
import { createInitialObserverState } from "../observer-state";
import {
  createMemoryVoiceObserverStore,
  createSqlVoiceObserverStore,
  initializeVoiceObserverSchema,
} from "../observer-store";

describe("memory voice observer store", () => {
  it("keeps insertion order, hides drained rows and trims the drained tail", () => {
    const store = createMemoryVoiceObserverStore();

    for (let index = 1; index <= 12; index += 1) {
      store.insertUtterance({
        utteranceId: `u${index}`,
        role: index % 2 ? "user" : "assistant",
        content: `t${index}`,
        createdAtMs: index,
      });
    }

    expect(store.pendingCount()).toBe(12);
    expect(store.listPending(3).map((row) => row.ordinal)).toEqual([1, 2, 3]);
    store.markDrained([1, 2, 3]);
    expect(store.listPending(50).map((row) => row.ordinal)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // The tail (last 8 ordinals) survives as classifier context; older drained rows are gone.
    expect(store.rows.map((row) => row.ordinal)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(store.listRecentUserTexts(2)).toEqual(["t9", "t11"]);
    expect(() => store.insertUtterance({ utteranceId: "u4", role: "user", content: "dup", createdAtMs: 0 })).toThrow();

    store.saveState({ ...createInitialObserverState(), epoch: 3 });
    expect(store.loadState()?.epoch).toBe(3);
    store.deleteAll();
    expect(store.loadState()).toBeNull();
    expect(store.pendingCount()).toBe(0);
  });
});

describe("sql voice observer store", () => {
  function createSql() {
    const calls: { query: string; bindings: unknown[] }[] = [];
    let rows: Record<string, unknown>[] = [];
    const sql = {
      exec: vi.fn((query: string, ...bindings: unknown[]) => {
        calls.push({ query, bindings });
        const result = rows;
        return { toArray: () => result };
      }),
      setRows(next: Record<string, unknown>[]) {
        rows = next;
      },
    };
    return { sql, calls };
  }

  it("creates the two tables once and round-trips the state as JSON", () => {
    const { sql, calls } = createSql();
    initializeVoiceObserverSchema(sql);
    expect(calls.map((call) => call.query)).toEqual([
      expect.stringContaining("create table if not exists observer_state"),
      expect.stringContaining("create table if not exists utterances"),
    ]);

    const store = createSqlVoiceObserverStore(sql);
    const state = { ...createInitialObserverState(), epoch: 2, closeReason: "completed" as const };
    store.saveState(state);
    expect(calls.at(-1)?.bindings).toEqual([JSON.stringify(state)]);
    sql.setRows([{ value: JSON.stringify(state) }]);
    expect(store.loadState()).toEqual(state);
    sql.setRows([{ value: "{not json" }]);
    expect(store.loadState()).toBeNull();
    sql.setRows([{ value: JSON.stringify({ epoch: 1, closeReason: "bogus" }) }]);
    expect(store.loadState()).toBeNull();
  });

  it("binds utterance rows as parameters and reads them back in ordinal order", () => {
    const { sql, calls } = createSql();
    const store = createSqlVoiceObserverStore(sql);
    sql.setRows([{ ordinal: 7, utterance_id: "u7", role: "user", content: "hej", created_at: 5 }]);

    expect(store.insertUtterance({ utteranceId: "u7", role: "user", content: "hej", createdAtMs: 5 })).toEqual({
      ordinal: 7,
      utteranceId: "u7",
      role: "user",
      content: "hej",
      createdAtMs: 5,
    });
    expect(calls.at(-1)).toMatchObject({ bindings: ["u7", "user", "hej", 5] });
    expect(calls.at(-1)?.query).not.toContain("hej");

    expect(store.listPending(10)).toHaveLength(1);
    expect(calls.at(-1)?.query).toContain("where drained = 0 order by ordinal asc limit ?");

    sql.setRows([{ max_ordinal: 20 }]);
    store.markDrained([7, 8]);
    expect(calls.slice(-3).map((call) => call.query)).toEqual([
      expect.stringContaining("update utterances set drained = 1 where ordinal = ?"),
      expect.stringContaining("select max(ordinal)"),
      expect.stringContaining("delete from utterances where drained = 1 and ordinal <= ?"),
    ]);
    expect(calls.at(-1)?.bindings).toEqual([12]);

    sql.setRows([{ content: "drugi" }, { content: "pierwszy" }]);
    expect(store.listRecentUserTexts(2)).toEqual(["pierwszy", "drugi"]);
    sql.setRows([{ n: 4 }]);
    expect(store.pendingCount()).toBe(4);
    store.deleteAll();
    expect(calls.slice(-2).map((call) => call.query)).toEqual(["delete from utterances", "delete from observer_state"]);
  });
});
