import { describe, expect, it, vi } from "vitest";

vi.mock("astro:env/server", () => ({}));
vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public readonly ctx: unknown,
      public readonly env: unknown,
    ) {}
  },
}));

import { VoiceSessionObserver } from "../observer-durable-object";

/**
 * Lokalny runtime (wrapper Durable Object w miniflare) odracza callback
 * `blockConcurrencyWhile`, a produkcyjny może zrobić to samo: schemat musi
 * istnieć zanim rdzeń przeczyta `observer_state` w swoim konstruktorze,
 * inaczej pierwsze uzbrojenie obiektu kończy się „no such table”.
 */
function createDeferredContext() {
  const tables = new Set<string>();
  const queries: string[] = [];
  const sql = {
    exec: vi.fn((query: string) => {
      queries.push(query.trim().split(/\s+/).slice(0, 6).join(" "));
      const created = /create table if not exists (\w+)/.exec(query);

      if (created) {
        tables.add(created[1]);
        return { toArray: () => [] };
      }

      const read = /from (\w+)/.exec(query);

      if (read && !tables.has(read[1])) {
        throw new Error(`no such table: ${read[1]}: SQLITE_ERROR`);
      }

      return { toArray: () => [] };
    }),
  };
  const ctx = {
    storage: {
      sql,
      setAlarm: vi.fn(() => Promise.resolve()),
      deleteAlarm: vi.fn(() => Promise.resolve()),
      getAlarm: vi.fn(() => Promise.resolve(null)),
    },
    blockConcurrencyWhile: vi.fn(async (callback: () => Promise<unknown>) => {
      await Promise.resolve();
      return callback();
    }),
    waitUntil: vi.fn(),
  };
  return { ctx, queries };
}

describe("VoiceSessionObserver constructor", () => {
  it("creates the schema synchronously before the core reads the observer state", async () => {
    const { ctx, queries } = createDeferredContext();

    const observer = new VoiceSessionObserver(ctx as never, { OPENAI_API_KEY: "sk-test", OPENROUTER_SAFETY_MODEL: "" });

    const firstRead = queries.findIndex((query) => query.startsWith("select"));
    const lastCreate = queries.reduce((last, query, index) => (query.startsWith("create table") ? index : last), -1);
    expect(lastCreate).toBeGreaterThanOrEqual(0);
    expect(firstRead).toBeGreaterThan(lastCreate);
    await expect(observer.getState()).resolves.toMatchObject({ epoch: 0, live: false, closeReason: null });
  });
});
