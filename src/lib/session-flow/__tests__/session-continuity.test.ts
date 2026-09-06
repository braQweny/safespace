import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { SessionDataContext, SessionMetadata } from "@/lib/session-data/types";

const { getOwnedSessionPinnedContext, listNewestApprovedSessionSummaryContexts, isPeopleMemoryEnabled } = vi.hoisted(
  () => ({
    getOwnedSessionPinnedContext: vi.fn(),
    listNewestApprovedSessionSummaryContexts: vi.fn(),
    isPeopleMemoryEnabled: vi.fn(() => true),
  }),
);
vi.mock("@/lib/session-data/repository", () => ({
  getOwnedSessionPinnedContext,
  listNewestApprovedSessionSummaryContexts,
}));
vi.mock("@/lib/session-flow/people-memory-mode", () => ({ isPeopleMemoryEnabled }));
import { loadOwnedSessionContinuity } from "../session-continuity";

const context = { user: { id: "owner" } } as SessionDataContext;
const session = {
  id: "session",
  avatarId: "cbt-guide",
  usesApprovedContext: true,
  usesAvatarMemory: true,
} as SessionMetadata;

describe("loadOwnedSessionContinuity", () => {
  it("returns the pinned memory together with the people brief when the flag is on", async () => {
    getOwnedSessionPinnedContext.mockResolvedValue(ok({ avatarMemory: "Pamięć", peopleBrief: "- Marta" }));
    expect(await loadOwnedSessionContinuity(context, session)).toEqual({
      ok: true,
      data: [],
      avatarMemory: "Pamięć",
      peopleBrief: "- Marta",
    });
    expect(listNewestApprovedSessionSummaryContexts).not.toHaveBeenCalled();
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
