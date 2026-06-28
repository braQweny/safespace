import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/session-data/errors";
import type { SessionDataContext, SessionMetadata } from "@/lib/session-data/types";

const requireSessionRouteAccess = vi.fn();
const getOwnedSessionMetadata = vi.fn();
const transitionSessionLifecycle = vi.fn();
const buildOperationalRequestContext = vi.fn();
const logOperationalEvent = vi.fn();

vi.mock("@/lib/session-flow/route-access", () => ({
  requireSessionRouteAccess,
}));

vi.mock("@/lib/session-data/repository", () => ({
  claimFreeTrialSessionAtomic: vi.fn(),
  getOwnedSessionMetadata,
  getTrialAvailability: vi.fn(),
  listNewestApprovedSessionSummaryContexts: vi.fn(),
  listOwnedActiveSessionMetadata: vi.fn(),
  listOwnedSessionMessages: vi.fn(),
  transitionSessionLifecycle,
}));

vi.mock("@/lib/operational-visibility/request-context", () => ({
  buildOperationalRequestContext,
  getOperationalDurationMs: () => 12,
}));

vi.mock("@/lib/operational-visibility/logger", () => ({
  logOperationalEvent,
}));

const { POST } = await import("@/pages/api/session/end");

const contextData = {
  user: {
    id: "user-1",
  },
} as SessionDataContext;

const activeSession: SessionMetadata = {
  id: "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a",
  userId: "user-1",
  modalityId: "cbt",
  avatarId: "cbt-guide",
  status: "active",
  startedAt: "2026-06-12T10:00:00.000Z",
  endedAt: null,
  expiresAt: "2026-06-12T10:15:00.000Z",
  deletedAt: null,
  deletionReasonCode: null,
  isTrial: true,
  trialClaimId: "claim-1",
  durationBucketSeconds: 900,
  createdAt: "2026-06-12T10:00:00.000Z",
  updatedAt: "2026-06-12T10:00:00.000Z",
};

const completedSession: SessionMetadata = {
  ...activeSession,
  status: "completed",
  endedAt: "2026-06-12T10:05:00.000Z",
  updatedAt: "2026-06-12T10:05:00.000Z",
};

function createContext(body: unknown = { sessionId: activeSession.id }) {
  return {
    request: new Request("https://safespace.local/api/session/end", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    }),
    cookies: {},
    locals: {
      user: {
        id: "user-1",
      },
      requestId: "req-1",
    },
    url: new URL("https://safespace.local/api/session/end"),
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("POST /api/session/end", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T10:05:00.000Z"));
    vi.clearAllMocks();

    buildOperationalRequestContext.mockResolvedValue({
      requestId: "req-1",
      route: "/api/session/end",
      method: "POST",
      userHash: "hash-1",
    });
    requireSessionRouteAccess.mockResolvedValue({
      ok: true,
      data: contextData,
    });
    getOwnedSessionMetadata.mockResolvedValue(ok(activeSession));
    transitionSessionLifecycle.mockResolvedValue(ok(completedSession));
  });

  it("rejects missing auth before reading the session", async () => {
    requireSessionRouteAccess.mockResolvedValue({
      ok: false,
      error: {
        code: "missing_auth",
        status: 401,
        source: "session_context",
      },
    });

    const response = await POST(createContext() as never);

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      type: "session_completion_error",
      code: "missing_auth",
    });
    expect(getOwnedSessionMetadata).not.toHaveBeenCalled();
  });

  it("completes an active owned session without waiting for the timer", async () => {
    const response = await POST(createContext() as never);
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(transitionSessionLifecycle).toHaveBeenCalledWith(contextData, {
      sessionId: activeSession.id,
      nextStatus: "completed",
      endedAt: "2026-06-12T10:05:00.000Z",
      durationBucketSeconds: 900,
    });
    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "session.completed",
        reasonCode: "completed",
        status: 200,
      }),
      expect.objectContaining({
        route: "/api/session/end",
      }),
    );
    expect(body).toMatchObject({
      ok: true,
      type: "session_completed",
      session: {
        id: activeSession.id,
        status: "completed",
        endedAt: "2026-06-12T10:05:00.000Z",
      },
    });
  });

  it("returns the completed session idempotently when it was already ended", async () => {
    getOwnedSessionMetadata.mockResolvedValue(ok(completedSession));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: true,
      type: "session_completed",
      session: {
        status: "completed",
      },
    });
    expect(transitionSessionLifecycle).not.toHaveBeenCalled();
    expect(logOperationalEvent).not.toHaveBeenCalled();
  });

  it("marks a stale active session as expired instead of completed", async () => {
    getOwnedSessionMetadata.mockResolvedValue(
      ok({
        ...activeSession,
        expiresAt: "2026-06-12T10:04:59.000Z",
      }),
    );
    transitionSessionLifecycle.mockResolvedValue(
      ok({
        ...activeSession,
        status: "expired",
        endedAt: "2026-06-12T10:05:00.000Z",
        expiresAt: "2026-06-12T10:04:59.000Z",
      }),
    );

    const response = await POST(createContext() as never);

    expect(response.status).toBe(409);
    expect(transitionSessionLifecycle).toHaveBeenCalledWith(
      contextData,
      expect.objectContaining({
        nextStatus: "expired",
        endedAt: "2026-06-12T10:05:00.000Z",
      }),
    );
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      type: "expired",
      code: "session_expired",
      session: {
        status: "expired",
      },
    });
  });

  it("rejects non-active sessions without a lifecycle write", async () => {
    getOwnedSessionMetadata.mockResolvedValue(
      ok({
        ...activeSession,
        status: "interrupted",
        endedAt: "2026-06-12T10:04:00.000Z",
      }),
    );

    const response = await POST(createContext() as never);

    expect(response.status).toBe(409);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      type: "session_completion_error",
      code: "session_not_active",
    });
    expect(transitionSessionLifecycle).not.toHaveBeenCalled();
  });

  it("rejects malformed session ids before touching the repository", async () => {
    const response = await POST(createContext({ sessionId: "not-a-uuid" }) as never);

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      type: "validation_failed",
      code: "validation_failed",
    });
    expect(getOwnedSessionMetadata).not.toHaveBeenCalled();
  });
});
