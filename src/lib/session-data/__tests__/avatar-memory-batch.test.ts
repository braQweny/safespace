import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { getOwnedAvatarMemoryWork, saveOwnedAvatarMemoryWork } from "../avatar-memory";
import type { SessionDataContext } from "../types";
import {
  AVATAR_MEMORY_BATCH_MAX_CHARS,
  AVATAR_MEMORY_BATCH_MAX_MESSAGES,
} from "@/lib/session-summary/avatar-memory-budget";

const message = { sessionId: "session", role: "user", sequenceIndex: 3, characterOffset: 48005, content: "🙂" };
const work = { revision: "revision", summaryText: "Poprzednia pamięć", messages: [message] };
function context(result: unknown) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
  return { data: { user: { id: "owner" }, supabase: { rpc } } as unknown as SessionDataContext, rpc };
}

describe("avatar memory batch repository", () => {
  it("reads the bounded multi-conversation RPC and keeps absolute Unicode offsets", async () => {
    const { data, rpc } = context(work);
    expect(await getOwnedAvatarMemoryWork(data, "cbt-guide")).toEqual({
      ok: true,
      data: { ...work, forgottenPeople: [] },
    });
    expect(rpc).toHaveBeenCalledWith("get_avatar_memory_batch", { p_avatar_id: "cbt-guide" });
  });

  it.each([
    { ...work, messages: [{ ...message, characterOffset: -1 }] },
    { ...work, messages: [{ ...message, sequenceIndex: 0.5 }] },
    { ...work, messages: [{ ...message, sessionId: null }] },
    { ...work, messages: [{ ...message, content: "x".repeat(48001), characterOffset: 48001 }] },
    { ...work, messages: Array.from({ length: 129 }, () => message) },
    { ...work, summaryText: "x".repeat(6001) },
  ])("rejects malformed or over-budget private work", async (invalid) => {
    expect(await getOwnedAvatarMemoryWork(context(invalid).data, "cbt-guide")).toMatchObject({
      ok: false,
      error: { code: "read_failed" },
    });
  });

  it("saves all cursors in one RPC and surfaces a lost revision as false", async () => {
    const { data, rpc } = context(false);
    const cursors = [
      { sessionId: "first", sequenceIndex: 4, characterOffset: 1200 },
      { sessionId: "second", sequenceIndex: 1, characterOffset: 4800 },
    ];
    expect(
      await saveOwnedAvatarMemoryWork(data, "cbt-guide", { revision: "revision", summaryText: "Nowa pamięć", cursors }),
    ).toEqual({ ok: true, data: false });
    expect(rpc).toHaveBeenCalledWith("save_avatar_memory_batch", {
      p_avatar_id: "cbt-guide",
      p_revision: "revision",
      p_summary_text: "Nowa pamięć",
      p_cursors: cursors,
    });
  });

  it("keeps application budgets aligned with the SQL batch reader", () => {
    const migration = readFileSync(
      new URL("../../../../supabase/migrations/20260905075745_batch_avatar_memory_by_text_budget.sql", import.meta.url),
      "utf8",
    );
    expect(migration).toContain(`v_max_chars constant integer := ${AVATAR_MEMORY_BATCH_MAX_CHARS};`);
    expect(migration).toContain(`v_max_messages constant integer := ${AVATAR_MEMORY_BATCH_MAX_MESSAGES};`);
  });
});
