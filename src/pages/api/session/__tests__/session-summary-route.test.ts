import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { SessionDataContext, SessionSummaryRecord } from "@/lib/session-data/types";

const getSessionDataContext = vi.fn();
const requireActiveAccountAccess = vi.fn();
const getLatestOwnedSessionSummaryState = vi.fn();
const saveGeneratedVisibleSessionSummary = vi.fn();
const approveOwnedSessionSummaryRevision = vi.fn();
const generateOwnedSessionSummary = vi.fn();

vi.mock("@/lib/session-data/auth", () => ({
  getSessionDataContext,
}));

vi.mock("@/lib/admin/account-access", () => ({
  requireActiveAccountAccess,
}));

vi.mock("@/lib/session-data/repository", async () => {
  const actual = await vi.importActual<typeof import("@/lib/session-data/repository")>("@/lib/session-data/repository");

  return {
    ...actual,
    getLatestOwnedSessionSummaryState,
    saveGeneratedVisibleSessionSummary,
    approveOwnedSessionSummaryRevision,
  };
});

vi.mock("@/lib/session-flow/session-summary", async () => {
  const actual = await vi.importActual<typeof import("@/lib/session-flow/session-summary")>(
    "@/lib/session-flow/session-summary",
  );

  return {
    ...actual,
    generateOwnedSessionSummary,
  };
});

vi.mock("@/lib/session-summary/provider", () => ({
  openRouterSessionSummaryProvider: {
    generateSessionSummary: vi.fn(),
  },
}));

const { GET, POST, PATCH } = await import("@/pages/api/session/summary/[sessionId]");

const contextData = {
  user: {
    id: "user-1",
  },
} as SessionDataContext;

const summaryRecord: SessionSummaryRecord = {
  id: "summary-1",
  sessionId: "session-1",
  userId: "user-1",
  summaryText: "Uzytkownik chce kontynuowac watek napiecia w pracy.",
  status: "draft",
  isVisible: true,
  revision: 1,
  createdAt: "2026-06-07T10:12:00.000Z",
  updatedAt: "2026-06-07T10:12:00.000Z",
};

function createContext(method = "GET", body?: unknown) {
  return {
    request: new Request("https://safespace.local/api/session/summary/session-1", {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    cookies: {},
    locals: {
      user: {
        id: "user-1",
      },
    },
    params: {
      sessionId: "session-1",
    },
    url: new URL("https://safespace.local/api/session/summary/session-1"),
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("/api/session/summary/[sessionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    getLatestOwnedSessionSummaryState.mockResolvedValue(
      ok({
        kind: "none",
      }),
    );
    generateOwnedSessionSummary.mockResolvedValue(
      ok({
        summaryText: summaryRecord.summaryText,
        providerMetadata: {
          provider: "openrouter",
          model: "openai/gpt-4o-mini",
        },
      }),
    );
    saveGeneratedVisibleSessionSummary.mockResolvedValue(ok(summaryRecord));
    approveOwnedSessionSummaryRevision.mockResolvedValue(
      ok({
        ...summaryRecord,
        status: "ready",
      }),
    );
  });

  it("rejects missing auth before summary reads", async () => {
    getSessionDataContext.mockReturnValue(sessionDataError("missing_auth"));

    const response = await GET(createContext() as never);

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toEqual({
      ok: false,
      type: "session_summary_error",
      code: "missing_auth",
    });
    expect(getLatestOwnedSessionSummaryState).not.toHaveBeenCalled();
  });

  it("rejects blocked accounts before reading summary state", async () => {
    requireActiveAccountAccess.mockResolvedValue({
      ok: false,
      error: {
        code: "account_blocked",
      },
    });

    const response = await GET(createContext() as never);

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({
      ok: false,
      type: "session_summary_error",
      code: "account_blocked",
    });
    expect(getLatestOwnedSessionSummaryState).not.toHaveBeenCalled();
  });

  it("returns current summary state for an owned session", async () => {
    getLatestOwnedSessionSummaryState.mockResolvedValue(
      ok({
        kind: "preview",
        summary: {
          id: "summary-1",
          sessionId: "session-1",
          summaryText: summaryRecord.summaryText,
          status: "draft",
          isVisible: true,
          revision: 1,
          createdAt: "2026-06-07T10:12:00.000Z",
          updatedAt: "2026-06-07T10:12:00.000Z",
        },
      }),
    );

    const response = await GET(createContext() as never);

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: true,
      type: "session_summary_state",
      state: {
        kind: "preview",
        summary: {
          summaryText: summaryRecord.summaryText,
        },
      },
    });
  });

  it("generates or retries a visible draft summary without exposing provider metadata", async () => {
    const response = await POST(createContext("POST") as never);
    const body = await readJson(response);
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(generateOwnedSessionSummary).toHaveBeenCalledWith(
      contextData,
      {
        sessionId: "session-1",
        locale: "pl",
      },
      expect.any(Object),
    );
    expect(saveGeneratedVisibleSessionSummary).toHaveBeenCalledWith(contextData, {
      sessionId: "session-1",
      summaryText: summaryRecord.summaryText,
      status: "draft",
      isVisible: true,
    });
    expect(body).toMatchObject({
      ok: true,
      type: "session_summary_generated",
      summary: {
        summaryText: summaryRecord.summaryText,
        status: "draft",
      },
    });
    expect(serialized).not.toContain("providerMetadata");
    expect(serialized).not.toContain("raw provider error");
  });

  it("maps non-summarizable sessions and provider failures to stable codes", async () => {
    generateOwnedSessionSummary.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "session_not_summarizable",
      },
    });

    const nonSummarizable = await POST(createContext("POST") as never);

    expect(nonSummarizable.status).toBe(409);
    await expect(readJson(nonSummarizable)).resolves.toMatchObject({
      ok: false,
      code: "session_not_summarizable",
    });

    generateOwnedSessionSummary.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "provider_failed",
        message: "raw provider error",
      },
    });

    const providerFailure = await POST(createContext("POST") as never);
    const body = await readJson(providerFailure);

    expect(providerFailure.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      type: "session_summary_error",
      code: "provider_unavailable",
    });
    expect(JSON.stringify(body)).not.toContain("raw provider error");
  });

  it("maps save failures to generation_failed", async () => {
    saveGeneratedVisibleSessionSummary.mockResolvedValue(sessionDataError("write_failed"));

    const response = await POST(createContext("POST") as never);

    expect(response.status).toBe(503);
    await expect(readJson(response)).resolves.toEqual({
      ok: false,
      type: "session_summary_error",
      code: "generation_failed",
    });
  });

  it("approves an explicit visible revision", async () => {
    const response = await PATCH(createContext("PATCH", { revision: 1 }) as never);

    expect(response.status).toBe(200);
    expect(approveOwnedSessionSummaryRevision).toHaveBeenCalledWith(contextData, {
      sessionId: "session-1",
      revision: 1,
    });
    await expect(readJson(response)).resolves.toMatchObject({
      ok: true,
      type: "session_summary_approved",
      summary: {
        status: "ready",
        isVisible: true,
        revision: 1,
      },
    });
  });

  it("maps invalid approval input and approval failures to stable codes", async () => {
    const invalid = await PATCH(createContext("PATCH", { revision: "latest" }) as never);

    expect(invalid.status).toBe(404);
    await expect(readJson(invalid)).resolves.toEqual({
      ok: false,
      type: "session_summary_error",
      code: "summary_unavailable",
    });

    approveOwnedSessionSummaryRevision.mockResolvedValue(sessionDataError("write_failed"));

    const failed = await PATCH(createContext("PATCH", { revision: 1 }) as never);

    expect(failed.status).toBe(409);
    await expect(readJson(failed)).resolves.toEqual({
      ok: false,
      type: "session_summary_error",
      code: "approval_failed",
    });
  });
});
