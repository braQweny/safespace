import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { AvatarMemoryWork } from "@/lib/session-data/avatar-memory";
import type { SessionDataContext } from "@/lib/session-data/types";
import type { SessionSummaryResponse } from "@/lib/session-summary/types";

vi.mock("@/lib/session-summary/provider", () => ({ generateSessionSummary: vi.fn() }));
import { buildAvatarMemoryBatch, prepareOwnedAvatarMemory } from "../avatar-memory";

const context = { user: { id: "owner" } } as SessionDataContext;
const avatar = { avatarId: "cbt-guide", modalityId: "cbt" } as const;
const work: AvatarMemoryWork = {
  revision: "revision-1",
  summaryText: "Ważny fakt z pierwszej rozmowy.",
  sessionId: "old-session",
  sequenceIndex: -1,
  characterOffset: 0,
  messages: [{ role: "user", content: "Fakt z kolejnej rozmowy.", sequenceIndex: 0 }],
};
const response: SessionSummaryResponse = {
  summaryText: "Fakty ze wszystkich rozmów.",
  providerMetadata: { provider: "openrouter", model: "test" },
};
const dependencies = () => ({
  getOwnedAvatarMemoryWork: vi.fn().mockResolvedValue(ok(work)),
  saveOwnedAvatarMemoryWork: vi.fn().mockResolvedValue(ok(true)),
  generateSessionSummary: vi.fn().mockResolvedValue(response),
});

describe("automatic avatar memory", () => {
  it("reads saved progress and carries earlier facts into every generation", async () => {
    const deps = dependencies();
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: true, ready: false });
    expect(deps.getOwnedAvatarMemoryWork).toHaveBeenCalledWith(context, "cbt-guide");
    expect(deps.generateSessionSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        continuityMemory: work.summaryText,
        messages: work.messages,
      }),
    );
    expect(deps.saveOwnedAvatarMemoryWork).toHaveBeenCalledWith(
      context,
      "cbt-guide",
      expect.objectContaining({
        revision: work.revision,
        sessionId: work.sessionId,
        sequenceIndex: 0,
        characterOffset: Array.from(work.messages[0].content).length,
        summaryText: response.summaryText,
      }),
    );
  });

  it("does not call AI again when every previous conversation is already covered", async () => {
    const deps = dependencies();
    deps.getOwnedAvatarMemoryWork.mockResolvedValue(ok({ ...work, sessionId: null, messages: [] }));
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: true, ready: true });
    expect(deps.generateSessionSummary).not.toHaveBeenCalled();
  });

  it("finishes the last batch in the same request without requiring another start POST", async () => {
    const deps = dependencies();
    deps.getOwnedAvatarMemoryWork
      .mockResolvedValueOnce(ok(work))
      .mockResolvedValueOnce(ok({ ...work, sessionId: null, messages: [] }));
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: true, ready: true });
    expect(deps.generateSessionSummary).toHaveBeenCalledTimes(1);
    expect(deps.getOwnedAvatarMemoryWork.mock.invocationCallOrder[1]).toBeGreaterThan(
      deps.saveOwnedAvatarMemoryWork.mock.invocationCallOrder[0],
    );
  });

  it("does not claim readiness if checking the saved memory fails", async () => {
    const deps = dependencies();
    deps.getOwnedAvatarMemoryWork
      .mockResolvedValueOnce(ok(work))
      .mockResolvedValueOnce(sessionDataError("read_failed"));
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: false });
  });

  it("keeps a failed generation retryable and never advances its cursor", async () => {
    const deps = dependencies();
    deps.generateSessionSummary.mockRejectedValue(new Error("private provider error"));
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: false });
    expect(deps.saveOwnedAvatarMemoryWork).not.toHaveBeenCalled();
  });

  it("does not truncate an overlong memory or claim to have saved it", async () => {
    const deps = dependencies();
    deps.generateSessionSummary.mockResolvedValue({ ...response, summaryText: "x".repeat(6001) });
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: false });
    expect(deps.saveOwnedAvatarMemoryWork).not.toHaveBeenCalled();
  });

  it("re-reads after a concurrent update or deletion instead of using stale generated text", async () => {
    const deps = dependencies();
    deps.saveOwnedAvatarMemoryWork.mockResolvedValue(ok(false));
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: true, ready: false });
  });

  it("reports read and save failures without an empty-context fallback", async () => {
    const deps = dependencies();
    deps.getOwnedAvatarMemoryWork.mockResolvedValueOnce(sessionDataError("read_failed"));
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: false });
    deps.saveOwnedAvatarMemoryWork.mockResolvedValue(sessionDataError("write_failed"));
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: false });
  });

  it("processes every character of a large history with bounded batches and resumable Unicode offsets", () => {
    const messages = Array.from({ length: 45 }, (_, sequenceIndex) => ({
      role: "user" as const,
      content: sequenceIndex === 0 ? "🙂".repeat(25001) + "pierwszy fakt" : `Fakt ${sequenceIndex}`,
      sequenceIndex,
    }));
    const collected: string[] = [];
    let cursor = { sequenceIndex: -1, characterOffset: 0 };
    for (let iteration = 0; iteration < 20; iteration++) {
      const batch = buildAvatarMemoryBatch({
        ...work,
        ...cursor,
        messages: messages.filter((m) => m.sequenceIndex >= cursor.sequenceIndex).slice(0, 16),
      });
      if (batch.messages.length === 0) break;
      expect(batch.messages.length).toBeLessThanOrEqual(16);
      for (const message of batch.messages) expect(Array.from(message.content).length).toBeLessThanOrEqual(1200);
      collected.push(...batch.messages.map((m) => m.content));
      cursor = { sequenceIndex: batch.sequenceIndex, characterOffset: batch.characterOffset };
    }
    expect(collected.join("")).toBe(messages.map((m) => m.content).join(""));
    expect(cursor.sequenceIndex).toBe(44);
  });
});
