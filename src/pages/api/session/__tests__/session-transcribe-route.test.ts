import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionDataContext } from "@/lib/session-data/types";
import type { SessionMetadata } from "@/lib/session-data/types";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import { SessionTranscriptionError } from "@/lib/session-transcription/errors";

const requireSessionRouteAccess = vi.fn();
const transcribeSessionAudio = vi.fn();
const getOwnedSessionMetadata = vi.fn();
const expireOwnedSession = vi.fn();

vi.mock("@/lib/session-flow/route-access", () => ({
  requireSessionRouteAccess,
}));

vi.mock("@/lib/session-transcription/provider", () => ({
  transcribeSessionAudio,
}));

vi.mock("@/lib/session-data/repository", () => ({
  getOwnedSessionMetadata,
}));

vi.mock("@/lib/session-flow/time-limit", () => ({
  expireOwnedSession,
  isSessionExpired: (session: SessionMetadata) =>
    typeof session.expiresAt === "string" && Date.parse(session.expiresAt) <= Date.now(),
}));

const { POST } = await import("@/pages/api/session/transcribe");

const contextData = {
  user: {
    id: "user-1",
  },
} as SessionDataContext;

const SESSION_ID = "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a";

const activeSession = {
  id: SESSION_ID,
  userId: "user-1",
  modalityId: "cbt",
  avatarId: "cbt-guide",
  status: "active",
  startedAt: "2099-06-07T10:00:00.000Z",
  endedAt: null,
  expiresAt: "2099-06-07T10:15:00.000Z",
  deletedAt: null,
  deletionReasonCode: null,
  isTrial: false,
  trialClaimId: null,
  durationBucketSeconds: 900,
  usesApprovedContext: false,
  createdAt: "2099-06-07T10:00:00.000Z",
  updatedAt: "2099-06-07T10:00:00.000Z",
} satisfies SessionMetadata;

function createContext(body: unknown = { sessionId: SESSION_ID, audioBase64: "UklGRg==", format: "webm" }) {
  return {
    request: new Request("https://safespace.local/api/session/transcribe", {
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
    },
    url: new URL("https://safespace.local/api/session/transcribe"),
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("POST /api/session/transcribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSessionRouteAccess.mockResolvedValue({
      ok: true,
      data: contextData,
    });
    getOwnedSessionMetadata.mockResolvedValue(ok(activeSession));
    expireOwnedSession.mockResolvedValue(ok({ session: activeSession }));
    transcribeSessionAudio.mockResolvedValue({
      text: "Podyktowana treść wiadomości.",
      providerMetadata: {
        provider: "openrouter",
        model: "openai/gpt-4o-mini-transcribe",
      },
    });
  });

  it("rejects missing auth before provider calls", async () => {
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
    await expect(readJson(response)).resolves.toEqual({
      ok: false,
      type: "session_transcription_error",
      code: "missing_auth",
    });
    expect(transcribeSessionAudio).not.toHaveBeenCalled();
  });

  it("validates v1 WebM audio before provider calls", async () => {
    const response = await POST(
      createContext({ sessionId: SESSION_ID, audioBase64: "UklGRg==", format: "mp3" }) as never,
    );

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      ok: false,
      type: "session_transcription_error",
      code: "unsupported_format",
    });
    expect(transcribeSessionAudio).not.toHaveBeenCalled();
  });

  it("requires an owned active session before sending audio to the provider", async () => {
    getOwnedSessionMetadata.mockResolvedValueOnce(sessionDataError("session_not_found"));

    const missing = await POST(createContext() as never);

    expect(missing.status).toBe(404);
    await expect(readJson(missing)).resolves.toMatchObject({ code: "session_not_found" });
    expect(transcribeSessionAudio).not.toHaveBeenCalled();

    getOwnedSessionMetadata.mockResolvedValueOnce(ok({ ...activeSession, status: "completed" }));

    const completed = await POST(createContext() as never);

    expect(completed.status).toBe(409);
    await expect(readJson(completed)).resolves.toMatchObject({ code: "session_not_active" });
    expect(transcribeSessionAudio).not.toHaveBeenCalled();
  });

  it("expires an elapsed session before rejecting transcription", async () => {
    getOwnedSessionMetadata.mockResolvedValueOnce(ok({ ...activeSession, expiresAt: "2020-06-07T10:15:00.000Z" }));

    const response = await POST(createContext() as never);

    expect(response.status).toBe(409);
    await expect(readJson(response)).resolves.toMatchObject({ code: "session_expired" });
    expect(expireOwnedSession).toHaveBeenCalledOnce();
    expect(transcribeSessionAudio).not.toHaveBeenCalled();
  });

  it("returns transcribed text without provider metadata or raw audio", async () => {
    const response = await POST(createContext() as never);
    const body = await readJson(response);
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(transcribeSessionAudio).toHaveBeenCalledWith({
      audioBase64: "UklGRg==",
      format: "webm",
    });
    expect(body).toEqual({
      ok: true,
      type: "session_transcription",
      text: "Podyktowana treść wiadomości.",
    });
    expect(serialized).not.toContain("providerMetadata");
    expect(serialized).not.toContain("UklGRg");
  });

  it("maps provider failures to stable codes without raw provider bodies", async () => {
    transcribeSessionAudio.mockRejectedValueOnce(new SessionTranscriptionError("invalid_provider_response"));

    const invalidProviderResponse = await POST(createContext() as never);
    const invalidBody = await readJson(invalidProviderResponse);

    expect(invalidProviderResponse.status).toBe(502);
    expect(invalidBody).toEqual({
      ok: false,
      type: "session_transcription_error",
      code: "invalid_provider_response",
    });
    expect(JSON.stringify(invalidBody)).not.toContain("raw provider error");

    transcribeSessionAudio.mockRejectedValueOnce(new SessionTranscriptionError("provider_rate_limited"));

    const rateLimited = await POST(createContext() as never);

    expect(rateLimited.status).toBe(429);
    await expect(readJson(rateLimited)).resolves.toEqual({
      ok: false,
      type: "session_transcription_error",
      code: "provider_rate_limited",
    });
  });
});
