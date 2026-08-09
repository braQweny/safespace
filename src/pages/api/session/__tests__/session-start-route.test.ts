import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { CurrentAvatarChoice } from "@/lib/session-flow/avatar-choice";
import type { SessionDataContext, SessionMetadata, SessionTrialClaimState } from "@/lib/session-data/types";

const getSessionDataContext = vi.fn();
const requireActiveAccountAccess = vi.fn();
const readCurrentAvatarChoice = vi.fn();
const readTrialAvailability = vi.fn();
const claimFreeTrialSession = vi.fn();
const transitionSessionLifecycle = vi.fn();
const buildOperationalRequestContext = vi.fn();
const logOperationalEvent = vi.fn();

vi.mock("@/lib/session-data/auth", () => ({
  getSessionDataContext,
}));

vi.mock("@/lib/admin/account-access", () => ({
  requireActiveAccountAccess,
}));

vi.mock("@/lib/session-flow/avatar-choice", () => ({
  readCurrentAvatarChoice,
}));

vi.mock("@/lib/session-data/quota", () => ({
  readTrialAvailability,
  claimFreeTrialSession,
}));

vi.mock("@/lib/session-data/repository", () => ({
  transitionSessionLifecycle,
  getOwnedSessionMetadata: vi.fn(),
  listOwnedActiveSessionMetadata: vi.fn(),
  listOwnedSessionMessages: vi.fn(),
  listNewestApprovedSessionSummaryContexts: vi.fn(),
}));

vi.mock("@/lib/operational-visibility/request-context", () => ({
  buildOperationalRequestContext,
  getOperationalDurationMs: () => 12,
}));

vi.mock("@/lib/operational-visibility/logger", () => ({
  logOperationalEvent,
}));

const { POST } = await import("@/pages/api/session/start");

const contextData = {
  user: {
    id: "user-1",
  },
} as SessionDataContext;

const avatar = {
  modality: {
    modalityId: "cbt",
    avatarId: "cbt-guide",
    modalityName: "Podejście poznawczo-behawioralne",
    avatarName: "Marek, praktyczny przewodnik",
    explanation: "Pomaga zauważać powiązania między myślami, emocjami, reakcjami ciała i codziennymi działaniami.",
    focus: "Porządkuje sytuacje krok po kroku i szuka konkretnych obserwacji, które da się nazwać.",
    sessionStyleHint: "Uzywa jasnej struktury.",
    assetPath: "/avatars/cbt-guide.png",
    altText: "Ilustracyjny portret neutralnego awatara Marka z notesem",
  },
  selected: {
    modalityId: "cbt",
    avatarId: "cbt-guide",
    modalityName: "Podejście poznawczo-behawioralne",
    avatarName: "Marek, praktyczny przewodnik",
    assetPath: "/avatars/cbt-guide.png",
    altText: "Ilustracyjny portret neutralnego awatara Marka z notesem",
  },
} satisfies CurrentAvatarChoice;

const createdSession: SessionMetadata = {
  id: "session-1",
  userId: "user-1",
  modalityId: "cbt",
  avatarId: "cbt-guide",
  status: "created",
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

const activeSession: SessionMetadata = {
  ...createdSession,
  status: "active",
};

const claim: SessionTrialClaimState = {
  id: "claim-1",
  sessionId: "session-1",
  userId: "user-1",
  trialDurationSeconds: 900,
  claimedAt: "2026-06-07T10:00:00.000Z",
  createdAt: "2026-06-07T10:00:00.000Z",
};

function createContext(headers: HeadersInit = { Accept: "application/json" }) {
  return {
    request: new Request("https://safespace.local/api/session/start", {
      method: "POST",
      headers,
    }),
    cookies: {},
    locals: {
      user: {
        id: "user-1",
      },
      requestId: "req-1",
    },
    url: new URL("https://safespace.local/api/session/start"),
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

describe("POST /api/session/start", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T10:00:00.000Z"));
    vi.clearAllMocks();

    buildOperationalRequestContext.mockResolvedValue({
      requestId: "req-1",
      route: "/api/session/start",
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
    readCurrentAvatarChoice.mockResolvedValue(ok(avatar));
    readTrialAvailability.mockResolvedValue(
      ok({
        isAvailable: true,
        existingClaim: null,
      }),
    );
    claimFreeTrialSession.mockResolvedValue(
      ok({
        session: createdSession,
        trialClaim: claim,
      }),
    );
    transitionSessionLifecycle.mockResolvedValue(ok(activeSession));
  });

  it("rejects missing auth before reading avatar or claiming the trial", async () => {
    getSessionDataContext.mockReturnValue(sessionDataError("missing_auth"));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      code: "missing_auth",
    });
    expect(readCurrentAvatarChoice).not.toHaveBeenCalled();
    expect(claimFreeTrialSession).not.toHaveBeenCalled();
  });

  it("rejects blocked accounts before reading avatar or claiming the trial", async () => {
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
    expect(claimFreeTrialSession).not.toHaveBeenCalled();
  });

  it("returns the avatar prerequisite without claiming a session", async () => {
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
      redirectTo: "/dashboard/avatar",
    });
    expect(readTrialAvailability).not.toHaveBeenCalled();
    expect(claimFreeTrialSession).not.toHaveBeenCalled();
  });

  it("claims and activates exactly one 15-minute trial with the current avatar snapshot", async () => {
    const response = await POST(createContext() as never);

    expect(response.status).toBe(201);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: true,
      session: {
        id: "session-1",
        status: "active",
        remainingSeconds: 900,
      },
    });
    expect(claimFreeTrialSession).toHaveBeenCalledWith(contextData, {
      startedAt: "2026-06-07T10:00:00.000Z",
      expiresAt: "2026-06-07T10:15:00.000Z",
      modalityId: "cbt",
      avatarId: "cbt-guide",
    });
    expect(transitionSessionLifecycle).toHaveBeenCalledWith(contextData, {
      sessionId: "session-1",
      nextStatus: "active",
      startedAt: "2026-06-07T10:00:00.000Z",
      expiresAt: "2026-06-07T10:15:00.000Z",
      durationBucketSeconds: 900,
    });
  });

  it("does not call the claim helper when availability already shows a used trial", async () => {
    readTrialAvailability.mockResolvedValue(
      ok({
        isAvailable: false,
        existingClaim: claim,
      }),
    );

    const response = await POST(createContext() as never);

    expect(response.status).toBe(409);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      code: "trial_already_claimed",
    });
    expect(claimFreeTrialSession).not.toHaveBeenCalled();
  });

  it("maps a race-time duplicate claim to a stable duplicate state", async () => {
    claimFreeTrialSession.mockResolvedValue(sessionDataError("trial_already_claimed"));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(409);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      code: "trial_already_claimed",
    });
  });

  it("redirects browser form posts after successful start", async () => {
    const context = createContext({ Accept: "text/html" });

    const response = await POST(context as never);

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/dashboard/session?started=1");
  });
});
