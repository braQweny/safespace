import { getModalityByAvatarId, toSelectedModalityAvatar } from "@/lib/modalities";
import { getOwnedSessionHistoryDetail, listOwnedSessionHistoryPage } from "@/lib/session-data/repository";
import {
  SESSION_HISTORY_PAGE_SIZE,
  type DeletedSessionTombstone,
  type OwnedSessionHistoryDetail,
  type OwnedSessionHistoryPage,
  type SessionDataContext,
  type SessionHistoryDetail,
  type SessionHistoryListItem,
  type SessionHistoryMessage,
  type SessionMessageRecord,
  type SessionMetadata,
} from "@/lib/session-data/types";
import type { SessionDataErrorCode } from "@/lib/session-data/errors";
import {
  sessionHistoryFailure,
  type SessionHistoryDeleteSuccessResponse,
  type SessionHistoryDetailResponse,
  type SessionHistoryFailureCode,
  type SessionHistoryListResponse,
} from "./session-history-contract";

export interface SessionHistoryRepository {
  listOwnedSessionHistoryPage: typeof listOwnedSessionHistoryPage;
  getOwnedSessionHistoryDetail: typeof getOwnedSessionHistoryDetail;
}

export interface ReadSessionHistoryListInput {
  avatar: unknown;
  page: unknown;
}

export interface ReadSessionHistoryDetailInput {
  sessionId: unknown;
}

type PageParseResult = { ok: true; page: number } | { ok: false; code: "invalid_page" };

const defaultSessionHistoryRepository: SessionHistoryRepository = {
  listOwnedSessionHistoryPage,
  getOwnedSessionHistoryDetail,
};

function parseTimestampMs(timestamp: string | null) {
  if (!timestamp) {
    return 0;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareHistoryItemsNewestFirst(left: SessionHistoryListItem, right: SessionHistoryListItem) {
  return parseTimestampMs(right.startedAt ?? right.createdAt) - parseTimestampMs(left.startedAt ?? left.createdAt);
}

function compareMessagesBySequence(left: SessionMessageRecord, right: SessionMessageRecord) {
  return left.sequenceIndex - right.sequenceIndex;
}

function mapSessionDataCode(code: SessionDataErrorCode): SessionHistoryFailureCode {
  if (
    code === "missing_auth" ||
    code === "session_data_unavailable" ||
    code === "session_not_found" ||
    code === "delete_failed"
  ) {
    return code;
  }

  return "read_failed";
}

export function parseSessionHistoryPage(value: unknown): PageParseResult {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true,
      page: 1,
    };
  }

  const normalized = typeof value === "string" ? value.trim() : value;
  const page =
    typeof normalized === "number"
      ? normalized
      : typeof normalized === "string" && /^\d+$/.test(normalized)
        ? Number(normalized)
        : Number.NaN;

  if (!Number.isSafeInteger(page) || page < 1) {
    return {
      ok: false,
      code: "invalid_page",
    };
  }

  return {
    ok: true,
    page,
  };
}

function normalizeSessionHistorySessionId(value: unknown) {
  const sessionId = typeof value === "string" ? value.trim() : "";
  return sessionId || null;
}

export function toSessionHistoryListItem(session: SessionMetadata): SessionHistoryListItem | null {
  if (session.status === "deleted") {
    return null;
  }

  return {
    id: session.id,
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    expiresAt: session.expiresAt,
    durationBucketSeconds: session.durationBucketSeconds,
    isTrial: session.isTrial,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function toSessionHistoryMessage(message: SessionMessageRecord): SessionHistoryMessage {
  return {
    id: message.id,
    role: message.role,
    sequenceIndex: message.sequenceIndex,
    content: message.content,
    createdAt: message.createdAt,
  };
}

function toSessionHistoryDetail(detail: OwnedSessionHistoryDetail): SessionHistoryDetail | null {
  const session = toSessionHistoryListItem(detail.session);

  if (!session) {
    return null;
  }

  return {
    session,
    messages: [...detail.messages].sort(compareMessagesBySequence).map(toSessionHistoryMessage),
  };
}

function toSessionHistoryListResponse(
  page: OwnedSessionHistoryPage,
  avatar: NonNullable<ReturnType<typeof getModalityByAvatarId>>,
): SessionHistoryListResponse {
  return {
    ok: true,
    type: "session_history_list",
    avatar: toSelectedModalityAvatar(avatar),
    items: page.sessions
      .map(toSessionHistoryListItem)
      .filter((item) => item !== null)
      .sort(compareHistoryItemsNewestFirst),
    pagination: {
      ...page.pagination,
      pageSize: SESSION_HISTORY_PAGE_SIZE,
    },
  };
}

export async function readSessionHistoryList(
  context: SessionDataContext,
  input: ReadSessionHistoryListInput,
  repository: SessionHistoryRepository = defaultSessionHistoryRepository,
): Promise<SessionHistoryListResponse> {
  const avatarId = typeof input.avatar === "string" ? input.avatar.trim() : "";
  const avatar = getModalityByAvatarId(avatarId);

  if (!avatar) {
    return sessionHistoryFailure("invalid_avatar");
  }

  const page = parseSessionHistoryPage(input.page);

  if (!page.ok) {
    return sessionHistoryFailure(page.code);
  }

  const history = await repository.listOwnedSessionHistoryPage(context, {
    avatarId: avatar.avatarId,
    page: page.page,
    pageSize: SESSION_HISTORY_PAGE_SIZE,
  });

  if (!history.ok) {
    return sessionHistoryFailure(mapSessionDataCode(history.error.code));
  }

  return toSessionHistoryListResponse(history.data, avatar);
}

export async function readSessionHistoryDetail(
  context: SessionDataContext,
  input: ReadSessionHistoryDetailInput,
  repository: SessionHistoryRepository = defaultSessionHistoryRepository,
): Promise<SessionHistoryDetailResponse> {
  const sessionId = normalizeSessionHistorySessionId(input.sessionId);

  if (!sessionId) {
    return sessionHistoryFailure("session_not_found");
  }

  const detail = await repository.getOwnedSessionHistoryDetail(context, sessionId);

  if (!detail.ok) {
    return sessionHistoryFailure(mapSessionDataCode(detail.error.code));
  }

  const safeDetail = toSessionHistoryDetail(detail.data);

  if (!safeDetail) {
    return sessionHistoryFailure("session_not_found");
  }

  return {
    ok: true,
    type: "session_history_detail",
    detail: safeDetail,
  };
}

export function toSessionHistoryDeleteSuccessResponse(
  deletedSession: DeletedSessionTombstone,
): SessionHistoryDeleteSuccessResponse {
  return {
    ok: true,
    type: "session_history_deleted",
    deletedSession,
  };
}
