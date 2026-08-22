import { describe, expect, it, vi } from "vitest";
import type { SessionDataContext, SessionMetadata } from "@/lib/session-data/types";
import { readActiveSessionBadge, toActiveSessionBadge } from "../active-session-badge";

const now = new Date("2026-06-12T10:00:00.000Z");

function createSession(overrides: Partial<SessionMetadata> = {}): SessionMetadata {
  return {
    id: "session-1",
    userId: "user-1",
    status: "active",
    modalityId: "cbt",
    avatarId: "cbt-guide",
    startedAt: "2026-06-12T09:55:00.000Z",
    endedAt: null,
    expiresAt: "2026-06-12T10:10:00.000Z",
    isTrial: true,
    durationBucketSeconds: 900,
    usesApprovedContext: false,
    createdAt: "2026-06-12T09:55:00.000Z",
    updatedAt: "2026-06-12T09:55:00.000Z",
    ...overrides,
  } as SessionMetadata;
}

const context = {} as SessionDataContext;

describe("toActiveSessionBadge", () => {
  it("rounds the remaining time up so the last minute never reads as zero", () => {
    expect(toActiveSessionBadge(createSession({ expiresAt: "2026-06-12T10:00:30.000Z" }), now)).toEqual({
      sessionId: "session-1",
      remainingMinutes: 1,
    });
    expect(toActiveSessionBadge(createSession(), now)?.remainingMinutes).toBe(10);
  });

  it("hides the badge for sessions that are already past their limit", () => {
    expect(toActiveSessionBadge(createSession({ expiresAt: "2026-06-12T09:59:59.000Z" }), now)).toBeNull();
    expect(toActiveSessionBadge(createSession({ expiresAt: null }), now)).toBeNull();
    expect(toActiveSessionBadge(null, now)).toBeNull();
  });
});

describe("readActiveSessionBadge", () => {
  it("returns the first session that is still within its time limit", async () => {
    const listActiveSessions = vi.fn().mockResolvedValue({
      ok: true,
      data: [
        createSession({ id: "expired-session", expiresAt: "2026-06-12T09:30:00.000Z" }),
        createSession({ id: "live-session", expiresAt: "2026-06-12T10:05:00.000Z" }),
      ],
    });

    await expect(readActiveSessionBadge(context, { avatarId: "cbt-guide", now }, listActiveSessions)).resolves.toEqual({
      sessionId: "live-session",
      remainingMinutes: 5,
    });
  });

  it("stays silent instead of failing the page when the read fails", async () => {
    const listActiveSessions = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: "read_failed" },
    });

    await expect(
      readActiveSessionBadge(context, { avatarId: "cbt-guide", now }, listActiveSessions),
    ).resolves.toBeNull();
  });
});
