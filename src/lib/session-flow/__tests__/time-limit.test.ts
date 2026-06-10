import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { SessionDataContext, SessionMetadata } from "@/lib/session-data/types";
import {
  expireOwnedSession,
  getProviderTimeoutWithinSessionMs,
  getRemainingSessionTimeMs,
  isSessionExpired,
  type ExpireSessionRepository,
} from "../time-limit";

const now = new Date("2026-06-07T10:00:00.000Z");
const context = {
  user: {
    id: "user-1",
  },
} as SessionDataContext;

const activeSession: SessionMetadata = {
  id: "session-1",
  userId: "user-1",
  modalityId: "cbt",
  avatarId: "cbt-guide",
  status: "active",
  startedAt: "2026-06-07T09:55:00.000Z",
  endedAt: null,
  expiresAt: "2026-06-07T10:10:00.000Z",
  deletedAt: null,
  deletionReasonCode: null,
  isTrial: true,
  trialClaimId: "claim-1",
  durationBucketSeconds: 900,
  createdAt: "2026-06-07T09:55:00.000Z",
  updatedAt: "2026-06-07T09:55:00.000Z",
};

function withExpiry(expiresAt: string | null) {
  return { expiresAt };
}

describe("getRemainingSessionTimeMs", () => {
  it("returns null when the session has no expiry timestamp", () => {
    expect(getRemainingSessionTimeMs(withExpiry(null), now)).toBeNull();
  });

  it("returns null for a malformed expiry timestamp", () => {
    expect(getRemainingSessionTimeMs(withExpiry("not-a-timestamp"), now)).toBeNull();
  });

  it("returns the millisecond budget until expiry", () => {
    expect(getRemainingSessionTimeMs(withExpiry("2026-06-07T10:10:00.000Z"), now)).toBe(600_000);
  });

  it("clamps an already-passed expiry to zero instead of going negative", () => {
    expect(getRemainingSessionTimeMs(withExpiry("2026-06-07T09:59:59.000Z"), now)).toBe(0);
    expect(getRemainingSessionTimeMs(withExpiry("2026-06-07T10:00:00.000Z"), now)).toBe(0);
  });
});

describe("isSessionExpired", () => {
  it("treats a session without an expiry as never expired", () => {
    expect(isSessionExpired(withExpiry(null), now)).toBe(false);
  });

  it("treats the exact expiry instant as expired", () => {
    expect(isSessionExpired(withExpiry("2026-06-07T10:00:00.000Z"), now)).toBe(true);
  });

  it("keeps a session with remaining time active", () => {
    expect(isSessionExpired(withExpiry("2026-06-07T10:00:00.001Z"), now)).toBe(false);
  });
});

describe("getProviderTimeoutWithinSessionMs", () => {
  it("falls back to the provider maximum when the session has no expiry", () => {
    expect(getProviderTimeoutWithinSessionMs(withExpiry(null), now)).toBe(12_000);
  });

  it("clamps a large remaining budget to the provider maximum", () => {
    expect(getProviderTimeoutWithinSessionMs(withExpiry("2026-06-07T10:10:00.000Z"), now)).toBe(12_000);
  });

  it("subtracts the timeout reserve from the remaining budget", () => {
    // 5.5 s remaining - 1 s reserve = 4.5 s for the provider.
    expect(getProviderTimeoutWithinSessionMs(withExpiry("2026-06-07T10:00:05.500Z"), now)).toBe(4_500);
  });

  it("allows exactly the provider minimum when the reserve leaves it intact", () => {
    // 2 s remaining - 1 s reserve = exactly the 1 s minimum.
    expect(getProviderTimeoutWithinSessionMs(withExpiry("2026-06-07T10:00:02.000Z"), now)).toBe(1_000);
  });

  it("returns zero when the post-reserve budget drops below the minimum", () => {
    expect(getProviderTimeoutWithinSessionMs(withExpiry("2026-06-07T10:00:01.999Z"), now)).toBe(0);
  });

  it("returns zero for an already-expired session", () => {
    expect(getProviderTimeoutWithinSessionMs(withExpiry("2026-06-07T09:59:00.000Z"), now)).toBe(0);
  });
});

describe("expireOwnedSession", () => {
  it("returns the current view without a lifecycle write when the session is already expired", async () => {
    const repository: ExpireSessionRepository = {
      transitionSessionLifecycle: vi.fn(),
    };

    const result = await expireOwnedSession(context, { ...activeSession, status: "expired" }, now, repository);

    expect(result).toMatchObject({
      ok: true,
      data: {
        session: {
          id: "session-1",
        },
      },
    });
    expect(repository.transitionSessionLifecycle).not.toHaveBeenCalled();
  });

  it("transitions an active session to expired through the repository", async () => {
    const expiredMetadata: SessionMetadata = {
      ...activeSession,
      status: "expired",
      endedAt: now.toISOString(),
      expiresAt: "2026-06-07T09:59:00.000Z",
    };
    const repository: ExpireSessionRepository = {
      transitionSessionLifecycle: vi.fn(() => Promise.resolve(ok(expiredMetadata))),
    };

    const result = await expireOwnedSession(context, activeSession, now, repository);

    expect(repository.transitionSessionLifecycle).toHaveBeenCalledWith(context, {
      sessionId: "session-1",
      nextStatus: "expired",
      endedAt: "2026-06-07T10:00:00.000Z",
      durationBucketSeconds: 900,
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        session: {
          id: "session-1",
          status: "expired",
          remainingSeconds: 0,
        },
      },
    });
  });

  it("passes repository failures through unchanged", async () => {
    const repository: ExpireSessionRepository = {
      transitionSessionLifecycle: vi.fn(() => Promise.resolve(sessionDataError("invalid_lifecycle_transition"))),
    };

    const result = await expireOwnedSession(context, activeSession, now, repository);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_lifecycle_transition",
      },
    });
  });
});
