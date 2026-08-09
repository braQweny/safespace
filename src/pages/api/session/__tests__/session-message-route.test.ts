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
const listOwnedSessionMessages = vi.fn();
const listNewestApprovedSessionSummaryContexts = vi.fn();
const transitionSessionLifecycle = vi.fn();
const evaluateSessionSafety = vi.fn();
const generateSessionResponse = vi.fn();
const persistSuccessfulMessageTurn = vi.fn();
const buildOperationalRequestContext = vi.fn();
const logOperationalEvent = vi.fn();

vi.mock("@/lib/session-data/auth", () => ({
  getSessionDataContext,
}));

vi.mock("@/lib/admin/account-access", () => ({
  requireActiveAccountAccess,
}));

vi.mock("@/lib/session-data/repository", () => ({
  getOwnedSessionMetadata,
  listOwnedActiveSessionMetadata: vi.fn(),
  listOwnedSessionMessages,
  listNewestApprovedSessionSummaryContexts,
  transitionSessionLifecycle,
  appendSessionMessages: vi.fn(),
}));

vi.mock("@/lib/session-data/quota", () => ({
  readTrialAvailability: vi.fn(),
}));

vi.mock("@/lib/session-safety/evaluate-session-safety", () => ({
  evaluateSessionSafety,
}));

vi.mock("@/lib/session-ai/provider", () => ({
  generateSessionResponse,
}));

vi.mock("@/lib/session-flow/message-persistence", () => ({
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

const activeSession: SessionMetadata = {
  id: "session-1",
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
  createdAt: "2026-06-07T10:00:00.000Z",
  updatedAt: "2026-06-07T10:00:00.000Z",
};

const existingMessage: SessionMessageRecord = {
  id: "message-0",
  sessionId: "session-1",
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

function createContext(body: unknown = { sessionId: "session-1", message: "Chce uporzadkowac mysli." }) {
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

    buildOperationalRequestContext.mockResolvedValue({
      requestId: "req-1",
      route: "/api/session/message",
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
      },
    });
    getOwnedSessionMetadata.mockResolvedValue(ok(activeSession));
    listOwnedSessionMessages.mockResolvedValue(ok([existingMessage]));
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
      modalityName: "Podejście poznawczo-behawioralne",
      avatarName: "Marek, praktyczny przewodnik",
    });
    expect(generationInput.modality.sessionStyleHint).toContain("Avatar: Marek");
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
      sessionId: "session-1",
      userMessage: "Chce uporzadkowac mysli.",
      assistantMessage: "Mozemy zaczac od nazwania najwazniejszych faktow.",
    });
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
    expect(listNewestApprovedSessionSummaryContexts).not.toHaveBeenCalled();
    expect(generateSessionResponse).not.toHaveBeenCalled();
    expect(persistSuccessfulMessageTurn).not.toHaveBeenCalled();
  });

  it("fails closed without storing raw text when safety is unavailable", async () => {
    evaluateSessionSafety.mockResolvedValue(failClosedDecision);

    const response = await POST(createContext() as never);

    expect(response.status).toBe(423);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      type: "hard_stop",
      code: "safety_stop",
    });
    expect(generateSessionResponse).not.toHaveBeenCalled();
    expect(persistSuccessfulMessageTurn).not.toHaveBeenCalled();
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
    const response = await POST(createContext({ sessionId: "session-1", message: "   " }) as never);

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
