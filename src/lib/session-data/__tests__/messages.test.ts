import { describe, expect, it, vi } from "vitest";
import { getNextSessionMessageSequenceIndex, listRecentOwnedSessionMessages } from "../repository";
import type { SessionDataContext } from "../types";

function rawMessage(sequenceIndex: number, role: "user" | "assistant" = "user") {
  return {
    id: `message-${sequenceIndex}`,
    session_id: "session-1",
    user_id: "user-1",
    role,
    sequence_index: sequenceIndex,
    content: `tresc-${sequenceIndex}`,
    created_at: "2026-06-07T10:00:00.000Z",
  };
}

/**
 * Terminal call differs per helper: the bounded list resolves on `limit`, the
 * sequence-index read resolves on `maybeSingle`.
 */
function createMessageQuery(result: { data: unknown; error: unknown }, terminal: "limit" | "maybeSingle") {
  const calls: [string, ...unknown[]][] = [];
  const record = (name: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push([name, ...args]);
      return name === terminal ? Promise.resolve(result) : query;
    });
  const query = {
    select: record("select"),
    eq: record("eq"),
    order: record("order"),
    limit: record("limit"),
    maybeSingle: record("maybeSingle"),
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

describe("listRecentOwnedSessionMessages", () => {
  it("reads only the newest slice and returns it in conversation order", async () => {
    const { calls, context } = createMessageQuery(
      { data: [rawMessage(9, "assistant"), rawMessage(8)], error: null },
      "limit",
    );

    const result = await listRecentOwnedSessionMessages(context, "session-1", 2);

    expect(calls).toContainEqual(["order", "sequence_index", { ascending: false }]);
    expect(calls).toContainEqual(["limit", 2]);
    expect(calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(result.ok && result.data.map((message) => message.sequenceIndex)).toEqual([8, 9]);
  });

  it("does not query at all for a non-positive limit", async () => {
    const { calls, context } = createMessageQuery({ data: [], error: null }, "limit");

    const result = await listRecentOwnedSessionMessages(context, "session-1", 0);

    expect(calls).toEqual([]);
    expect(result).toEqual({ ok: true, data: [] });
  });

  it("maps read failures to a stable error code", async () => {
    const { context } = createMessageQuery({ data: null, error: { code: "42501" } }, "limit");

    const result = await listRecentOwnedSessionMessages(context, "session-1", 4);

    expect(result.ok).toBe(false);
  });
});

describe("getNextSessionMessageSequenceIndex", () => {
  it("returns the index after the highest stored one without reading content", async () => {
    const { calls, context } = createMessageQuery({ data: { sequence_index: 7 }, error: null }, "maybeSingle");

    const result = await getNextSessionMessageSequenceIndex(context, "session-1");

    expect(calls).toContainEqual(["select", "sequence_index"]);
    expect(calls).toContainEqual(["limit", 1]);
    expect(result).toEqual({ ok: true, data: 8 });
  });

  it("starts an empty conversation at zero", async () => {
    const { context } = createMessageQuery({ data: null, error: null }, "maybeSingle");

    const result = await getNextSessionMessageSequenceIndex(context, "session-1");

    expect(result).toEqual({ ok: true, data: 0 });
  });

  it("maps read failures to a stable error code", async () => {
    const { context } = createMessageQuery({ data: null, error: { code: "42501" } }, "maybeSingle");

    const result = await getNextSessionMessageSequenceIndex(context, "session-1");

    expect(result.ok).toBe(false);
  });
});
