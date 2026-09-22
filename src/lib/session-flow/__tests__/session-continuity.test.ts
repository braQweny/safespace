import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { SessionDataContext, SessionMetadata } from "@/lib/session-data/types";

const {
  getOwnedSessionPinnedContext,
  listNewestApprovedSessionSummaryContexts,
  isPeopleMemoryEnabled,
  isTopicMapEnabled,
} = vi.hoisted(() => ({
  getOwnedSessionPinnedContext: vi.fn(),
  listNewestApprovedSessionSummaryContexts: vi.fn(),
  isPeopleMemoryEnabled: vi.fn(() => true),
  isTopicMapEnabled: vi.fn(() => true),
}));
vi.mock("@/lib/session-data/repository", () => ({
  getOwnedSessionPinnedContext,
  listNewestApprovedSessionSummaryContexts,
}));
vi.mock("@/lib/session-flow/people-memory-mode", () => ({ isPeopleMemoryEnabled }));
vi.mock("@/lib/session-flow/topic-map-mode", () => ({ isTopicMapEnabled }));
import { getValidAvatarChoice } from "@/lib/modalities";
import { loadOwnedSessionContinuity, toSessionPromptContext } from "../session-continuity";

const context = { user: { id: "owner" } } as SessionDataContext;
const session = {
  id: "session",
  avatarId: "cbt-guide",
  usesApprovedContext: true,
  usesAvatarMemory: true,
} as SessionMetadata;

describe("loadOwnedSessionContinuity", () => {
  it("returns the pinned memory together with both briefs when their flags are on", async () => {
    getOwnedSessionPinnedContext.mockResolvedValue(
      ok({ avatarMemory: "Pamięć", peopleBrief: "- Marta", topicBrief: "- Odmawianie" }),
    );
    expect(await loadOwnedSessionContinuity(context, session)).toEqual({
      ok: true,
      data: [],
      avatarMemory: "Pamięć",
      peopleBrief: "- Marta",
      topicBrief: "- Odmawianie",
    });
    expect(listNewestApprovedSessionSummaryContexts).not.toHaveBeenCalled();
  });

  it("drops the pinned topic brief while the topic map flag is off, independently of the people flag", async () => {
    isTopicMapEnabled.mockReturnValueOnce(false);
    getOwnedSessionPinnedContext.mockResolvedValue(
      ok({ avatarMemory: "Pamięć", peopleBrief: "- Marta", topicBrief: "- Odmawianie" }),
    );
    expect(await loadOwnedSessionContinuity(context, session)).toEqual({
      ok: true,
      data: [],
      avatarMemory: "Pamięć",
      peopleBrief: "- Marta",
    });
  });

  it("drops a pinned brief while the flag is off and never invents one when none was pinned", async () => {
    isPeopleMemoryEnabled.mockReturnValueOnce(false);
    getOwnedSessionPinnedContext.mockResolvedValue(ok({ avatarMemory: "Pamięć", peopleBrief: "- Marta" }));
    expect(await loadOwnedSessionContinuity(context, session)).toEqual({ ok: true, data: [], avatarMemory: "Pamięć" });
    getOwnedSessionPinnedContext.mockResolvedValue(ok({ avatarMemory: "Pamięć" }));
    expect(await loadOwnedSessionContinuity(context, session)).toEqual({ ok: true, data: [], avatarMemory: "Pamięć" });
  });

  it("propagates a failed pinned read instead of answering without history", async () => {
    getOwnedSessionPinnedContext.mockResolvedValue(sessionDataError("read_failed"));
    expect(await loadOwnedSessionContinuity(context, session)).toMatchObject({
      ok: false,
      error: { code: "read_failed" },
    });
  });

  it("keeps the legacy summary path for sessions without avatar memory", async () => {
    listNewestApprovedSessionSummaryContexts.mockResolvedValue(ok([]));
    expect(await loadOwnedSessionContinuity(context, { ...session, usesAvatarMemory: false })).toEqual({
      ok: true,
      data: [],
    });
    expect(listNewestApprovedSessionSummaryContexts).toHaveBeenCalledWith(context, { avatarId: "cbt-guide" });
    expect(await loadOwnedSessionContinuity(context, { ...session, usesApprovedContext: false })).toEqual({
      ok: true,
      data: [],
    });
  });
});

describe("toSessionPromptContext", () => {
  const cbt = getValidAvatarChoice("cbt", "cbt-guide");
  if (!cbt) throw new Error("cbt avatar missing from the catalog");

  it("builds the modality in English prompt names with the register examples of the conversation language", () => {
    const context = toSessionPromptContext(cbt, { ok: true, data: [] }, "pl");

    expect(context.modality).toEqual({
      modalityName: "Cognitive-behavioural approach",
      avatarName: "Marek, practical guide",
      sessionStyleHint: cbt.sessionStyleHint,
      registerExamples: cbt.registerExamples.pl,
    });
    expect(toSessionPromptContext(cbt, { ok: true, data: [] }, "en").modality.registerExamples).toBe(
      cbt.registerExamples.en,
    );
  });

  it("carries the pinned memory and both briefs exactly as the continuity read them", () => {
    expect(
      toSessionPromptContext(
        cbt,
        { ok: true, data: [], avatarMemory: "Pamięć", peopleBrief: "- Marta", topicBrief: "- Odmawianie" },
        "pl",
      ),
    ).toMatchObject({
      avatarMemory: "Pamięć",
      peopleBrief: "- Marta",
      topicBrief: "- Odmawianie",
      approvedSummaries: [],
    });

    // A brief the continuity dropped (flag off, nothing pinned) stays absent, never invented.
    const withoutBriefs = toSessionPromptContext(cbt, { ok: true, data: [], avatarMemory: "Pamięć" }, "pl");
    expect(withoutBriefs.peopleBrief).toBeUndefined();
    expect(withoutBriefs.topicBrief).toBeUndefined();
  });

  it("passes legacy summaries as text, revision and dates only, without row or session ids", () => {
    const context = toSessionPromptContext(
      cbt,
      {
        ok: true,
        data: [
          {
            id: "summary-1",
            sessionId: "session-1",
            summaryText: "Zatwierdzone podsumowanie.",
            revision: 2,
            createdAt: "2026-06-07T09:00:00.000Z",
            updatedAt: "2026-06-07T09:30:00.000Z",
          },
        ],
      },
      "pl",
    );

    expect(context.approvedSummaries).toEqual([
      {
        summaryText: "Zatwierdzone podsumowanie.",
        revision: 2,
        createdAt: "2026-06-07T09:00:00.000Z",
        updatedAt: "2026-06-07T09:30:00.000Z",
      },
    ]);
    expect(context.avatarMemory).toBeUndefined();
  });
});
