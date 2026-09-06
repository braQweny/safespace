import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { CurrentAvatarChoice } from "@/lib/session-flow/avatar-choice";
import type { SessionDataContext, SessionMetadata } from "@/lib/session-data/types";
import { MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";

const getSessionDataContext = vi.fn();
const requireActiveAccountAccess = vi.fn();
const readCurrentAvatarChoice = vi.fn();
const createPendingSession = vi.fn();
const prepareOwnedAvatarMemory = vi.fn();
vi.mock("@/lib/session-flow/avatar-memory", () => ({ prepareOwnedAvatarMemory }));
const transitionSessionLifecycle = vi.fn();
const readSessionQuota = vi.fn();
const buildOperationalRequestContext = vi.fn();
const logOperationalEvent = vi.fn();

vi.mock("@/lib/session-data/quota", () => ({
  readSessionQuota,
  readTrialAvailability: vi.fn(),
  claimFreeTrialSession: vi.fn(),
}));

vi.mock("@/lib/session-data/auth", () => ({
  getSessionDataContext,
}));

vi.mock("@/lib/admin/account-access", () => ({
  requireActiveAccountAccess,
}));

vi.mock("@/lib/session-flow/avatar-choice", () => ({
  readCurrentAvatarChoice,
}));

vi.mock("@/lib/session-data/repository", () => ({
  claimFreeTrialSessionAtomic: vi.fn(),
  createPendingSession,
  createSessionTrialClaim: vi.fn(),
  getOwnedSessionMetadata: vi.fn(),
  getTrialAvailability: vi.fn(),
  listOwnedActiveSessionMetadata: vi.fn(),
  listNewestApprovedSessionSummaryContexts: vi.fn(),
  listOwnedSessionMessages: vi.fn(),
  purgeAndTombstoneOwnedSession: vi.fn(),
  transitionSessionLifecycle,
  updateSessionTombstone: vi.fn(),
}));

vi.mock("@/lib/operational-visibility/request-context", () => ({
  buildOperationalRequestContext,
  getOperationalDurationMs: () => 12,
}));

vi.mock("@/lib/operational-visibility/logger", () => ({
  logOperationalEvent,
}));

const createSessionOpeningMessage = vi.fn();

vi.mock("@/lib/session-flow/session-opening", () => ({
  createSessionOpeningMessage,
}));

const { POST } = await import("@/pages/api/session/start-next");

const contextData = {
  user: {
    id: "user-1",
  },
} as SessionDataContext;

// Katalog jest jedynym źródłem kształtu perspektywy; testy dokładają tylko krótkie hinty.
const CBT_MODALITY = MVP_MODALITIES.find((modality) => modality.modalityId === "cbt") ?? MVP_MODALITIES[1];
const avatar = {
  modality: {
    ...CBT_MODALITY,
    sessionStyleHint: "Uzywa jasnej struktury.",
    summaryLensHint: "Podsumuj przez soczewke poznawczo-behawioralna.",
  },
  selected: toSelectedModalityAvatar(CBT_MODALITY),
} satisfies CurrentAvatarChoice;

const createdSession: SessionMetadata = {
  id: "next-session-1",
  userId: "user-1",
  modalityId: "cbt",
  avatarId: "cbt-guide",
  status: "created",
  startedAt: "2026-06-07T10:00:00.000Z",
  endedAt: null,
  expiresAt: "2026-06-07T10:15:00.000Z",
  deletedAt: null,
  deletionReasonCode: null,
  isTrial: false,
  trialClaimId: null,
  durationBucketSeconds: 900,
  usesApprovedContext: true,
  createdAt: "2026-06-07T10:00:00.000Z",
  updatedAt: "2026-06-07T10:00:00.000Z",
};

const activeSession: SessionMetadata = {
  ...createdSession,
  status: "active",
};

function createContext(body?: unknown, accept = "application/json") {
  return {
    request: new Request("https://safespace.local/api/session/start-next", {
      method: "POST",
      headers: {
        Accept: accept,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    cookies: {},
    locals: {
      user: {
        id: "user-1",
      },
      requestId: "req-1",
    },
    url: new URL("https://safespace.local/api/session/start-next"),
    redirect: vi.fn((path: string, status?: number) => {
      const responseStatus = status ?? 302;

      return new Response(null, {
        status: responseStatus,
        headers: {
          Location: path,
        },
      });
    }),
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("POST /api/session/start-next", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T10:00:00.000Z"));
    vi.clearAllMocks();

    buildOperationalRequestContext.mockResolvedValue({
      requestId: "req-1",
      route: "/api/session/start-next",
      method: "POST",
      userHash: "hash-1",
    });
    getSessionDataContext.mockReturnValue(ok(contextData));
    requireActiveAccountAccess.mockResolvedValue({
      ok: true,
      data: {
        userId: "user-1",
        status: "active",
        blockedAt: null,
        blockReasonCode: null,
        plan: "free",
        premiumGrantedAt: null,
      },
    });
    readCurrentAvatarChoice.mockResolvedValue(ok(avatar));
    readSessionQuota.mockResolvedValue(
      ok({
        plan: "free",
        sessionLimit: 3,
        usedSessions: 1,
        remainingSessions: 2,
        canStartSession: true,
      }),
    );
    prepareOwnedAvatarMemory.mockResolvedValue({ ok: true, ready: true });
    createPendingSession.mockResolvedValue(ok(createdSession));
    transitionSessionLifecycle.mockResolvedValue(ok(activeSession));
    createSessionOpeningMessage.mockResolvedValue({ ok: true, message: null });
  });

  it("starts a non-trial follow-up session with the current avatar and automatically prepared memory", async () => {
    const response = await POST(createContext() as never);

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: true,
      session: {
        id: "next-session-1",
        status: "active",
        isTrial: false,
        remainingSeconds: 900,
      },
    });
    expect(prepareOwnedAvatarMemory).toHaveBeenCalledWith(contextData, avatar.modality, { locale: "en" });
    expect(createPendingSession).toHaveBeenCalledWith(contextData, {
      startedAt: "2026-06-07T10:00:00.000Z",
      expiresAt: "2026-06-07T10:15:00.000Z",
      modalityId: "cbt",
      avatarId: "cbt-guide",
      isTrial: false,
      durationBucketSeconds: 900,
      usesApprovedContext: true,
      usesAvatarMemory: true,
      aboutPersonId: null,
    });
    expect(transitionSessionLifecycle).toHaveBeenCalledWith(contextData, {
      sessionId: "next-session-1",
      nextStatus: "active",
      startedAt: "2026-06-07T10:00:00.000Z",
      expiresAt: "2026-06-07T10:15:00.000Z",
      durationBucketSeconds: 900,
    });
  });

  it("lets the opening load the context pinned to the new session", async () => {
    await POST(createContext() as never);

    expect(createSessionOpeningMessage).toHaveBeenCalledWith(contextData, activeSession, { locale: "en" });
  });

  it("includes the avatar's opening message in the success response", async () => {
    createSessionOpeningMessage.mockResolvedValue({
      ok: true,
      message: {
        id: "message-opening-next",
        role: "assistant",
        sequenceIndex: 0,
        content: "Dobrze Cię znowu widzieć.",
        createdAt: "2026-06-07T10:00:01.000Z",
      },
    });

    const response = await POST(createContext() as never);

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: true,
      openingMessage: {
        role: "assistant",
        content: "Dobrze Cię znowu widzieć.",
      },
    });
  });

  it("degrades to a session without an opening when generation fails", async () => {
    createSessionOpeningMessage.mockResolvedValue({ ok: false, failure: "opening_persistence_failed" });

    const response = await POST(createContext() as never);

    expect(response.status).toBe(201);
    const body = await readJson(response);
    expect(body).toMatchObject({ ok: true });
    expect(body).not.toHaveProperty("openingMessage");
  });

  it("rejects blocked accounts before reading avatar or summaries", async () => {
    requireActiveAccountAccess.mockResolvedValue({
      ok: false,
      error: {
        code: "account_blocked",
      },
    });

    const response = await POST(createContext() as never);

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      code: "account_blocked",
      redirectTo: "/account/blocked",
    });
    expect(readCurrentAvatarChoice).not.toHaveBeenCalled();
    expect(prepareOwnedAvatarMemory).not.toHaveBeenCalled();
  });

  it("counts follow-ups against the free-plan allowance and refuses with 403 when it is used up", async () => {
    readSessionQuota.mockResolvedValue(
      ok({
        plan: "free",
        sessionLimit: 3,
        usedSessions: 3,
        remainingSessions: 0,
        canStartSession: false,
      }),
    );

    const response = await POST(createContext() as never);

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      code: "session_limit_reached",
      redirectTo: "/dashboard?start=limit_reached",
    });
    expect(prepareOwnedAvatarMemory).not.toHaveBeenCalled();
    expect(createPendingSession).not.toHaveBeenCalled();
    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "blocked", status: 403, reasonCode: "session_limit_reached" }),
      expect.anything(),
    );
  });

  it("maps a race-time database limit rejection on insert to the same 403", async () => {
    createPendingSession.mockResolvedValue(sessionDataError("session_limit_reached"));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      code: "session_limit_reached",
    });
    expect(transitionSessionLifecycle).not.toHaveBeenCalled();
  });

  it("maps a quota read failure to a stable unavailable response", async () => {
    readSessionQuota.mockResolvedValue(sessionDataError("read_failed"));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(503);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      code: "session_quota_unavailable",
    });
    expect(createPendingSession).not.toHaveBeenCalled();
  });

  it("starts follow-ups for premium accounts regardless of how many sessions they own", async () => {
    readSessionQuota.mockResolvedValue(
      ok({
        plan: "premium",
        sessionLimit: null,
        usedSessions: 25,
        remainingSessions: null,
        canStartSession: true,
      }),
    );

    const response = await POST(createContext() as never);

    expect(response.status).toBe(201);
    expect(createPendingSession).toHaveBeenCalledOnce();
  });

  it("gives premium follow-ups the 60-minute budget", async () => {
    readSessionQuota.mockResolvedValue(
      ok({
        plan: "premium",
        sessionLimit: null,
        usedSessions: 25,
        remainingSessions: null,
        canStartSession: true,
      }),
    );

    const response = await POST(createContext() as never);

    expect(response.status).toBe(201);
    expect(createPendingSession).toHaveBeenCalledWith(
      contextData,
      expect.objectContaining({
        startedAt: "2026-06-07T10:00:00.000Z",
        expiresAt: "2026-06-07T11:00:00.000Z",
        durationBucketSeconds: 3600,
      }),
    );
    expect(transitionSessionLifecycle).toHaveBeenCalledWith(
      contextData,
      expect.objectContaining({
        expiresAt: "2026-06-07T11:00:00.000Z",
        durationBucketSeconds: 3600,
      }),
    );
  });

  it("does not create trial claims or reset trial state", async () => {
    await POST(createContext() as never);

    expect(createPendingSession).toHaveBeenCalledOnce();
    expect(JSON.stringify(createPendingSession.mock.calls)).not.toContain("session_trial_claims");
    expect(JSON.stringify(transitionSessionLifecycle.mock.calls)).not.toContain("trialClaim");
  });

  it("prepares memory before starting the timer or consuming a session", async () => {
    prepareOwnedAvatarMemory.mockResolvedValue({ ok: true, ready: false });
    const response = await POST(createContext() as never);
    expect(response.status).toBe(202);
    expect(await readJson(response)).toEqual({ ok: true, type: "avatar_memory_preparing" });
    expect(createPendingSession).not.toHaveBeenCalled();
    expect(transitionSessionLifecycle).not.toHaveBeenCalled();
    expect(createSessionOpeningMessage).not.toHaveBeenCalled();
  });

  it("uses automatic avatar memory even when an old client submits the obsolete context-free flag", async () => {
    const response = await POST(createContext({ startWithoutContext: true }) as never);
    expect(response.status).toBe(201);
    expect(createPendingSession).toHaveBeenCalledWith(
      contextData,
      expect.objectContaining({ usesApprovedContext: true, usesAvatarMemory: true }),
    );
  });

  it("rejects missing avatar before creating a session", async () => {
    readCurrentAvatarChoice.mockResolvedValue({
      ok: false,
      error: {
        code: "missing_avatar",
      },
    });

    const response = await POST(createContext() as never);

    expect(response.status).toBe(409);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      code: "missing_avatar",
    });
    expect(createPendingSession).not.toHaveBeenCalled();
  });

  it("maps automatic memory failures to a stable unavailable response", async () => {
    prepareOwnedAvatarMemory.mockResolvedValue({ ok: false });

    const response = await POST(createContext() as never);

    expect(response.status).toBe(503);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      code: "summary_context_unavailable",
    });
    expect(createPendingSession).not.toHaveBeenCalled();
  });
});
