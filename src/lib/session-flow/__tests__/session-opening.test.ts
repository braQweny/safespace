import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/session-data/errors";
import type { SessionDataContext, SessionMetadata } from "@/lib/session-data/types";

const {
  generateSessionResponse,
  getProviderTimeoutWithinSessionMs,
  persistOpeningMessage,
  loadOwnedSessionContinuity,
} = vi.hoisted(() => ({
  generateSessionResponse: vi.fn(),
  getProviderTimeoutWithinSessionMs: vi.fn(() => 12_000),
  persistOpeningMessage: vi.fn(),
  loadOwnedSessionContinuity: vi.fn(),
}));
vi.mock("@/lib/session-ai/provider", () => ({ generateSessionResponse }));
vi.mock("@/lib/session-flow/time-limit", () => ({ getProviderTimeoutWithinSessionMs }));
vi.mock("@/lib/session-flow/message-persistence", () => ({ persistOpeningMessage }));
vi.mock("@/lib/session-flow/people-memory-mode", () => ({ isPeopleMemoryEnabled: () => true }));
vi.mock("@/lib/session-flow/topic-map-mode", () => ({ isTopicMapEnabled: () => true }));
vi.mock("@/lib/session-flow/session-continuity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../session-continuity")>()),
  loadOwnedSessionContinuity,
}));

const { createSessionOpeningMessage } = await import("../session-opening");
const { toSessionPromptContext } = await import("../session-continuity");
const { getValidAvatarChoice } = await import("@/lib/modalities");

const context = { user: { id: "owner" } } as SessionDataContext;
const session = {
  id: "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f",
  modalityId: "cbt",
  avatarId: "cbt-guide",
  usesApprovedContext: true,
  usesAvatarMemory: true,
} as SessionMetadata;
const continuity = {
  ok: true as const,
  data: [],
  avatarMemory: "Pamięć z poprzednich rozmów.",
  peopleBrief: "- Marta (koleżanka z pracy)",
  topicBrief: "- Odmawianie w pracy",
};

beforeEach(() => {
  vi.clearAllMocks();
  loadOwnedSessionContinuity.mockResolvedValue(continuity);
  generateSessionResponse.mockResolvedValue({ assistantText: "Cześć, jestem Marek." });
  persistOpeningMessage.mockResolvedValue(
    ok({ id: "m1", role: "assistant", sequenceIndex: 0, content: "Cześć, jestem Marek.", createdAt: "x" }),
  );
});

describe("createSessionOpeningMessage", () => {
  it("opens with exactly the shared prompt context, in the opening mode and phase", async () => {
    const cbt = getValidAvatarChoice("cbt", "cbt-guide");
    if (!cbt) throw new Error("cbt avatar missing from the catalog");

    await expect(createSessionOpeningMessage(context, session, { locale: "pl" })).resolves.toMatchObject({ ok: true });
    expect(loadOwnedSessionContinuity).toHaveBeenCalledWith(context, session);
    expect(generateSessionResponse).toHaveBeenCalledWith({
      ...toSessionPromptContext(cbt, continuity, "pl"),
      mode: "opening",
      sessionPhase: "opening",
      locale: "pl",
    });
  });

  it("does not generate when the continuity cannot be read", async () => {
    loadOwnedSessionContinuity.mockResolvedValueOnce({ ok: false, error: { code: "read_failed" } });

    await expect(createSessionOpeningMessage(context, session, { locale: "pl" })).resolves.toEqual({
      ok: false,
      failure: "opening_unavailable",
    });
    expect(generateSessionResponse).not.toHaveBeenCalled();
  });
});
