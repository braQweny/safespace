import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type {
  AvatarMemoryWork,
  getOwnedAvatarMemoryWork,
  saveOwnedAvatarMemoryWork,
} from "@/lib/session-data/avatar-memory";
import type { SessionDataContext } from "@/lib/session-data/types";
import type { GenerateSessionSummaryInput, SessionSummaryResponse } from "@/lib/session-summary/types";
import { AVATAR_MEMORY_BATCH_MAX_CHARS } from "@/lib/session-summary/avatar-memory-budget";

vi.mock("@/lib/session-summary/provider", () => ({ generateSessionSummary: vi.fn() }));
import { buildAvatarMemoryBatch, prepareOwnedAvatarMemory } from "../avatar-memory";

const context = { user: { id: "owner" } } as SessionDataContext;
const avatar = { avatarId: "cbt-guide", modalityId: "cbt" } as const;
const work: AvatarMemoryWork = {
  revision: "revision-1",
  summaryText: "Ważny fakt z pierwszej rozmowy.",
  messages: [{ sessionId: "old-session", role: "user", content: "Fakt.", sequenceIndex: 0, characterOffset: 5 }],
};
const response: SessionSummaryResponse = {
  summaryText: "Fakty ze wszystkich rozmów.",
  providerMetadata: { provider: "openrouter", model: "test" },
};
const readyWork = { ...work, messages: [] };
const dependencies = () => ({
  getOwnedAvatarMemoryWork: vi
    .fn<typeof getOwnedAvatarMemoryWork>()
    .mockResolvedValueOnce(ok(work))
    .mockResolvedValue(ok(readyWork)),
  saveOwnedAvatarMemoryWork: vi.fn<typeof saveOwnedAvatarMemoryWork>().mockResolvedValue(ok(true)),
  generateSessionSummary: vi
    .fn<(input: GenerateSessionSummaryInput) => Promise<SessionSummaryResponse>>()
    .mockResolvedValue(response),
});

function conversation(sessionId: string, count: number, content: string) {
  return Array.from({ length: count }, (_, sequenceIndex) => ({
    sessionId,
    sequenceIndex,
    role: sequenceIndex % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content,
    characterOffset: Array.from(content).length,
  }));
}

describe("automatic avatar memory", () => {
  it("uses one generation for 40 full-length messages instead of three", async () => {
    const deps = dependencies();
    const messages = conversation("session-a", 40, "🙂".repeat(1200));
    deps.getOwnedAvatarMemoryWork
      .mockReset()
      .mockResolvedValueOnce(ok({ ...work, messages }))
      .mockResolvedValue(ok(readyWork));
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: true, ready: true });
    expect(deps.generateSessionSummary).toHaveBeenCalledTimes(1);
    const input = deps.generateSessionSummary.mock.calls[0][0];
    expect(input.messages).toHaveLength(40);
    expect(input.messages.map((m: { content: string }) => m.content).join("")).toBe(
      messages.map((m) => m.content).join(""),
    );
    expect(deps.saveOwnedAvatarMemoryWork).toHaveBeenCalledWith(context, "cbt-guide", {
      revision: work.revision,
      summaryText: response.summaryText,
      cursors: [{ sessionId: "session-a", sequenceIndex: 39, characterOffset: 1200 }],
    });
  });

  it("combines ten short conversations into one generation and one atomic progress save", async () => {
    const deps = dependencies();
    const messages = Array.from({ length: 10 }, (_, index) =>
      conversation(`session-${index}`, 8, `Fakt ${index}.`),
    ).flat();
    deps.getOwnedAvatarMemoryWork
      .mockReset()
      .mockResolvedValueOnce(ok({ ...work, messages }))
      .mockResolvedValue(ok(readyWork));
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: true, ready: true });
    expect(deps.generateSessionSummary).toHaveBeenCalledTimes(1);
    expect(deps.saveOwnedAvatarMemoryWork).toHaveBeenCalledTimes(1);
    const input = deps.generateSessionSummary.mock.calls[0][0];
    expect(input.continuityMemory).toBe(work.summaryText);
    expect(input.messages).toHaveLength(80);
    expect(input.messages[0]).toEqual({ role: "user", content: "Fakt 0.", conversationIndex: 1 });
    expect(input.messages[79]).toEqual({ role: "assistant", content: "Fakt 9.", conversationIndex: 10 });
    expect(JSON.stringify(input)).not.toContain("session-");
    expect(deps.saveOwnedAvatarMemoryWork.mock.calls[0][2].cursors).toHaveLength(10);
  });

  it("keeps a large Unicode message intact and carries its absolute cursor without re-splitting", () => {
    const content = "🙂".repeat(30000);
    const batch = buildAvatarMemoryBatch({
      ...work,
      messages: [{ ...work.messages[0], content, characterOffset: 78000 }],
    });
    expect(batch.messages).toEqual([{ role: "user", content, conversationIndex: 1 }]);
    expect(batch.cursors).toEqual([{ sessionId: "old-session", sequenceIndex: 0, characterOffset: 78000 }]);
  });

  it("does not call AI again when the history is already covered", async () => {
    const deps = dependencies();
    deps.getOwnedAvatarMemoryWork.mockReset().mockResolvedValue(ok(readyWork));
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: true, ready: true });
    expect(deps.generateSessionSummary).not.toHaveBeenCalled();
  });

  it("requests another step when a bounded batch leaves more history", async () => {
    const deps = dependencies();
    deps.getOwnedAvatarMemoryWork.mockReset().mockResolvedValue(ok(work));
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: true, ready: false });
    expect(deps.getOwnedAvatarMemoryWork.mock.invocationCallOrder[1]).toBeGreaterThan(
      deps.saveOwnedAvatarMemoryWork.mock.invocationCallOrder[0],
    );
  });

  it("does not claim readiness if checking the saved memory fails", async () => {
    const deps = dependencies();
    deps.getOwnedAvatarMemoryWork
      .mockReset()
      .mockResolvedValueOnce(ok(work))
      .mockResolvedValueOnce(sessionDataError("read_failed"));
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: false });
  });

  it("keeps a failed generation retryable without advancing any source cursor", async () => {
    const deps = dependencies();
    deps.generateSessionSummary.mockRejectedValue(new Error("private provider error"));
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: false });
    expect(deps.saveOwnedAvatarMemoryWork).not.toHaveBeenCalled();
  });

  it("rejects overlong input before calling the provider", async () => {
    const deps = dependencies();
    const messages = conversation("session", 1, "x".repeat(AVATAR_MEMORY_BATCH_MAX_CHARS + 1));
    deps.getOwnedAvatarMemoryWork.mockReset().mockResolvedValue(ok({ ...work, messages }));
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: false });
    expect(deps.generateSessionSummary).not.toHaveBeenCalled();
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
    expect(deps.getOwnedAvatarMemoryWork).toHaveBeenCalledTimes(1);
  });

  it("reports read and save failures without an empty-context fallback", async () => {
    const deps = dependencies();
    deps.getOwnedAvatarMemoryWork
      .mockReset()
      .mockResolvedValueOnce(sessionDataError("read_failed"))
      .mockResolvedValueOnce(ok(work));
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: false });
    deps.saveOwnedAvatarMemoryWork.mockResolvedValue(sessionDataError("write_failed"));
    expect(await prepareOwnedAvatarMemory(context, avatar, deps)).toEqual({ ok: false });
  });
});
