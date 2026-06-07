import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { CurrentAvatarChoice } from "@/lib/session-flow/avatar-choice";
import type { ApprovedSessionSummaryContext, SessionDataContext, SessionMetadata } from "@/lib/session-data/types";

const getSessionDataContext = vi.fn();
const readCurrentAvatarChoice = vi.fn();
const createPendingSession = vi.fn();
const listNewestApprovedSessionSummaryContexts = vi.fn();
const transitionSessionLifecycle = vi.fn();
const buildOperationalRequestContext = vi.fn();
const logOperationalEvent = vi.fn();

vi.mock("@/lib/session-data/auth", () => ({
  getSessionDataContext,
}));

vi.mock("@/lib/session-flow/avatar-choice", () => ({
  readCurrentAvatarChoice,
}));

vi.mock("@/lib/session-data/repository", () => ({
  createPendingSession,
  createSessionTrialClaim: vi.fn(),
  getOwnedSessionMetadata: vi.fn(),
  getTrialAvailability: vi.fn(),
  listNewestApprovedSessionSummaryContexts,
  listOwnedSessionMessages: vi.fn(),
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

const { POST } = await import("@/pages/api/session/start-next");

const contextData = {
  user: {
    id: "user-1",
  },
} as SessionDataContext;

const avatar = {
  modality: {
    modalityId: "cbt",
    avatarId: "cbt-guide",
    modalityName: "Podejscie poznawczo-behawioralne",
    avatarName: "Marek, praktyczny przewodnik",
    explanation: "Pomaga zauwazac powiazania miedzy myslami, emocjami, reakcjami ciala i dzialaniami.",
    focus: "Porzadkuje sytuacje krok po kroku.",
    sessionStyleHint: "Uzywa jasnej struktury.",
    assetPath: "/avatars/cbt-guide.png",
    altText: "Awatar Marka",
  },
  selected: {
    modalityId: "cbt",
    avatarId: "cbt-guide",
    modalityName: "Podejscie poznawczo-behawioralne",
    avatarName: "Marek, praktyczny przewodnik",
    assetPath: "/avatars/cbt-guide.png",
    altText: "Awatar Marka",
  },
} satisfies CurrentAvatarChoice;

const approvedSummaries: ApprovedSessionSummaryContext[] = [
  {
    id: "summary-1",
    sessionId: "old-session-1",
    summaryText: "Zatwierdzone podsumowanie do kolejnej rozmowy.",
    revision: 1,
    createdAt: "2026-06-07T09:00:00.000Z",
    updatedAt: "2026-06-07T09:00:00.000Z",
  },
];

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
    readCurrentAvatarChoice.mockResolvedValue(ok(avatar));
    listNewestApprovedSessionSummaryContexts.mockResolvedValue(ok(approvedSummaries));
    createPendingSession.mockResolvedValue(ok(createdSession));
    transitionSessionLifecycle.mockResolvedValue(ok(activeSession));
  });

  it("starts a non-trial follow-up session with the current avatar and approved context", async () => {
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
    expect(listNewestApprovedSessionSummaryContexts).toHaveBeenCalledWith(contextData);
    expect(createPendingSession).toHaveBeenCalledWith(contextData, {
      startedAt: "2026-06-07T10:00:00.000Z",
      expiresAt: "2026-06-07T10:15:00.000Z",
      modalityId: "cbt",
      avatarId: "cbt-guide",
      isTrial: false,
      durationBucketSeconds: 900,
    });
    expect(transitionSessionLifecycle).toHaveBeenCalledWith(contextData, {
      sessionId: "next-session-1",
      nextStatus: "active",
      startedAt: "2026-06-07T10:00:00.000Z",
      expiresAt: "2026-06-07T10:15:00.000Z",
      durationBucketSeconds: 900,
    });
  });

  it("does not create trial claims or reset trial state", async () => {
    await POST(createContext() as never);

    expect(createPendingSession).toHaveBeenCalledOnce();
    expect(JSON.stringify(createPendingSession.mock.calls)).not.toContain("session_trial_claims");
    expect(JSON.stringify(transitionSessionLifecycle.mock.calls)).not.toContain("trialClaim");
  });

  it("requires an explicit no-context flag when no approved summaries exist", async () => {
    listNewestApprovedSessionSummaryContexts.mockResolvedValue(ok([]));

    const blocked = await POST(createContext() as never);

    expect(blocked.status).toBe(409);
    await expect(readJson(blocked)).resolves.toMatchObject({
      ok: false,
      code: "no_context_not_confirmed",
    });
    expect(createPendingSession).not.toHaveBeenCalled();

    const allowed = await POST(createContext({ startWithoutContext: true }) as never);

    expect(allowed.status).toBe(201);
    expect(createPendingSession).toHaveBeenCalledOnce();
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

  it("maps approved context read failures to a stable unavailable response", async () => {
    listNewestApprovedSessionSummaryContexts.mockResolvedValue(sessionDataError("read_failed"));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(503);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      code: "summary_context_unavailable",
    });
    expect(createPendingSession).not.toHaveBeenCalled();
  });
});
