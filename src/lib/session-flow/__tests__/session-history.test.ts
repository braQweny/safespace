import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import {
  SESSION_HISTORY_PAGE_SIZE,
  type OwnedSessionHistoryDetail,
  type OwnedSessionHistoryPage,
  type SessionDataContext,
  type SessionMessageRecord,
  type SessionMetadata,
} from "@/lib/session-data/types";
import {
  parseSessionHistoryPage,
  readSessionHistoryDetail,
  readSessionHistoryList,
  toSessionHistoryDeleteSuccessResponse,
  toSessionHistoryListItem,
  type SessionHistoryRepository,
} from "../session-history";

const context = {
  user: {
    id: "user-1",
  },
} as SessionDataContext;

const baseSession: SessionMetadata = {
  id: "session-1",
  userId: "user-1",
  modalityId: "cbt",
  avatarId: "cbt-guide",
  status: "completed",
  startedAt: "2026-06-07T10:00:00.000Z",
  endedAt: "2026-06-07T10:12:00.000Z",
  expiresAt: "2026-06-07T10:15:00.000Z",
  deletedAt: null,
  deletionReasonCode: null,
  isTrial: true,
  trialClaimId: "claim-1",
  durationBucketSeconds: 900,
  createdAt: "2026-06-07T09:59:00.000Z",
  updatedAt: "2026-06-07T10:12:00.000Z",
};

const detailMessages: SessionMessageRecord[] = [
  {
    id: "message-2",
    sessionId: "session-1",
    userId: "user-1",
    role: "assistant",
    sequenceIndex: 2,
    content: "Odpowiedz asystenta widoczna tylko w detail.",
    createdAt: "2026-06-07T10:01:01.000Z",
  },
  {
    id: "message-1",
    sessionId: "session-1",
    userId: "user-1",
    role: "user",
    sequenceIndex: 1,
    content: "Prywatna tresc uzytkownika widoczna tylko w detail.",
    createdAt: "2026-06-07T10:01:00.000Z",
  },
];

function createRepository(overrides: Partial<SessionHistoryRepository> = {}): SessionHistoryRepository {
  const page: OwnedSessionHistoryPage = {
    sessions: [baseSession],
    pagination: {
      page: 1,
      pageSize: SESSION_HISTORY_PAGE_SIZE,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
  const detail: OwnedSessionHistoryDetail = {
    session: baseSession,
    messages: detailMessages,
  };

  return {
    listOwnedSessionHistoryPage: vi.fn(() => Promise.resolve(ok(page))),
    getOwnedSessionHistoryDetail: vi.fn(() => Promise.resolve(ok(detail))),
    getLatestOwnedSessionSummaryState: vi.fn(() =>
      Promise.resolve(
        ok({
          kind: "none",
        }),
      ),
    ),
    ...overrides,
  };
}

describe("session history input parsing", () => {
  it("normalizes a missing page to 1 and accepts positive integer pages", () => {
    expect(parseSessionHistoryPage(null)).toEqual({ ok: true, page: 1 });
    expect(parseSessionHistoryPage("2")).toEqual({ ok: true, page: 2 });
  });

  it("rejects invalid page values", () => {
    expect(parseSessionHistoryPage("0")).toEqual({ ok: false, code: "invalid_page" });
    expect(parseSessionHistoryPage("-1")).toEqual({ ok: false, code: "invalid_page" });
    expect(parseSessionHistoryPage("1.5")).toEqual({ ok: false, code: "invalid_page" });
    expect(parseSessionHistoryPage("abc")).toEqual({ ok: false, code: "invalid_page" });
  });
});

describe("readSessionHistoryList", () => {
  it("rejects invalid avatars before repository access", async () => {
    const repository = createRepository();

    const result = await readSessionHistoryList(context, { avatar: "missing-avatar", page: "1" }, repository);

    expect(result).toEqual({
      ok: false,
      type: "session_history_error",
      code: "invalid_avatar",
    });
    expect(repository.listOwnedSessionHistoryPage).not.toHaveBeenCalled();
  });

  it("rejects invalid pages before repository access", async () => {
    const repository = createRepository();

    const result = await readSessionHistoryList(context, { avatar: "cbt-guide", page: "0" }, repository);

    expect(result).toEqual({
      ok: false,
      type: "session_history_error",
      code: "invalid_page",
    });
    expect(repository.listOwnedSessionHistoryPage).not.toHaveBeenCalled();
  });

  it("uses the fixed 20-item page size for repository reads", async () => {
    const repository = createRepository();

    await readSessionHistoryList(context, { avatar: "cbt-guide", page: "2" }, repository);

    expect(repository.listOwnedSessionHistoryPage).toHaveBeenCalledWith(context, {
      avatarId: "cbt-guide",
      page: 2,
      pageSize: 20,
    });
  });

  it("returns newest sessions first from safe metadata only", async () => {
    const repository = createRepository({
      listOwnedSessionHistoryPage: vi.fn(() =>
        Promise.resolve(
          ok({
            sessions: [
              {
                ...baseSession,
                id: "older-session",
                startedAt: "2026-06-07T09:00:00.000Z",
                createdAt: "2026-06-07T08:59:00.000Z",
              },
              {
                ...baseSession,
                id: "newer-session",
                startedAt: "2026-06-07T11:00:00.000Z",
                createdAt: "2026-06-07T10:59:00.000Z",
              },
            ],
            pagination: {
              page: 1,
              pageSize: SESSION_HISTORY_PAGE_SIZE,
              hasNextPage: false,
              hasPreviousPage: false,
            },
          }),
        ),
      ),
    });

    const result = await readSessionHistoryList(context, { avatar: "cbt-guide", page: "1" }, repository);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.items.map((item) => item.id)).toEqual(["newer-session", "older-session"]);
      expect(result.items[0]).toEqual({
        id: "newer-session",
        status: "completed",
        startedAt: "2026-06-07T11:00:00.000Z",
        endedAt: "2026-06-07T10:12:00.000Z",
        expiresAt: "2026-06-07T10:15:00.000Z",
        durationBucketSeconds: 900,
        isTrial: true,
        createdAt: "2026-06-07T10:59:00.000Z",
        updatedAt: "2026-06-07T10:12:00.000Z",
      });
      expect(result.items[0]).not.toHaveProperty("content");
      expect(result.items[0]).not.toHaveProperty("summaryText");
      expect(result.items[0]).not.toHaveProperty("title");
      expect(result.items[0]).not.toHaveProperty("preview");
      expect(result.items[0]).not.toHaveProperty("prompt");
      expect(result.items[0]).not.toHaveProperty("providerPayload");
      expect(result.items[0]).not.toHaveProperty("modalityId");
      expect(result.items[0]).not.toHaveProperty("avatarId");
    }
  });

  it("maps repository read failures to stable history errors", async () => {
    const repository = createRepository({
      listOwnedSessionHistoryPage: vi.fn(() => Promise.resolve(sessionDataError("read_failed"))),
    });

    await expect(readSessionHistoryList(context, { avatar: "cbt-guide", page: "1" }, repository)).resolves.toEqual({
      ok: false,
      type: "session_history_error",
      code: "read_failed",
    });
  });
});

describe("readSessionHistoryDetail", () => {
  it("returns detail messages ordered by sequence index", async () => {
    const repository = createRepository();

    const result = await readSessionHistoryDetail(context, { sessionId: "session-1" }, repository);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.detail.messages.map((message) => message.id)).toEqual(["message-1", "message-2"]);
      expect(result.detail.messages[0].content).toBe("Prywatna tresc uzytkownika widoczna tylko w detail.");
      expect(result.detail.session).not.toHaveProperty("modalityId");
      expect(result.detail.session).not.toHaveProperty("avatarId");
      expect(result.detail.summary).toEqual({
        kind: "none",
      });
    }
  });

  it("returns explicit summary preview state only in the read-only detail", async () => {
    const repository = createRepository({
      getLatestOwnedSessionSummaryState: vi.fn(() =>
        Promise.resolve(
          ok({
            kind: "preview",
            summary: {
              id: "summary-1",
              sessionId: "session-1",
              summaryText: "Widoczne podsumowanie tylko dla detail.",
              status: "draft",
              isVisible: true,
              revision: 1,
              createdAt: "2026-06-07T10:12:00.000Z",
              updatedAt: "2026-06-07T10:12:00.000Z",
            },
          }),
        ),
      ),
    });

    const result = await readSessionHistoryDetail(context, { sessionId: "session-1" }, repository);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.detail.summary).toMatchObject({
        kind: "preview",
        summary: {
          summaryText: "Widoczne podsumowanie tylko dla detail.",
          status: "draft",
        },
      });
    }
  });

  it("keeps list payloads free of message content and previews", () => {
    const unsafeSession = {
      ...baseSession,
      content: "Prywatna tresc nie moze trafic na liste.",
      summaryText: "Podsumowanie nie moze trafic na liste.",
      preview: "Preview nie moze trafic na liste.",
    } as SessionMetadata;

    const listItem = toSessionHistoryListItem(unsafeSession);

    expect(JSON.stringify(listItem)).not.toContain("Prywatna tresc");
    expect(JSON.stringify(listItem)).not.toContain("Podsumowanie");
    expect(JSON.stringify(listItem)).not.toContain("Preview");
    expect(listItem).not.toHaveProperty("summary");
  });

  it("maps missing or deleted detail targets to not found", async () => {
    const repository = createRepository({
      getOwnedSessionHistoryDetail: vi.fn(() => Promise.resolve(sessionDataError("session_not_found"))),
    });

    await expect(readSessionHistoryDetail(context, { sessionId: "missing-session" }, repository)).resolves.toEqual({
      ok: false,
      type: "session_history_error",
      code: "session_not_found",
    });
  });
});

describe("toSessionHistoryDeleteSuccessResponse", () => {
  it("returns a safe tombstone body without modality or avatar fields", () => {
    const response = toSessionHistoryDeleteSuccessResponse({
      id: "session-1",
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
    });

    expect(response.deletedSession).not.toHaveProperty("modalityId");
    expect(response.deletedSession).not.toHaveProperty("avatarId");
    expect(response.deletedSession).not.toHaveProperty("content");
  });
});
