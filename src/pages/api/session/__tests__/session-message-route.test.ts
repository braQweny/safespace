import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionAiError } from "@/lib/session-ai/errors";
import type { GenerateSessionResponseInput } from "@/lib/session-ai/types";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { SessionSafetyDecision } from "@/lib/session-safety/types";
import type { SessionDataContext, SessionMessageRecord, SessionMetadata } from "@/lib/session-data/types";
import type { PersistedMessageTurn } from "@/lib/session-flow/message-persistence";

const getSessionDataContext = vi.fn();
const requireActiveAccountAccess = vi.fn();
const getOwnedSessionMetadata = vi.fn();
const listRecentOwnedSessionMessages = vi.fn();
const listNewestApprovedSessionSummaryContexts = vi.fn();
const getOwnedSessionAvatarMemory = vi.fn();
const getOwnedSessionPinnedContext = vi.fn();
const isPeopleMemoryEnabled = vi.fn(() => true);
const isTopicMapEnabled = vi.fn(() => true);
const isSessionLensEnabled = vi.fn(() => true);
const detectSessionLens = vi.fn();
const setOwnedSessionLens = vi.fn();
const transitionSessionLifecycle = vi.fn();
const evaluateSessionSafety = vi.fn();
const generateSessionResponse = vi.fn();
const persistSuccessfulMessageTurn = vi.fn();
const claimSessionMessageTurn = vi.fn();
const releaseSessionMessageTurn = vi.fn();
const buildOperationalRequestContext = vi.fn();
const logOperationalEvent = vi.fn();
const getOpenRouterSessionConfig = vi.fn();

vi.mock("@/lib/session-data/auth", () => ({
  getSessionDataContext,
}));

vi.mock("@/lib/admin/account-access", () => ({
  requireActiveAccountAccess,
}));

vi.mock("@/lib/session-data/repository", () => ({
  claimSessionMessageTurn,
  releaseSessionMessageTurn,
  completeSessionMessageTurn: vi.fn(),
  getNextSessionMessageSequenceIndex: vi.fn(),
  getOwnedSessionMetadata,
  listOwnedActiveSessionMetadata: vi.fn(),
  listOwnedSessionMessages: vi.fn(),
  listRecentOwnedSessionMessages,
  listNewestApprovedSessionSummaryContexts,
  getOwnedSessionAvatarMemory,
  getOwnedSessionPinnedContext,
  transitionSessionLifecycle,
  setOwnedSessionLens,
  appendSessionMessages: vi.fn(),
}));

// Soczewka: flaga i wykrywanie z atrap — moduł wykrywania sięga do `astro:env/server`.
vi.mock("@/lib/session-flow/session-lens-mode", () => ({
  isSessionLensEnabled,
}));

vi.mock("@/lib/session-lens/detect-session-lens", () => ({
  detectSessionLens,
}));

// `astro:env/server` nie istnieje w vitest; flaga kart osób przychodzi z atrapy.
vi.mock("@/lib/session-flow/topic-map-mode", () => ({
  isTopicMapEnabled,
}));
vi.mock("@/lib/session-flow/people-memory-mode", () => ({
  isPeopleMemoryEnabled,
}));

vi.mock("@/lib/session-data/quota", () => ({
  readTrialAvailability: vi.fn(),
  readSessionQuota: vi.fn(),
}));

vi.mock("@/lib/session-safety/evaluate-session-safety", () => ({
  evaluateSessionSafety,
}));

vi.mock("@/lib/session-ai/provider", () => ({
  generateSessionResponse,
}));

vi.mock("@/lib/session-ai/env", () => ({
  getOpenRouterSessionConfig,
  resolveSessionModel: (modelOverride?: string | null) => modelOverride ?? "openai/gpt-4o-mini",
}));

vi.mock("@/lib/session-flow/message-persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session-flow/message-persistence")>()),
  persistSuccessfulMessageTurn,
}));

vi.mock("@/lib/operational-visibility/request-context", () => ({
  buildOperationalRequestContext,
  getOperationalDurationMs: () => 12,
}));

vi.mock("@/lib/operational-visibility/logger", () => ({
  logOperationalEvent,
}));

const { POST } = await import("@/pages/api/session/message");

const contextData = {
  user: {
    id: "user-1",
  },
} as SessionDataContext;

// Session ids are Postgres uuids; the contract rejects anything else up front.
const SESSION_ID = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";

const activeSession: SessionMetadata = {
  id: SESSION_ID,
  userId: "user-1",
  modalityId: "cbt",
  avatarId: "cbt-guide",
  status: "active",
  startedAt: "2026-06-07T10:00:00.000Z",
  endedAt: null,
  expiresAt: "2026-06-07T10:15:00.000Z",
  deletedAt: null,
  deletionReasonCode: null,
  isTrial: true,
  trialClaimId: "claim-1",
  durationBucketSeconds: 900,
  usesApprovedContext: true,
  createdAt: "2026-06-07T10:00:00.000Z",
  updatedAt: "2026-06-07T10:00:00.000Z",
};

const existingMessage: SessionMessageRecord = {
  id: "message-0",
  sessionId: SESSION_ID,
  userId: "user-1",
  role: "user",
  sequenceIndex: 0,
  content: "Poprzednia spokojna wiadomosc.",
  createdAt: "2026-06-07T10:01:00.000Z",
};

const persistedTurn: PersistedMessageTurn = {
  user: {
    id: "message-1",
    role: "user",
    sequenceIndex: 1,
    content: "Chce uporzadkowac mysli.",
    createdAt: "2026-06-07T10:02:00.000Z",
  },
  assistant: {
    id: "message-2",
    role: "assistant",
    sequenceIndex: 2,
    content: "Mozemy zaczac od nazwania najwazniejszych faktow.",
    createdAt: "2026-06-07T10:02:01.000Z",
  },
};

const allowDecision = {
  risk: "normal",
  action: "allow",
  reasonCode: "none_detected",
  copy: null,
  constraints: [],
  crisisResources: [],
} satisfies SessionSafetyDecision;

const cautionDecision = {
  risk: "caution",
  action: "allow_with_constraints",
  reasonCode: "ambiguous_distress",
  copy: null,
  constraints: [
    {
      id: "avoid_diagnosis",
      instruction: "Do not diagnose the user.",
    },
  ],
  crisisResources: [],
} satisfies SessionSafetyDecision;

const crisisDecision = {
  risk: "crisis",
  action: "hard_stop",
  reasonCode: "self_harm_signal",
  copy: {
    title: "Nie mozemy kontynuowac zwyklej symulacji",
    body: "Ta wiadomosc moze dotyczyc pilnego zagrozenia.",
    nextSteps: ["Skontaktuj sie z lokalnym wsparciem kryzysowym."],
  },
  constraints: [],
  crisisResources: [
    {
      id: "pl",
      label: "Polska",
      contacts: [
        {
          kind: "emergency_number",
          label: "Numer alarmowy 112",
          value: "112",
          description: "W pilnym zagrozeniu wybierz numer alarmowy.",
        },
      ],
      note: "Zasoby informacyjne.",
    },
  ],
} satisfies SessionSafetyDecision;

const failClosedDecision = {
  ...crisisDecision,
  reasonCode: "provider_unavailable",
} satisfies SessionSafetyDecision;

function createContext(body: unknown = { sessionId: SESSION_ID, message: "Chce uporzadkowac mysli." }) {
  return {
    request: new Request("https://safespace.local/api/session/message", {
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
    url: new URL("https://safespace.local/api/session/message"),
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("POST /api/session/message", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T10:02:00.000Z"));
    vi.clearAllMocks();
    claimSessionMessageTurn.mockResolvedValue(ok({ kind: "claimed", attemptId: "attempt-1" }));
    releaseSessionMessageTurn.mockResolvedValue(undefined);

    buildOperationalRequestContext.mockResolvedValue({
      requestId: "req-1",
      route: "/api/session/message",
      method: "POST",
      userHash: "hash-1",
    });
    getSessionDataContext.mockReturnValue(ok(contextData));
    getOpenRouterSessionConfig.mockReturnValue({
      apiKey: "test-openrouter-key",
      model: "openai/gpt-4o-mini",
      reasoningEffort: undefined,
    });
    requireActiveAccountAccess.mockResolvedValue({
      ok: true,
      data: {
        userId: "user-1",
        status: "active",
        blockedAt: null,
        blockReasonCode: null,
      },
    });
    getOwnedSessionMetadata.mockResolvedValue(ok(activeSession));
    listRecentOwnedSessionMessages.mockResolvedValue(ok([existingMessage]));
    listNewestApprovedSessionSummaryContexts.mockResolvedValue(
      ok([
        {
          id: "summary-1",
          sessionId: "previous-session-1",
          summaryText: "Uzytkownik zatwierdzil kontekst o napieciu przed rozmowa w pracy.",
          revision: 1,
          createdAt: "2026-06-07T09:00:00.000Z",
          updatedAt: "2026-06-07T09:00:00.000Z",
        },
      ]),
    );
    transitionSessionLifecycle.mockResolvedValue(ok({ ...activeSession, status: "interrupted" }));
    isSessionLensEnabled.mockReturnValue(true);
    detectSessionLens.mockResolvedValue({ outcome: "none", durationMs: 5 });
    setOwnedSessionLens.mockResolvedValue(ok(true));
    evaluateSessionSafety.mockResolvedValue(allowDecision);
    generateSessionResponse.mockResolvedValue({
      assistantText: "Mozemy zaczac od nazwania najwazniejszych faktow.",
      providerMetadata: {
        provider: "openrouter",
        model: "openai/gpt-4o-mini",
      },
    });
    persistSuccessfulMessageTurn.mockResolvedValue(ok(persistedTurn));
  });

  it("replays a saved turn without invoking either AI path again", async () => {
    claimSessionMessageTurn.mockResolvedValue(
      ok({ kind: "completed", responseType: "caution", messages: [persistedTurn.user, persistedTurn.assistant] }),
    );
    getOwnedSessionMetadata.mockResolvedValue(ok({ ...activeSession, status: "completed" }));
    const response = await POST(createContext() as never);
    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      type: "caution",
      messages: persistedTurn,
      session: { status: "completed" },
    });
    expect(evaluateSessionSafety).not.toHaveBeenCalled();
    expect(generateSessionResponse).not.toHaveBeenCalled();
    expect(persistSuccessfulMessageTurn).not.toHaveBeenCalled();
    expect(releaseSessionMessageTurn).not.toHaveBeenCalled();
  });

  it("passes the session's pinned avatar memory and both briefs after safety approval, without reading legacy summaries", async () => {
    getOwnedSessionMetadata.mockResolvedValue(ok({ ...activeSession, usesAvatarMemory: true }));
    getOwnedSessionPinnedContext.mockResolvedValue(
      ok({
        avatarMemory: "Fakty ze wszystkich poprzednich rozmów z Markiem.",
        peopleBrief: "- Marta (koleżanka z pracy)",
        topicBrief: "- Odmawianie w pracy",
      }),
    );
    const response = await POST(createContext() as never);
    expect(response.status).toBe(200);
    expect(getOwnedSessionPinnedContext).toHaveBeenCalledWith(
      contextData,
      expect.objectContaining({ id: SESSION_ID, avatarId: "cbt-guide" }),
    );
    expect(listNewestApprovedSessionSummaryContexts).not.toHaveBeenCalled();
    expect(generateSessionResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarMemory: "Fakty ze wszystkich poprzednich rozmów z Markiem.",
        peopleBrief: "- Marta (koleżanka z pracy)",
        topicBrief: "- Odmawianie w pracy",
        approvedSummaries: [],
      }),
      undefined,
      expect.any(Object),
    );
    expect(evaluateSessionSafety).toHaveBeenCalledBefore(generateSessionResponse);
  });

  it("drops the pinned people brief while the people-cards flag is off", async () => {
    isPeopleMemoryEnabled.mockReturnValueOnce(false);
    getOwnedSessionMetadata.mockResolvedValue(ok({ ...activeSession, usesAvatarMemory: true }));
    getOwnedSessionPinnedContext.mockResolvedValue(
      ok({ avatarMemory: "Pamięć bez kart.", peopleBrief: "- Marta (koleżanka z pracy)" }),
    );
    expect((await POST(createContext() as never)).status).toBe(200);
    const [input] = generateSessionResponse.mock.calls[0] as [GenerateSessionResponseInput];
    expect(input.avatarMemory).toBe("Pamięć bez kart.");
    expect(input.peopleBrief).toBeUndefined();
  });

  it("drops the pinned topic brief while the topic-map flag is off", async () => {
    isTopicMapEnabled.mockReturnValueOnce(false);
    getOwnedSessionMetadata.mockResolvedValue(ok({ ...activeSession, usesAvatarMemory: true }));
    getOwnedSessionPinnedContext.mockResolvedValue(
      ok({ avatarMemory: "Pamięć bez mapy.", peopleBrief: "- Marta", topicBrief: "- Odmawianie w pracy" }),
    );
    expect((await POST(createContext() as never)).status).toBe(200);
    const [input] = generateSessionResponse.mock.calls[0] as [GenerateSessionResponseInput];
    expect(input.peopleBrief).toBe("- Marta");
    expect(input.topicBrief).toBeUndefined();
  });

  it("detects a thematic lens beside the classifier, pins it once and hands it to the reply, logging only the result", async () => {
    detectSessionLens.mockResolvedValue({
      outcome: "detected",
      lens: "work_burnout",
      durationMs: 320,
      usage: { promptTokens: 90, completionTokens: 6 },
    });
    const response = await POST(createContext() as never);
    expect(response.status).toBe(200);
    expect(detectSessionLens).toHaveBeenCalledWith({
      currentUserMessage: "Chce uporzadkowac mysli.",
      recentUserMessages: [existingMessage.content],
    });
    expect(setOwnedSessionLens).toHaveBeenCalledWith(contextData, SESSION_ID, "work_burnout");
    expect(generateSessionResponse).toHaveBeenCalledWith(
      expect.objectContaining({ sessionLens: "work_burnout" }),
      undefined,
      expect.any(Object),
    );
    const lensEvent = logOperationalEvent.mock.calls
      .map(([event]) => event as Record<string, unknown>)
      .find((event) => event.event === "session.lens_evaluated");
    expect(lensEvent).toMatchObject({ outcome: "success", provider: "openrouter", durationMs: 320, inputUnits: 90 });
    expect(JSON.stringify(lensEvent)).not.toContain("work_burnout");
  });

  it("reuses a pinned lens without detecting again, and skips both while the lens flag is off", async () => {
    getOwnedSessionMetadata.mockResolvedValue(ok({ ...activeSession, sessionLens: "anxiety_avoidance" }));
    expect((await POST(createContext() as never)).status).toBe(200);
    expect(detectSessionLens).not.toHaveBeenCalled();
    expect(setOwnedSessionLens).not.toHaveBeenCalled();
    expect(generateSessionResponse).toHaveBeenCalledWith(
      expect.objectContaining({ sessionLens: "anxiety_avoidance" }),
      undefined,
      expect.any(Object),
    );

    vi.clearAllMocks();
    isSessionLensEnabled.mockReturnValue(false);
    getOwnedSessionMetadata.mockResolvedValue(ok({ ...activeSession, sessionLens: "anxiety_avoidance" }));
    claimSessionMessageTurn.mockResolvedValue(ok({ kind: "claimed", attemptId: "attempt-2" }));
    expect((await POST(createContext() as never)).status).toBe(200);
    expect(detectSessionLens).not.toHaveBeenCalled();
    const [input] = generateSessionResponse.mock.calls[0] as [GenerateSessionResponseInput];
    expect(input.sessionLens).toBeUndefined();
  });

  it("fails open: a failed lens detection still yields an ordinary reply, and a hard stop pins nothing", async () => {
    detectSessionLens.mockResolvedValue({ outcome: "failed", reasonCode: "provider_timeout", durationMs: 6000 });
    expect((await POST(createContext() as never)).status).toBe(200);
    expect(setOwnedSessionLens).not.toHaveBeenCalled();
    const [failedInput] = generateSessionResponse.mock.calls[0] as [GenerateSessionResponseInput];
    expect(failedInput.sessionLens).toBeUndefined();
    expect(
      logOperationalEvent.mock.calls
        .map(([event]) => event as Record<string, unknown>)
        .find((event) => event.event === "session.lens_evaluated"),
    ).toMatchObject({ outcome: "failure", reasonCode: "provider_timeout" });

    vi.clearAllMocks();
    claimSessionMessageTurn.mockResolvedValue(ok({ kind: "claimed", attemptId: "attempt-3" }));
    evaluateSessionSafety.mockResolvedValue(crisisDecision);
    detectSessionLens.mockResolvedValue({ outcome: "detected", lens: "family_of_origin", durationMs: 200 });
    expect((await POST(createContext() as never)).status).toBe(423);
    expect(setOwnedSessionLens).not.toHaveBeenCalled();
    expect(generateSessionResponse).not.toHaveBeenCalled();
  });

  it("does not silently answer without history when reading the pinned avatar memory fails", async () => {
    getOwnedSessionMetadata.mockResolvedValue(ok({ ...activeSession, usesAvatarMemory: true }));
    getOwnedSessionPinnedContext.mockResolvedValue(sessionDataError("read_failed"));
    const response = await POST(createContext() as never);
    expect(response.status).toBe(503);
    expect(generateSessionResponse).not.toHaveBeenCalled();
  });

  it.each(["message_in_progress", "message_request_conflict"] as const)(
    "refuses %s before any model call",
    async (code) => {
      claimSessionMessageTurn.mockResolvedValue(sessionDataError(code));
      const response = await POST(createContext() as never);
      expect(response.status).toBe(409);
      await expect(readJson(response)).resolves.toMatchObject({ type: code });
      expect(generateSessionResponse).not.toHaveBeenCalled();
      expect(releaseSessionMessageTurn).not.toHaveBeenCalled();
    },
  );

  it("releases the matching lease after a provider failure so a retry can run", async () => {
    generateSessionResponse.mockRejectedValue(new Error("private provider payload"));
    const response = await POST(createContext() as never);
    expect(response.status).toBe(503);
    expect(releaseSessionMessageTurn).toHaveBeenCalledWith(
      contextData,
      expect.objectContaining({ attemptId: "attempt-1" }),
    );
    expect(persistSuccessfulMessageTurn).not.toHaveBeenCalled();
  });

  it.each(["invalid_lifecycle_transition", "session_not_found"] as const)(
    "handles %s at atomic commit as a closed session",
    async (code) => {
      persistSuccessfulMessageTurn.mockResolvedValue(sessionDataError(code));
      const response = await POST(createContext() as never);
      expect(response.status).toBe(409);
      await expect(readJson(response)).resolves.toMatchObject({ type: "session_not_active" });
      expect(releaseSessionMessageTurn).toHaveBeenCalledOnce();
    },
  );

  it("handles expiry detected by the database after generation", async () => {
    persistSuccessfulMessageTurn.mockResolvedValue(sessionDataError("session_expired"));
    transitionSessionLifecycle.mockResolvedValue(ok({ ...activeSession, status: "expired" }));
    const response = await POST(createContext() as never);
    expect(response.status).toBe(409);
    await expect(readJson(response)).resolves.toMatchObject({ type: "expired", session: { status: "expired" } });
  });

  it("persists a normal allowed user and assistant turn", async () => {
    const response = await POST(createContext() as never);

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: true,
      type: "success",
      messages: {
        user: {
          id: "message-1",
        },
        assistant: {
          id: "message-2",
        },
      },
    });
    expect(evaluateSessionSafety).toHaveBeenCalledBefore(generateSessionResponse);
    const [generationInput, providerArg, optionsArg] = generateSessionResponse.mock.calls[0] as unknown as [
      GenerateSessionResponseInput,
      undefined,
      { timeoutMs: number },
    ];

    expect(generationInput.modality).toMatchObject({
      modalityName: "Cognitive-behavioural approach",
      avatarName: "Marek, practical guide",
    });
    expect(generationInput.locale).toBe("en");
    expect(generationInput.modality.sessionStyleHint).toContain("Avatar: Marek");
    expect(generationInput.sessionPhase).toBe("opening");
    expect(generationInput.approvedSummaries).toEqual([
      {
        summaryText: "Uzytkownik zatwierdzil kontekst o napieciu przed rozmowa w pracy.",
        revision: 1,
        createdAt: "2026-06-07T09:00:00.000Z",
        updatedAt: "2026-06-07T09:00:00.000Z",
      },
    ]);
    expect(providerArg).toBeUndefined();
    expect(optionsArg).toMatchObject({
      timeoutMs: 12000,
    });
    expect(persistSuccessfulMessageTurn).toHaveBeenCalledWith(contextData, {
      sessionId: SESSION_ID,
      clientMessageId: expect.any(String) as string,
      attemptId: "attempt-1",
      responseType: "success",
      userMessage: "Chce uporzadkowac mysli.",
      assistantMessage: "Mozemy zaczac od nazwania najwazniejszych faktow.",
    });
  });

  it("hands the model the closing phase once the session's own budget is nearly spent", async () => {
    vi.setSystemTime(new Date("2026-06-07T10:13:00.000Z"));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(200);
    const [generationInput] = generateSessionResponse.mock.calls[0] as unknown as [GenerateSessionResponseInput];

    expect(generationInput.sessionPhase).toBe("closing");
  });

  it("carries no approved summaries for a session started without context", async () => {
    getOwnedSessionMetadata.mockResolvedValue(ok({ ...activeSession, usesApprovedContext: false }));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(200);
    // The summaries exist and are approved; the session simply must not read
    // them, so nothing can leak into the prompt of a clean-start conversation.
    expect(listNewestApprovedSessionSummaryContexts).not.toHaveBeenCalled();
    const [generationInput] = generateSessionResponse.mock.calls[0] as unknown as [GenerateSessionResponseInput];

    expect(generationInput.approvedSummaries).toEqual([]);
  });

  it("rejects blocked accounts before parsing session ownership", async () => {
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
      type: "missing_or_unauthorized",
      code: "account_blocked",
    });
    expect(getOwnedSessionMetadata).not.toHaveBeenCalled();
    expect(evaluateSessionSafety).not.toHaveBeenCalled();
  });

  it("continues caution decisions without visible copy and with constrained ordinary generation", async () => {
    evaluateSessionSafety.mockResolvedValue(cautionDecision);

    const response = await POST(createContext() as never);

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: true,
      type: "caution",
      caution: null,
    });
    expect(generateSessionResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        cautionConstraints: cautionDecision.constraints,
      }),
      undefined,
      expect.objectContaining({
        timeoutMs: 12000,
      }),
    );
    expect(persistSuccessfulMessageTurn).toHaveBeenCalledOnce();
  });

  it("returns hard-stop resources without ordinary generation or persistence", async () => {
    evaluateSessionSafety.mockResolvedValue(crisisDecision);

    const response = await POST(createContext() as never);

    expect(response.status).toBe(423);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      type: "hard_stop",
      code: "safety_stop",
      crisisResources: [
        {
          id: "pl",
        },
      ],
    });
    expect(transitionSessionLifecycle).toHaveBeenCalledWith(
      contextData,
      expect.objectContaining({ nextStatus: "interrupted" }),
    );
    expect(generateSessionResponse).not.toHaveBeenCalled();
    expect(persistSuccessfulMessageTurn).not.toHaveBeenCalled();
  });

  it.each([
    "provider_unavailable",
    "provider_timeout",
    "provider_rate_limited",
    "invalid_provider_response",
    "missing_configuration",
  ] as const)("fails closed without ending the session on safety %s", async (reasonCode) => {
    evaluateSessionSafety.mockResolvedValue({ ...failClosedDecision, reasonCode });

    const response = await POST(createContext() as never);

    // A transient boundary outage is retryable: the draft stays with the user
    // and the session keeps its status — `interrupted` has no way back and
    // would burn a free-plan slot on a provider blip.
    expect(response.status).toBe(503);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      type: "ai_retry",
      code: "ai_retry",
      category: reasonCode,
      copy: {
        title: "We can't safely continue right now",
      },
    });
    expect(transitionSessionLifecycle).not.toHaveBeenCalled();
    expect(generateSessionResponse).not.toHaveBeenCalled();
    expect(persistSuccessfulMessageTurn).not.toHaveBeenCalled();
    expect(releaseSessionMessageTurn).toHaveBeenCalledOnce();
  });

  it("raises the provider ceiling with the configured reasoning effort while the budget allows it", async () => {
    getOpenRouterSessionConfig.mockReturnValue({
      apiKey: "test-openrouter-key",
      model: "openai/gpt-5.6-luna",
      reasoningEffort: "xhigh",
    });

    const response = await POST(createContext() as never);

    expect(response.status).toBe(200);
    const optionsArg = generateSessionResponse.mock.calls[0]?.[2] as { timeoutMs: number };
    // 13 minutes remain, so the 60 s extra-high ceiling is what reaches the provider.
    expect(optionsArg.timeoutMs).toBe(60_000);
  });

  it("still clips a raised ceiling to the session's remaining time", async () => {
    getOpenRouterSessionConfig.mockReturnValue({
      apiKey: "test-openrouter-key",
      model: "openai/gpt-5.6-luna",
      reasoningEffort: "xhigh",
    });
    vi.setSystemTime(new Date("2026-06-07T10:14:30.000Z"));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(200);
    const optionsArg = generateSessionResponse.mock.calls[0]?.[2] as { timeoutMs: number };
    // 30 s remain minus the 1 s reserve.
    expect(optionsArg.timeoutMs).toBe(29_000);
  });

  it("hands the classifier the user's own recent turns as context", async () => {
    listRecentOwnedSessionMessages.mockResolvedValue(
      ok([
        existingMessage,
        { ...existingMessage, id: "message-0b", role: "assistant", sequenceIndex: 1, content: "Odpowiedz asystenta." },
      ]),
    );

    await POST(createContext() as never);

    expect(evaluateSessionSafety).toHaveBeenCalledWith(
      expect.objectContaining({
        currentUserMessage: "Chce uporzadkowac mysli.",
        recentUserMessages: ["Poprzednia spokojna wiadomosc."],
      }),
    );
  });

  it("does not land a reply on a session that ended while the model was working", async () => {
    getOwnedSessionMetadata
      .mockResolvedValueOnce(ok(activeSession))
      .mockResolvedValueOnce(ok({ ...activeSession, status: "completed", endedAt: "2026-06-07T10:02:30.000Z" }));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(409);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      type: "session_not_active",
      code: "session_not_active",
    });
    expect(generateSessionResponse).toHaveBeenCalledOnce();
    expect(persistSuccessfulMessageTurn).not.toHaveBeenCalled();
  });

  it("logs the token cost of a completed turn without any content", async () => {
    generateSessionResponse.mockResolvedValue({
      assistantText: "Mozemy zaczac od nazwania najwazniejszych faktow.",
      providerMetadata: {
        provider: "openrouter",
        model: "openai/gpt-4o-mini",
        usage: { promptTokens: 1200, completionTokens: 340, totalTokens: 1540 },
      },
    });

    await POST(createContext() as never);

    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "session.ai_turn_completed",
        inputUnits: 1200,
        outputUnits: 340,
      }),
      expect.anything(),
    );
    const loggedEvents = logOperationalEvent.mock.calls.map((call) => JSON.stringify(call[0]));
    expect(loggedEvents.some((event) => event.includes("uporzadkowac"))).toBe(false);
  });

  it("rejects a malformed session id before any lookup", async () => {
    const response = await POST(createContext({ sessionId: "session-1", message: "Czesc." }) as never);

    expect(response.status).toBe(400);
    expect(getOwnedSessionMetadata).not.toHaveBeenCalled();
  });

  it("returns unavailable when approved summary context cannot be loaded after safety allow", async () => {
    listNewestApprovedSessionSummaryContexts.mockResolvedValue(sessionDataError("read_failed"));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(503);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      type: "session_not_active",
      code: "session_unavailable",
    });
    expect(evaluateSessionSafety).toHaveBeenCalled();
    expect(generateSessionResponse).not.toHaveBeenCalled();
    expect(persistSuccessfulMessageTurn).not.toHaveBeenCalled();
  });

  it("returns retryable AI failure without fake assistant persistence", async () => {
    generateSessionResponse.mockRejectedValue(new SessionAiError("provider_timeout"));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(503);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      type: "ai_retry",
      code: "ai_retry",
      category: "provider_timeout",
    });
    expect(persistSuccessfulMessageTurn).not.toHaveBeenCalled();
    expect(logOperationalEvent).toHaveBeenCalled();
  });

  it("rejects expired sessions before safety or ordinary AI generation", async () => {
    getOwnedSessionMetadata.mockResolvedValue(ok({ ...activeSession, expiresAt: "2026-06-07T10:01:59.000Z" }));
    transitionSessionLifecycle.mockResolvedValue(ok({ ...activeSession, status: "expired" }));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(409);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      type: "expired",
      code: "session_expired",
    });
    expect(transitionSessionLifecycle).toHaveBeenCalledWith(
      contextData,
      expect.objectContaining({ nextStatus: "expired" }),
    );
    expect(evaluateSessionSafety).not.toHaveBeenCalled();
    expect(generateSessionResponse).not.toHaveBeenCalled();
  });

  it("rejects invalid messages before session lookup", async () => {
    const response = await POST(createContext({ sessionId: SESSION_ID, message: "   " }) as never);

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      type: "validation_failed",
      code: "validation_failed",
    });
    expect(getOwnedSessionMetadata).not.toHaveBeenCalled();
  });

  it("rejects missing auth before message processing", async () => {
    getSessionDataContext.mockReturnValue(sessionDataError("missing_auth"));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      type: "missing_or_unauthorized",
      code: "missing_auth",
    });
    expect(evaluateSessionSafety).not.toHaveBeenCalled();
  });

  it("rejects missing owned sessions", async () => {
    getOwnedSessionMetadata.mockResolvedValue(sessionDataError("session_not_found"));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      type: "missing_or_unauthorized",
      code: "session_not_found",
    });
    expect(evaluateSessionSafety).not.toHaveBeenCalled();
  });

  it("returns safe persistence failure when sequence insertion conflicts", async () => {
    persistSuccessfulMessageTurn.mockResolvedValue(sessionDataError("write_failed"));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(409);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      type: "message_persistence_failed",
      code: "message_persistence_failed",
    });
  });
});
