import { describe, expect, it, vi } from "vitest";
import { listOwnedVoiceObserverSessionIds, readOwnedVoiceUsage } from "../sessions";
import type { SessionDataContext } from "../types";

function createRpcContext(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(() => Promise.resolve(result));
  return { context: { supabase: { rpc }, user: { id: "user-1" } } as unknown as SessionDataContext, rpc };
}

describe("readOwnedVoiceUsage", () => {
  it("asks the database for the aggregate, excluding the conversation being connected", async () => {
    const { context, rpc } = createRpcContext({ data: { used_seconds: 4200, reserved_seconds: 900 }, error: null });

    await expect(readOwnedVoiceUsage(context, "2026-09-01T00:00:00.000Z", "session-1")).resolves.toEqual({
      ok: true,
      data: { usedSeconds: 4200, reservedSeconds: 900 },
    });
    expect(rpc).toHaveBeenCalledWith("get_owned_voice_usage", {
      p_since: "2026-09-01T00:00:00.000Z",
      p_exclude_session_id: "session-1",
    });

    await readOwnedVoiceUsage(context, "2026-09-01T00:00:00.000Z");
    expect(rpc).toHaveBeenLastCalledWith("get_owned_voice_usage", {
      p_since: "2026-09-01T00:00:00.000Z",
      p_exclude_session_id: null,
    });
  });

  it("fails closed on an error or an unreadable payload instead of reading zero", async () => {
    for (const result of [
      { data: null, error: { code: "42501", message: "private details" } },
      { data: null, error: null },
      { data: { used_seconds: "4200", reserved_seconds: 0 }, error: null },
    ]) {
      const { context } = createRpcContext(result);
      await expect(readOwnedVoiceUsage(context, "2026-09-01T00:00:00.000Z")).resolves.toEqual({
        ok: false,
        error: { code: "read_failed" },
      });
    }
  });

  it("never reports negative or fractional seconds", async () => {
    const { context } = createRpcContext({ data: { used_seconds: -3, reserved_seconds: 12.7 }, error: null });

    await expect(readOwnedVoiceUsage(context, "2026-09-01T00:00:00.000Z")).resolves.toEqual({
      ok: true,
      data: { usedSeconds: 0, reservedSeconds: 12 },
    });
  });
});

describe("listOwnedVoiceObserverSessionIds", () => {
  function createQueryContext(result: { data: unknown; error: unknown }) {
    const calls: [string, ...unknown[]][] = [];
    const query = {
      select: (...args: unknown[]) => (calls.push(["select", ...args]), query),
      eq: (...args: unknown[]) => (calls.push(["eq", ...args]), query),
      not: (...args: unknown[]) => (calls.push(["not", ...args]), query),
      or: (...args: unknown[]) => (calls.push(["or", ...args]), query),
      order: (...args: unknown[]) => (calls.push(["order", ...args]), query),
      limit: (...args: unknown[]) => (calls.push(["limit", ...args]), Promise.resolve(result)),
    };
    const from = vi.fn(() => query);
    return { context: { supabase: { from }, user: { id: "user-1" } } as unknown as SessionDataContext, calls, from };
  }

  it("reads only ids of the owner's connected voice conversations that are active or recent", async () => {
    const { context, calls, from } = createQueryContext({
      data: [{ id: "s2" }, { id: "s1" }, { nope: 1 }],
      error: null,
    });

    await expect(listOwnedVoiceObserverSessionIds(context, "2026-09-14T12:00:00.000Z", 100)).resolves.toEqual({
      ok: true,
      data: ["s2", "s1"],
    });
    expect(from).toHaveBeenCalledWith("therapy_sessions");
    expect(calls).toEqual([
      ["select", "id"],
      ["eq", "user_id", "user-1"],
      ["eq", "mode", "voice"],
      ["not", "voice_connected_at", "is", null],
      ["or", "status.eq.active,created_at.gte.2026-09-14T12:00:00.000Z"],
      ["order", "created_at", { ascending: false }],
      ["limit", 100],
    ]);
  });

  it("maps a read error to a stable code", async () => {
    const { context } = createQueryContext({ data: null, error: { code: "42501", message: "private" } });

    await expect(listOwnedVoiceObserverSessionIds(context, "2026-09-14T12:00:00.000Z", 100)).resolves.toEqual({
      ok: false,
      error: { code: "read_failed" },
    });
  });
});
