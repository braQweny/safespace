import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { SessionDataContext, SessionMessageRecord, SessionMetadata } from "@/lib/session-data/types";
import type { LiveSessionConfig } from "@/lib/openai/live";

const requireSessionRouteAccess = vi.fn();
const getOwnedSessionMetadata = vi.fn();
const listRecentOwnedSessionMessages = vi.fn();
const markVoiceSessionConnected = vi.fn();
const transitionSessionLifecycle = vi.fn();
const appendVoiceSessionUtterances = vi.fn();
const loadOwnedSessionContinuity = vi.fn();
const isVoiceStartAvailable = vi.fn(() => true);
const getVoiceObserver = vi.fn();
const createLiveSession = vi.fn();
const hangupLiveSession = vi.fn();
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
  listRecentOwnedSessionMessages,
  markVoiceSessionConnected,
  transitionSessionLifecycle,
  appendVoiceSessionUtterances,
}));
vi.mock("@/lib/session-flow/session-continuity", () => ({ loadOwnedSessionContinuity }));
vi.mock("@/lib/session-flow/voice-start", () => ({ isVoiceStartAvailable }));
vi.mock("@/lib/voice/coordinator", () => ({ getVoiceObserver }));
vi.mock("@/lib/openai/live", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/openai/live")>()),
  createLiveSession,
  hangupLiveSession,
}));
vi.mock("@/lib/ai-provider/env", () => ({
  getAiProviderName: () => "openai",
  getAiProviderEnv: () => ({ provider: "openai", apiKey: "sk-test-key", sessionModel: "openai/gpt-5.6-luna" }),
}));
vi.mock("@/lib/operational-visibility/request-context", () => ({
  buildOperationalRequestContext,
  getOperationalDurationMs: () => 12,
}));
vi.mock("@/lib/operational-visibility/logger", () => ({ logOperationalEvent }));

const { OpenAiLiveError } = await import("@/lib/openai/live");
const { POST } = await import("@/pages/api/session/voice/connect");

const contextData = { user: { id: "user-1" } } as SessionDataContext;
interface TransitionInput {
  nextStatus: SessionMetadata["status"];
  endedAt?: string | null;
}
const SESSION_ID = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const OFFER = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";
const LIVE_SESSION_ID = "live_u2_secret";

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
  voiceConnectedAt: null,
  createdAt: "2026-09-12T10:00:00.000Z",
  updatedAt: "2026-09-12T10:00:00.000Z",
};

const storedMessages: SessionMessageRecord[] = [
  {
    id: "m1",
    sessionId: SESSION_ID,
    userId: "user-1",
    role: "assistant",
    sequenceIndex: 0,
    content: "Cześć, jestem Marek.",
    createdAt: "2026-09-12T10:00:10.000Z",
  },
  {
    id: "m2",
    sessionId: SESSION_ID,
    userId: "user-1",
    role: "user",
    sequenceIndex: 1,
    content: "Ostatnio ciężko mi wstać.",
    createdAt: "2026-09-12T10:00:20.000Z",
  },
];

function createStub() {
  const snapshot = {
    epoch: 7,
    live: true,
    closeReason: null,
    deadlineAtMs: null,
    armedAtMs: null,
    observing: true,
    pendingUtterances: 0,
  };
  return {
    arm: vi.fn(() => Promise.resolve({ epoch: 7, deadlineAtMs: null, observing: true })),
    beat: vi.fn(() => Promise.resolve(snapshot)),
    drain: vi.fn(() => Promise.resolve({ ...snapshot, utterances: [] })),
    ack: vi.fn(() => Promise.resolve()),
    hangupNow: vi.fn(() => Promise.resolve({ ...snapshot, live: false })),
    purge: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => Promise.resolve(snapshot)),
    alarm: vi.fn(() => Promise.resolve()),
  };
}

function createContext(body: unknown = { sessionId: SESSION_ID, sdp: OFFER }, locale = "pl") {
  return {
    request: new Request("https://safespace.local/api/session/voice/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    }),
    cookies: {},
    locals: { user: { id: "user-1" }, requestId: "req-1", locale },
    url: new URL("https://safespace.local/api/session/voice/connect"),
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function lastLiveConfig(): LiveSessionConfig {
  const call = createLiveSession.mock.calls.at(-1)?.[0] as { session: LiveSessionConfig } | undefined;
  if (!call) throw new Error("createLiveSession was not called");
  return call.session;
}

describe("POST /api/session/voice/connect", () => {
  let stub: ReturnType<typeof createStub>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T10:01:00.000Z"));
    vi.clearAllMocks();
    stub = createStub();
    buildOperationalRequestContext.mockResolvedValue({
      requestId: "req-1",
      route: "/api/session/voice/connect",
      method: "POST",
      userHash: "hash-1",
    });
    requireSessionRouteAccess.mockResolvedValue({ ok: true, data: contextData });
    getOwnedSessionMetadata.mockResolvedValue(ok(voiceSession));
    listRecentOwnedSessionMessages.mockResolvedValue(ok([]));
    loadOwnedSessionContinuity.mockResolvedValue({ ok: true, data: [], avatarMemory: "Pamięć z poprzednich rozmów." });
    markVoiceSessionConnected.mockResolvedValue(ok(true));
    transitionSessionLifecycle.mockImplementation((_context: SessionDataContext, input: TransitionInput) =>
      Promise.resolve(ok({ ...voiceSession, status: input.nextStatus, endedAt: input.endedAt ?? null })),
    );
    appendVoiceSessionUtterances.mockResolvedValue(ok({ inserted: 0, skipped: 0, messages: [] }));
    isVoiceStartAvailable.mockReturnValue(true);
    getVoiceObserver.mockReturnValue(stub);
    createLiveSession.mockResolvedValue({ liveSessionId: LIVE_SESSION_ID, answerSdp: "v=0\r\na=answer" });
    hangupLiveSession.mockResolvedValue("closed");
  });

  it("creates the live session with the avatar's prompts, marks the first connection and arms the observer", async () => {
    const response = await POST(createContext() as never);
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      type: "voice_connected",
      sdp: "v=0\r\na=answer",
      expiresAt: "2026-09-12T10:10:00.000Z",
      serverNow: "2026-09-12T10:01:00.000Z",
      epoch: 7,
      reconnected: false,
      session: { id: SESSION_ID, status: "active", mode: "voice", remainingSeconds: 540 },
    });
    expect(JSON.stringify(body)).not.toContain(LIVE_SESSION_ID);

    const createCall = createLiveSession.mock.calls[0][0] as { apiKey: string; sdp: string };
    expect(createCall.apiKey).toBe("sk-test-key");
    expect(createCall.sdp).toBe(OFFER.trimEnd());
    const config = lastLiveConfig();
    expect(config).toMatchObject({
      model: "gpt-live-1",
      store: false,
      audio: { output: { voice: "cedar" } },
      delegation: { type: "responses", responses: { model: "gpt-5.6-luna", reasoning: { effort: "low" } } },
    });
    expect(config.instructions.startsWith("Jesteś Markiem")).toBe(true);
    expect(config.instructions).toContain("Zacznij od jednego krótkiego powitania");
    expect(config.delegation.responses.instructions).toContain("## How to open the session");
    expect(config.delegation.responses.instructions).toContain("Pamięć z poprzednich rozmów.");
    expect(config.delegation.responses.instructions).not.toContain("<<<recap>>>");

    expect(markVoiceSessionConnected).toHaveBeenCalledWith(contextData, SESSION_ID, "2026-09-12T10:01:00.000Z");
    expect(stub.arm).toHaveBeenCalledWith({
      liveSessionId: LIVE_SESSION_ID,
      startedAtMs: Date.parse("2026-09-12T10:00:00.000Z"),
      expiresAtMs: Date.parse("2026-09-12T10:10:00.000Z"),
      locale: "pl",
      avatarName: "Marek",
    });
    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "session.voice_connected",
        outcome: "success",
        provider: "openai",
        status: 200,
      }),
      expect.objectContaining({ route: "/api/session/voice/connect" }),
    );
    const logged = JSON.stringify(logOperationalEvent.mock.calls);
    expect(logged).not.toContain(LIVE_SESSION_ID);
    expect(logged).not.toContain("v=0");
  });

  it("treats a session that already connected as a reconnect: recap instead of a greeting, no new connection mark", async () => {
    getOwnedSessionMetadata.mockResolvedValue(ok({ ...voiceSession, voiceConnectedAt: "2026-09-12T10:00:05.000Z" }));
    listRecentOwnedSessionMessages.mockResolvedValue(ok(storedMessages));

    const response = await POST(createContext(undefined, "en") as never);

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({ reconnected: true });
    expect(markVoiceSessionConnected).not.toHaveBeenCalled();
    const config = lastLiveConfig();
    expect(config.instructions.startsWith("You are Marek")).toBe(true);
    expect(config.instructions).toContain("the connection was just restored");
    expect(config.delegation.responses.instructions).toContain("<<<recap>>>");
    expect(config.delegation.responses.instructions).toContain("Marek: Cześć, jestem Marek.");
    expect(config.delegation.responses.instructions).toContain("User: Ostatnio ciężko mi wstać.");
    expect(config.delegation.responses.instructions).not.toContain("## How to open the session");
    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "session.voice_connected", outcome: "success", reasonCode: "reconnected" }),
      expect.anything(),
    );
  });

  it("rejects missing auth, a malformed offer and an unknown session before touching the provider", async () => {
    requireSessionRouteAccess.mockResolvedValueOnce({
      ok: false,
      error: { code: "missing_auth", status: 401, source: "session_context" },
    });
    expect((await POST(createContext() as never)).status).toBe(401);

    const invalid = await POST(createContext({ sessionId: SESSION_ID, sdp: "nope" }) as never);
    expect(invalid.status).toBe(400);
    await expect(readJson(invalid)).resolves.toEqual({
      ok: false,
      type: "validation_failed",
      code: "validation_failed",
    });

    getOwnedSessionMetadata.mockResolvedValueOnce(sessionDataError("session_not_found"));
    const missing = await POST(createContext() as never);
    expect(missing.status).toBe(404);
    await expect(readJson(missing)).resolves.toMatchObject({ code: "session_not_found" });
    expect(createLiveSession).not.toHaveBeenCalled();
  });

  it("refuses a text session, an ended session and expires a stale one", async () => {
    getOwnedSessionMetadata.mockResolvedValueOnce(ok({ ...voiceSession, mode: "text" }));
    const text = await POST(createContext() as never);
    expect(text.status).toBe(409);
    await expect(readJson(text)).resolves.toMatchObject({ code: "session_mode_mismatch" });

    getOwnedSessionMetadata.mockResolvedValueOnce(ok({ ...voiceSession, status: "completed" }));
    const ended = await POST(createContext() as never);
    expect(ended.status).toBe(409);
    await expect(readJson(ended)).resolves.toMatchObject({ code: "session_not_active" });

    vi.setSystemTime(new Date("2026-09-12T10:12:00.000Z"));
    const expired = await POST(createContext() as never);
    expect(expired.status).toBe(409);
    await expect(readJson(expired)).resolves.toMatchObject({
      ok: false,
      type: "expired",
      code: "session_expired",
      session: { status: "expired" },
    });
    expect(transitionSessionLifecycle).toHaveBeenCalledWith(
      contextData,
      expect.objectContaining({ nextStatus: "expired", sessionId: SESSION_ID }),
    );
    expect(stub.hangupNow).toHaveBeenCalledWith("time_limit_reached");
    expect(createLiveSession).not.toHaveBeenCalled();
  });

  it("blocks with voice_unavailable while the feature is off and never creates a provider session", async () => {
    isVoiceStartAvailable.mockReturnValue(false);

    const response = await POST(createContext() as never);

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toMatchObject({ code: "voice_unavailable" });
    expect(createLiveSession).not.toHaveBeenCalled();
    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "session.voice_connected",
        outcome: "blocked",
        reasonCode: "voice_unavailable",
      }),
      expect.anything(),
    );
  });

  it("refuses to create a paid session when there is no observer binding", async () => {
    getVoiceObserver.mockReturnValue(null);

    const response = await POST(createContext() as never);

    expect(response.status).toBe(503);
    await expect(readJson(response)).resolves.toMatchObject({ code: "voice_observer_unavailable" });
    expect(createLiveSession).not.toHaveBeenCalled();
    expect(markVoiceSessionConnected).not.toHaveBeenCalled();
  });

  it("maps a provider failure to 503 with its closed category and nothing else", async () => {
    createLiveSession.mockRejectedValueOnce(new OpenAiLiveError("provider_rate_limited"));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(503);
    await expect(readJson(response)).resolves.toEqual({
      ok: false,
      type: "voice_error",
      code: "voice_provider_unavailable",
      category: "provider_rate_limited",
    });
    expect(stub.arm).not.toHaveBeenCalled();
    expect(markVoiceSessionConnected).not.toHaveBeenCalled();
    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "session.voice_connected",
        outcome: "failure",
        reasonCode: "provider_rate_limited",
      }),
      expect.anything(),
    );
  });

  it("hangs the live session up when the observer cannot be armed or the connection cannot be marked", async () => {
    stub.arm.mockRejectedValueOnce(new Error("durable object unreachable"));

    const armFailed = await POST(createContext() as never);

    expect(armFailed.status).toBe(503);
    await expect(readJson(armFailed)).resolves.toMatchObject({ code: "voice_observer_unavailable" });
    expect(hangupLiveSession).toHaveBeenCalledWith({ apiKey: "sk-test-key", liveSessionId: LIVE_SESSION_ID });

    hangupLiveSession.mockClear();
    markVoiceSessionConnected.mockResolvedValueOnce(sessionDataError("write_failed"));

    const markFailed = await POST(createContext() as never);

    expect(markFailed.status).toBe(503);
    await expect(readJson(markFailed)).resolves.toMatchObject({ code: "voice_connect_failed" });
    expect(hangupLiveSession).toHaveBeenCalledTimes(1);
    expect(stub.arm).toHaveBeenCalledTimes(1);
  });

  it("does not create a provider session when the continuity or recap read fails", async () => {
    loadOwnedSessionContinuity.mockResolvedValueOnce({ ok: false, error: { code: "read_failed" } });

    const response = await POST(createContext() as never);

    expect(response.status).toBe(503);
    await expect(readJson(response)).resolves.toMatchObject({ code: "voice_connect_failed" });
    expect(createLiveSession).not.toHaveBeenCalled();
  });
});
