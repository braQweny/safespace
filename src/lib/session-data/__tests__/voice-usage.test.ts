import { describe, expect, it, vi } from "vitest";
import {
  countOwnedVoiceSessions,
  listOwnedVoiceObserverSessionIds,
  markVoiceSessionConnected,
  readOwnedVoiceUsage,
} from "../sessions";
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

describe("countOwnedVoiceSessions", () => {
  function createCountContext(result: { count: number | null; error: unknown }) {
    const calls: [string, ...unknown[]][] = [];
    const query = {
      select: (...args: unknown[]) => (calls.push(["select", ...args]), query),
      eq: (...args: unknown[]) => (calls.push(["eq", ...args]), query),
      or: (...args: unknown[]) => (calls.push(["or", ...args]), Promise.resolve(result)),
    };
    const from = vi.fn(() => query);
    return { context: { supabase: { from }, user: { id: "user-1" } } as unknown as SessionDataContext, calls, from };
  }

  it("counts only the voice rows that hold the trial, the same rule as the P0016 trigger", async () => {
    const { context, calls, from } = createCountContext({ count: 1, error: null });

    await expect(countOwnedVoiceSessions(context, new Date("2026-09-23T18:35:50.000Z"))).resolves.toEqual({
      ok: true,
      data: 1,
    });
    expect(from).toHaveBeenCalledWith("therapy_sessions");
    // Connected at any time (tombstones too), or still running before its own deadline.
    expect(calls).toEqual([
      ["select", "id", { count: "exact", head: true }],
      ["eq", "user_id", "user-1"],
      ["eq", "mode", "voice"],
      [
        "or",
        "voice_connected_at.not.is.null,and(status.in.(created,active),or(expires_at.is.null,expires_at.gt.2026-09-23T18:35:50.000Z))",
      ],
    ]);
  });

  it("maps a read error to a stable code and never reports a negative count", async () => {
    await expect(
      countOwnedVoiceSessions(
        createCountContext({ count: null, error: { code: "42501", message: "private" } }).context,
      ),
    ).resolves.toEqual({ ok: false, error: { code: "read_failed" } });
    await expect(countOwnedVoiceSessions(createCountContext({ count: -2, error: null }).context)).resolves.toEqual({
      ok: true,
      data: 0,
    });
  });
});

describe("markVoiceSessionConnected", () => {
  function createUpdateContext(result: { data: unknown; error: unknown }) {
    const calls: [string, ...unknown[]][] = [];
    const query = {
      update: (...args: unknown[]) => (calls.push(["update", ...args]), query),
      eq: (...args: unknown[]) => (calls.push(["eq", ...args]), query),
      is: (...args: unknown[]) => (calls.push(["is", ...args]), query),
      select: (...args: unknown[]) => (calls.push(["select", ...args]), query),
      maybeSingle: () => Promise.resolve(result),
    };
    const from = vi.fn(() => query);
    return { context: { supabase: { from }, user: { id: "user-1" } } as unknown as SessionDataContext, calls };
  }

  const shiftedRow = {
    id: "session-1",
    user_id: "user-1",
    modality_id: "cbt",
    avatar_id: "cbt-guide",
    status: "active",
    // The metadata trigger moved the clock to the connection: same ten minutes, later.
    started_at: "2026-09-23T18:41:12.000Z",
    ended_at: null,
    expires_at: "2026-09-23T18:51:12.000Z",
    deleted_at: null,
    deletion_reason_code: null,
    is_trial: false,
    trial_claim_id: null,
    duration_bucket_seconds: 600,
    uses_approved_context: true,
    mode: "voice",
    voice_connected_at: "2026-09-23T18:41:12.000Z",
    created_at: "2026-09-23T18:35:50.000Z",
    updated_at: "2026-09-23T18:41:12.000Z",
  };

  it("writes only an empty connection column of the owner's voice row and returns the row with the moved clock", async () => {
    const { context, calls } = createUpdateContext({ data: shiftedRow, error: null });

    const result = await markVoiceSessionConnected(context, "session-1", "2026-09-23T18:41:11.000Z");

    expect(result).toMatchObject({
      ok: true,
      data: {
        id: "session-1",
        mode: "voice",
        startedAt: "2026-09-23T18:41:12.000Z",
        expiresAt: "2026-09-23T18:51:12.000Z",
        voiceConnectedAt: "2026-09-23T18:41:12.000Z",
      },
    });
    expect(calls.slice(0, 6)).toEqual([
      ["update", { voice_connected_at: "2026-09-23T18:41:11.000Z" }],
      ["eq", "id", "session-1"],
      ["eq", "user_id", "user-1"],
      ["eq", "mode", "voice"],
      ["is", "voice_connected_at", null],
      ["select", expect.stringContaining("started_at")],
    ]);
    expect(calls[5]?.[1]).toEqual(expect.stringContaining("expires_at"));
  });

  it("returns null when another connection was recorded first and a stable code on a write error", async () => {
    await expect(
      markVoiceSessionConnected(createUpdateContext({ data: null, error: null }).context, "session-1", "x"),
    ).resolves.toEqual({ ok: true, data: null });
    await expect(
      markVoiceSessionConnected(
        createUpdateContext({ data: null, error: { code: "42501", message: "private" } }).context,
        "session-1",
        "x",
      ),
    ).resolves.toMatchObject({ ok: false });
  });
});
