import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { DeletedSessionTombstone, SessionDataContext } from "@/lib/session-data/types";
import type {
  SessionHistoryDetailResponse,
  SessionHistoryListResponse,
} from "@/lib/session-flow/session-history-contract";

const getSessionDataContext = vi.fn();
const requireActiveAccountAccess = vi.fn();
const readSessionHistoryList = vi.fn();
const readSessionHistoryDetail = vi.fn();
const deleteOwnedSession = vi.fn();

vi.mock("@/lib/session-data/auth", () => ({
  getSessionDataContext,
}));

vi.mock("@/lib/admin/account-access", () => ({
  requireActiveAccountAccess,
}));

vi.mock("@/lib/session-flow/session-history", async () => {
  const actual = await vi.importActual<typeof import("@/lib/session-flow/session-history")>(
    "@/lib/session-flow/session-history",
  );

  return {
    ...actual,
    readSessionHistoryList,
    readSessionHistoryDetail,
  };
});

vi.mock("@/lib/session-data/deletion", () => ({
  deleteOwnedSession,
}));

const [{ GET: GET_LIST }, { GET: GET_DETAIL, DELETE }] = await Promise.all([
  import("@/pages/api/session/history/index"),
  import("@/pages/api/session/history/[sessionId]"),
]);

const contextData = {
  user: {
    id: "user-1",
  },
} as SessionDataContext;

const listResponse = {
  ok: true,
  type: "session_history_list",
  avatar: {
    modalityId: "cbt",
    avatarId: "cbt-guide",
    avatarFirstName: "Marek",
    assetPath: "/avatars/cbt-guide.webp",
  },
  items: [
    {
      id: "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a",
      status: "completed",
      startedAt: "2026-06-07T10:00:00.000Z",
      endedAt: "2026-06-07T10:12:00.000Z",
      expiresAt: "2026-06-07T10:15:00.000Z",
      durationBucketSeconds: 900,
      isTrial: true,
      summaryState: "none",
      createdAt: "2026-06-07T09:59:00.000Z",
      updatedAt: "2026-06-07T10:12:00.000Z",
    },
  ],
  pagination: {
    page: 1,
    pageSize: 20,
    hasNextPage: false,
    hasPreviousPage: false,
  },
} satisfies SessionHistoryListResponse;

const detailResponse = {
  ok: true,
  type: "session_history_detail",
  detail: {
    session: listResponse.items[0],
    messages: [
      {
        id: "message-1",
        role: "user",
        sequenceIndex: 1,
        content: "Prywatna tresc rozmowy jest widoczna tylko w detail.",
        createdAt: "2026-06-07T10:01:00.000Z",
      },
    ],
    summary: {
      kind: "none",
    },
  },
} satisfies SessionHistoryDetailResponse;

const tombstone: DeletedSessionTombstone = {
  id: "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a",
  userId: "user-1",
  status: "deleted",
  startedAt: "2026-06-07T10:00:00.000Z",
  endedAt: "2026-06-07T10:12:00.000Z",
  expiresAt: "2026-06-07T10:15:00.000Z",
  deletedAt: "2026-06-07T10:13:00.000Z",
  deletionReasonCode: "user_request",
  isTrial: true,
  trialClaimId: "claim-1",
  durationBucketSeconds: 900,
  createdAt: "2026-06-07T09:59:00.000Z",
  updatedAt: "2026-06-07T10:13:00.000Z",
};

function createContext(url = "https://safespace.local/api/session/history?avatar=cbt-guide&page=1") {
  return {
    request: new Request(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }),
    cookies: {},
    locals: {
      user: {
        id: "user-1",
      },
    },
    params: {
      sessionId: "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a",
    },
    url: new URL(url),
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("GET /api/session/history", () => {
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
    readSessionHistoryList.mockResolvedValue(listResponse);
    readSessionHistoryDetail.mockResolvedValue(detailResponse);
    deleteOwnedSession.mockResolvedValue(ok(tombstone));
  });

  it("rejects missing auth before parsing history inputs", async () => {
    getSessionDataContext.mockReturnValue(sessionDataError("missing_auth"));

    const response = await GET_LIST(createContext() as never);

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      code: "missing_auth",
    });
    expect(readSessionHistoryList).not.toHaveBeenCalled();
  });

  it("rejects blocked accounts before listing history", async () => {
    requireActiveAccountAccess.mockResolvedValue({
      ok: false,
      error: {
        code: "account_blocked",
      },
    });

    const response = await GET_LIST(createContext() as never);

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      code: "account_blocked",
    });
    expect(readSessionHistoryList).not.toHaveBeenCalled();
  });

  it("passes avatar and page query params to the list helper", async () => {
    const response = await GET_LIST(
      createContext("https://safespace.local/api/session/history?avatar=integrative-guide&page=2") as never,
    );

    expect(response.status).toBe(200);
    expect(readSessionHistoryList).toHaveBeenCalledWith(contextData, {
      avatar: "integrative-guide",
      page: "2",
    });
  });

  it("maps invalid list input to a 400 stable response", async () => {
    readSessionHistoryList.mockResolvedValue({
      ok: false,
      type: "session_history_error",
      code: "invalid_avatar",
    });

    const response = await GET_LIST(createContext() as never);

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      ok: false,
      type: "session_history_error",
      code: "invalid_avatar",
    });
  });

  it("returns safe list metadata without private content or raw Supabase error fields", async () => {
    const response = await GET_LIST(createContext() as never);
    const body = await readJson(response);
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(serialized).not.toContain("Prywatna tresc");
    expect(serialized).not.toContain("message");
    expect(serialized).not.toContain("details");
    expect(serialized).not.toContain("hint");
    expect(listResponse.items[0]).not.toHaveProperty("content");
    expect(listResponse.items[0]).not.toHaveProperty("modalityId");
    expect(listResponse.items[0]).not.toHaveProperty("avatarId");
  });
});

describe("GET /api/session/history/[sessionId]", () => {
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
    readSessionHistoryDetail.mockResolvedValue(detailResponse);
    deleteOwnedSession.mockResolvedValue(ok(tombstone));
  });

  it("returns the read-only detail for an owned session", async () => {
    const response = await GET_DETAIL(
      createContext("https://safespace.local/api/session/history/5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a") as never,
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: true,
      type: "session_history_detail",
      detail: {
        messages: [
          {
            content: "Prywatna tresc rozmowy jest widoczna tylko w detail.",
          },
        ],
      },
    });
    expect(readSessionHistoryDetail).toHaveBeenCalledWith(contextData, {
      sessionId: "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a",
    });
  });

  it("maps missing owned sessions to not found", async () => {
    readSessionHistoryDetail.mockResolvedValue({
      ok: false,
      type: "session_history_error",
      code: "session_not_found",
    });

    const response = await GET_DETAIL(createContext("https://safespace.local/api/session/history/missing") as never);

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      code: "session_not_found",
    });
  });
});

describe("DELETE /api/session/history/[sessionId]", () => {
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
    readSessionHistoryDetail.mockResolvedValue(detailResponse);
    deleteOwnedSession.mockResolvedValue(ok(tombstone));
  });

  it("rejects missing auth before deleting", async () => {
    getSessionDataContext.mockReturnValue(sessionDataError("missing_auth"));

    const response = await DELETE(
      createContext("https://safespace.local/api/session/history/5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a") as never,
    );

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      code: "missing_auth",
    });
    expect(deleteOwnedSession).not.toHaveBeenCalled();
  });

  it("deletes through deleteOwnedSession and returns a safe tombstone", async () => {
    const response = await DELETE(
      createContext("https://safespace.local/api/session/history/5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a") as never,
    );
    const body = await readJson(response);
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(deleteOwnedSession).toHaveBeenCalledWith(contextData, {
      sessionId: "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a",
      deletionReasonCode: "user_request",
    });
    expect(serialized).not.toContain("content");
    expect(serialized).not.toContain("modalityId");
    expect(serialized).not.toContain("avatarId");
    expect(body).toMatchObject({
      ok: true,
      type: "session_history_deleted",
      deletedSession: {
        id: "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a",
        status: "deleted",
      },
    });
  });

  it("maps already-deleted sessions to not found", async () => {
    deleteOwnedSession.mockResolvedValue(sessionDataError("invalid_lifecycle_transition"));

    const response = await DELETE(
      createContext("https://safespace.local/api/session/history/5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a") as never,
    );

    expect(response.status).toBe(404);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      code: "session_not_found",
    });
  });

  it("maps delete failures to a stable failure without raw Supabase fields", async () => {
    deleteOwnedSession.mockResolvedValue(sessionDataError("delete_failed"));

    const response = await DELETE(
      createContext("https://safespace.local/api/session/history/5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a") as never,
    );
    const body = await readJson(response);
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(500);
    expect(body).toEqual({
      ok: false,
      type: "session_history_error",
      code: "delete_failed",
    });
    expect(serialized).not.toContain("message");
    expect(serialized).not.toContain("details");
    expect(serialized).not.toContain("hint");
  });
});

const { closeVoiceSession } = vi.hoisted(() => ({ closeVoiceSession: vi.fn() }));
vi.mock("@/lib/session-flow/voice-reconcile", () => ({ closeVoiceSession }));

describe("DELETE /api/session/history/[sessionId] for a voice conversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionDataContext.mockReturnValue(ok(contextData));
    requireActiveAccountAccess.mockResolvedValue({
      ok: true,
      data: { userId: "user-1", status: "active", blockedAt: null, blockReasonCode: null },
    });
    closeVoiceSession.mockResolvedValue(null);
  });

  it("hangs up and purges the observer after the row is deleted, and leaves text conversations alone", async () => {
    deleteOwnedSession.mockResolvedValue(ok({ ...tombstone, mode: "voice" }));
    const response = await DELETE(
      createContext(`https://safespace.local/api/session/history/${tombstone.id}`) as never,
    );

    expect(response.status).toBe(200);
    expect(closeVoiceSession).toHaveBeenCalledWith(contextData, { id: tombstone.id, mode: "voice" }, "deleted");
    expect(deleteOwnedSession.mock.invocationCallOrder[0]).toBeLessThan(closeVoiceSession.mock.invocationCallOrder[0]);

    closeVoiceSession.mockClear();
    deleteOwnedSession.mockResolvedValue(ok(tombstone));
    await DELETE(createContext(`https://safespace.local/api/session/history/${tombstone.id}`) as never);
    expect(closeVoiceSession).toHaveBeenCalledWith(contextData, { id: tombstone.id, mode: undefined }, "deleted");

    closeVoiceSession.mockClear();
    deleteOwnedSession.mockResolvedValue(sessionDataError("delete_failed"));
    await DELETE(createContext(`https://safespace.local/api/session/history/${tombstone.id}`) as never);
    expect(closeVoiceSession).not.toHaveBeenCalled();
  });
});
