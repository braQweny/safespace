import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { SessionDataContext, SessionMessageRecord, SessionMetadata } from "@/lib/session-data/types";
import type { VoiceCloseReason } from "@/lib/voice/observer-state";

const requireSessionRouteAccess = vi.fn();
const getOwnedSessionMetadata = vi.fn();
const transitionSessionLifecycle = vi.fn();
const appendVoiceSessionUtterances = vi.fn();
const isVoiceStartAvailable = vi.fn(() => true);
const getVoiceObserver = vi.fn();
const buildOperationalRequestContext = vi.fn();
const logOperationalEvent = vi.fn();

vi.mock("@/lib/session-flow/route-access", () => ({ requireSessionRouteAccess }));
vi.mock("@/lib/session-data/repository", () => ({
  claimFreeTrialSessionAtomic: vi.fn(),
  countOwnedSessions: vi.fn(),
  getOwnedAccountPlan: vi.fn(),
  getTrialAvailability: vi.fn(),
  listNewestApprovedSessionSummaryContexts: vi.fn(),
  listOwnedActiveSessionMetadata: vi.fn(),
  listOwnedSessionMessages: vi.fn(),
  getOwnedSessionMetadata,
  transitionSessionLifecycle,
  appendVoiceSessionUtterances,
}));
vi.mock("@/lib/session-flow/voice-start", () => ({ isVoiceStartAvailable }));
vi.mock("@/lib/voice/coordinator", () => ({ getVoiceObserver }));
vi.mock("@/lib/operational-visibility/request-context", () => ({
  buildOperationalRequestContext,
  getOperationalDurationMs: () => 12,
}));
vi.mock("@/lib/operational-visibility/logger", () => ({ logOperationalEvent }));

const { POST } = await import("@/pages/api/session/voice/heartbeat");

const contextData = { user: { id: "user-1" } } as SessionDataContext;
interface TransitionInput {
  nextStatus: SessionMetadata["status"];
  endedAt?: string | null;
}
const SESSION_ID = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";

const voiceSession: SessionMetadata = {
  id: SESSION_ID,
  userId: "user-1",
  modalityId: "cbt",
  avatarId: "cbt-guide",
  status: "active",
  startedAt: "2026-09-12T10:00:00.000Z",
  endedAt: null,
  expiresAt: "2026-09-12T10:10:00.000Z",
  deletedAt: null,
  deletionReasonCode: null,
  isTrial: false,
  trialClaimId: null,
  durationBucketSeconds: 600,
  usesApprovedContext: true,
  usesAvatarMemory: true,
  mode: "voice",
  voiceConnectedAt: "2026-09-12T10:00:05.000Z",
  createdAt: "2026-09-12T10:00:00.000Z",
  updatedAt: "2026-09-12T10:00:00.000Z",
};

const pending = [
  { ordinal: 3, utteranceId: "u3", role: "user" as const, content: "Nie wiem, od czego zacząć." },
  { ordinal: 4, utteranceId: "u4", role: "assistant" as const, content: "Możemy zacząć od dziś." },
];

function storedRows(): SessionMessageRecord[] {
  return pending.map((utterance) => ({
    id: `row-${utterance.utteranceId}`,
    sessionId: SESSION_ID,
    userId: "user-1",
    role: utterance.role,
    sequenceIndex: utterance.ordinal,
    content: utterance.content,
    createdAt: "2026-09-12T10:03:00.000Z",
  }));
}

function createStub(closeReason: VoiceCloseReason | null = null, epoch = 2) {
  const snapshot = {
    epoch,
    live: closeReason === null,
    closeReason,
    deadlineAtMs: Date.parse("2026-09-12T10:09:45.000Z"),
    armedAtMs: Date.parse("2026-09-12T10:00:05.000Z"),
    observing: closeReason === null,
    pendingUtterances: 0,
  };
  let drained = false;
  return {
    arm: vi.fn(),
    beat: vi.fn(() => Promise.resolve(snapshot)),
    drain: vi.fn(() => {
      const utterances = drained ? [] : pending;
      drained = true;
      return Promise.resolve({ ...snapshot, utterances });
    }),
    ack: vi.fn(() => Promise.resolve()),
    hangupNow: vi.fn((reason: VoiceCloseReason) => Promise.resolve({ ...snapshot, live: false, closeReason: reason })),
    purge: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => Promise.resolve(snapshot)),
    alarm: vi.fn(() => Promise.resolve()),
  };
}

function createContext(body: unknown = { sessionId: SESSION_ID, epoch: 2 }) {
  return {
    request: new Request("https://safespace.local/api/session/voice/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    }),
    cookies: {},
    locals: { user: { id: "user-1" }, requestId: "req-1", locale: "pl" },
    url: new URL("https://safespace.local/api/session/voice/heartbeat"),
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("POST /api/session/voice/heartbeat", () => {
  let stub: ReturnType<typeof createStub>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T10:03:00.000Z"));
    vi.clearAllMocks();
    stub = createStub();
    buildOperationalRequestContext.mockResolvedValue({
      requestId: "req-1",
      route: "/api/session/voice/heartbeat",
      method: "POST",
      userHash: "hash-1",
    });
    requireSessionRouteAccess.mockResolvedValue({ ok: true, data: contextData });
    getOwnedSessionMetadata.mockResolvedValue(ok(voiceSession));
    transitionSessionLifecycle.mockImplementation((_context: SessionDataContext, input: TransitionInput) =>
      Promise.resolve(ok({ ...voiceSession, status: input.nextStatus, endedAt: input.endedAt ?? null })),
    );
    appendVoiceSessionUtterances.mockImplementation((_context, _sessionId, utterances: unknown[]) =>
      Promise.resolve(ok({ inserted: utterances.length, skipped: 0, messages: storedRows() })),
    );
    isVoiceStartAvailable.mockReturnValue(true);
    getVoiceObserver.mockReturnValue(stub);
  });

  it("beats, drains the buffer through the RPC before acknowledging and returns the stored rows", async () => {
    const response = await POST(createContext() as never);
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(stub.beat).toHaveBeenCalledTimes(1);
    expect(appendVoiceSessionUtterances).toHaveBeenCalledWith(contextData, SESSION_ID, [
      { utteranceId: "u3", role: "user", content: "Nie wiem, od czego zacząć." },
      { utteranceId: "u4", role: "assistant", content: "Możemy zacząć od dziś." },
    ]);
    expect(stub.ack).toHaveBeenCalledWith([3, 4]);
    expect(body).toMatchObject({
      ok: true,
      type: "voice_heartbeat",
      live: true,
      closeReason: null,
      epoch: 2,
      remainingSeconds: 420,
      serverNow: "2026-09-12T10:03:00.000Z",
      session: { id: SESSION_ID, status: "active", mode: "voice" },
      messages: [
        { id: "row-u3", role: "user", sequenceIndex: 3, content: "Nie wiem, od czego zacząć." },
        { id: "row-u4", role: "assistant", sequenceIndex: 4, content: "Możemy zacząć od dziś." },
      ],
    });
    expect(body).not.toHaveProperty("notice");
    expect(transitionSessionLifecycle).not.toHaveBeenCalled();
    expect(logOperationalEvent).not.toHaveBeenCalled();
  });

  it("keeps the buffer (no ack) when the write fails and still answers with the state", async () => {
    appendVoiceSessionUtterances.mockResolvedValueOnce(sessionDataError("write_failed"));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(200);
    expect(stub.ack).not.toHaveBeenCalled();
    await expect(readJson(response)).resolves.toMatchObject({ ok: true, live: true, messages: [] });
  });

  it("marks the row interrupted after a crisis close and hands the client the crisis notice", async () => {
    getVoiceObserver.mockReturnValue(createStub("interrupted"));

    const response = await POST(createContext() as never);
    const body = await readJson(response);

    expect(transitionSessionLifecycle).toHaveBeenCalledWith(contextData, {
      sessionId: SESSION_ID,
      nextStatus: "interrupted",
      endedAt: "2026-09-12T10:03:00.000Z",
      durationBucketSeconds: 600,
    });
    expect(body).toMatchObject({
      live: false,
      closeReason: "interrupted",
      session: { status: "interrupted" },
      notice: { variant: "hard_stop" },
    });
    const notice = body.notice as { copy: { title: string }; crisisResources: unknown[] };
    expect(notice.copy.title).toContain("symulacji");
    expect(notice.crisisResources).toHaveLength(3);
  });

  it("asks the client to reconnect after the classifier gave up, without ending the row", async () => {
    getVoiceObserver.mockReturnValue(createStub("safety_unavailable"));

    const body = await readJson(await POST(createContext() as never));

    expect(transitionSessionLifecycle).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      live: false,
      closeReason: "safety_unavailable",
      session: { status: "active" },
      notice: { variant: "retry" },
    });
    const notice = body.notice as { copy: { title: unknown } };
    expect(typeof notice.copy.title).toBe("string");
  });

  it("expires a stale session: hangup, drain, row expired and the time-limit event", async () => {
    vi.setSystemTime(new Date("2026-09-12T10:11:00.000Z"));

    const body = await readJson(await POST(createContext() as never));

    expect(stub.hangupNow).toHaveBeenCalledWith("time_limit_reached");
    expect(stub.beat).not.toHaveBeenCalled();
    expect(stub.ack).toHaveBeenCalledWith([3, 4]);
    expect(transitionSessionLifecycle).toHaveBeenCalledWith(
      contextData,
      expect.objectContaining({ nextStatus: "expired", endedAt: "2026-09-12T10:11:00.000Z" }),
    );
    expect(body).toMatchObject({
      live: false,
      closeReason: "time_limit_reached",
      remainingSeconds: 0,
      session: { status: "expired" },
    });
    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "session.time_limit_reached", reasonCode: "time_limit_reached" }),
      expect.anything(),
    );
  });

  it("disconnects a conversation in progress when the feature is switched off, completing the row", async () => {
    isVoiceStartAvailable.mockReturnValue(false);

    const body = await readJson(await POST(createContext() as never));

    expect(stub.hangupNow).toHaveBeenCalledWith("voice_disabled");
    expect(transitionSessionLifecycle).toHaveBeenCalledWith(
      contextData,
      expect.objectContaining({ nextStatus: "completed" }),
    );
    expect(body).toMatchObject({ live: false, closeReason: "voice_disabled", session: { status: "completed" } });
    expect(body).not.toHaveProperty("notice");
  });

  it("only drains an already ended session, never beating or transitioning it again", async () => {
    getOwnedSessionMetadata.mockResolvedValue(
      ok({ ...voiceSession, status: "completed", endedAt: "2026-09-12T10:02:50.000Z" }),
    );

    const response = await POST(createContext() as never);
    const body = await readJson(response);

    expect(stub.beat).not.toHaveBeenCalled();
    expect(stub.hangupNow).not.toHaveBeenCalled();
    expect(stub.ack).toHaveBeenCalledWith([3, 4]);
    expect(transitionSessionLifecycle).not.toHaveBeenCalled();
    expect(body).toMatchObject({ live: false, session: { status: "completed" }, messages: [{ id: "row-u3" }, {}] });
  });

  it("tells a superseded client its connection was replaced", async () => {
    getVoiceObserver.mockReturnValue(createStub(null, 5));

    const response = await POST(createContext({ sessionId: SESSION_ID, epoch: 4 }) as never);
    const body = await readJson(response);

    expect(body).toMatchObject({ live: false, closeReason: "reconnected", epoch: 5 });
  });

  it("rejects bad input, other modes and a missing observer, and reports an unreachable one as 503", async () => {
    requireSessionRouteAccess.mockResolvedValueOnce({
      ok: false,
      error: { code: "account_blocked", status: 403, source: "account_access" },
    });
    expect((await POST(createContext() as never)).status).toBe(403);

    const invalid = await POST(createContext({ sessionId: SESSION_ID, epoch: -1 }) as never);
    expect(invalid.status).toBe(400);

    getOwnedSessionMetadata.mockResolvedValueOnce(sessionDataError("session_not_found"));
    expect((await POST(createContext() as never)).status).toBe(404);

    getOwnedSessionMetadata.mockResolvedValueOnce(ok({ ...voiceSession, mode: "text" }));
    const text = await POST(createContext() as never);
    expect(text.status).toBe(409);
    await expect(readJson(text)).resolves.toMatchObject({ code: "session_mode_mismatch" });

    getVoiceObserver.mockReturnValueOnce(null);
    const missing = await POST(createContext() as never);
    expect(missing.status).toBe(503);
    await expect(readJson(missing)).resolves.toMatchObject({ code: "voice_observer_unavailable" });

    stub.beat.mockRejectedValueOnce(new Error("durable object unreachable"));
    const unreachable = await POST(createContext() as never);
    expect(unreachable.status).toBe(503);
    await expect(readJson(unreachable)).resolves.toMatchObject({ code: "voice_observer_unavailable" });
  });
});
