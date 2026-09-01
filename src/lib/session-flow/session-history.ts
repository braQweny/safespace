import { getModalityByAvatarId, toSelectedModalityAvatar } from "@/lib/modalities";
import {
  getLatestOwnedSessionSummaryState,
  getOwnedSessionHistoryDetail,
  listOwnedSessionHistoryPage,
  listOwnedSessionSummaryStates,
} from "@/lib/session-data/repository";
import {
  SESSION_HISTORY_PAGE_SIZE,
  type DeletedSessionTombstone,
  type OwnedSessionHistoryDetail,
  type OwnedSessionHistoryPage,
  type SessionDataContext,
  type SessionHistoryDetail,
  type SessionHistoryListItem,
  type SessionHistoryMessage,
  type SessionId,
  type SessionMessageRecord,
  type SessionMetadata,
  type SessionSummaryStateKind,
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
  getLatestOwnedSessionSummaryState: typeof getLatestOwnedSessionSummaryState;
  listOwnedSessionSummaryStates: typeof listOwnedSessionSummaryStates;
}

export interface ReadSessionHistoryListInput {
  avatar: unknown;
  page: unknown;
}

export interface ReadSessionHistoryDetailInput {
  sessionId: unknown;
}

type PageParseResult = { ok: true; page: number } | { ok: false; code: "invalid_page" };

/**
 * Upper bound for the `page` query. With `SESSION_HISTORY_PAGE_SIZE` rows per
 * page no real account gets anywhere near it; it exists so an arbitrary
 * number cannot turn into an arbitrary `OFFSET` in the repository query.
 */
export const MAX_SESSION_HISTORY_PAGE = 1000;

const defaultSessionHistoryRepository: SessionHistoryRepository = {
  listOwnedSessionHistoryPage,
  getOwnedSessionHistoryDetail,
  getLatestOwnedSessionSummaryState,
  listOwnedSessionSummaryStates,
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

  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_SESSION_HISTORY_PAGE) {
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

function hasActiveSessionExpired(session: SessionMetadata, now: Date) {
  if (session.status !== "active" || !session.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(session.expiresAt);

  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
}

function getEffectiveHistoryStatus(session: SessionMetadata, now: Date): SessionHistoryListItem["status"] {
  if (session.status === "deleted") {
    return "expired";
  }

  return hasActiveSessionExpired(session, now) ? "expired" : session.status;
}

export function toSessionHistoryListItem(
  session: SessionMetadata,
  now: Date = new Date(),
  summaryState: SessionSummaryStateKind = "none",
): SessionHistoryListItem | null {
  if (session.status === "deleted") {
    return null;
  }

  return {
    id: session.id,
    status: getEffectiveHistoryStatus(session, now),
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    expiresAt: session.expiresAt,
    durationBucketSeconds: session.durationBucketSeconds,
    isTrial: session.isTrial,
    summaryState,
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

function toSessionHistoryDetail(
  detail: OwnedSessionHistoryDetail,
  summary: SessionHistoryDetail["summary"],
): SessionHistoryDetail | null {
  const session = toSessionHistoryListItem(detail.session, new Date(), summary.kind);

  if (!session) {
    return null;
  }

  return {
    session,
    messages: [...detail.messages].sort(compareMessagesBySequence).map(toSessionHistoryMessage),
    summary,
  };
}

function toSessionHistoryListResponse(
  page: OwnedSessionHistoryPage,
  avatar: NonNullable<ReturnType<typeof getModalityByAvatarId>>,
  summaryStates: ReadonlyMap<SessionId, SessionSummaryStateKind>,
): SessionHistoryListResponse {
  const now = new Date();

  return {
    ok: true,
    type: "session_history_list",
    avatar: toSelectedModalityAvatar(avatar),
    items: page.sessions
      .map((session) => toSessionHistoryListItem(session, now, summaryStates.get(session.id) ?? "none"))
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

  // Znacznik „przechodzi dalej” jest dodatkiem do listy, nie jej warunkiem:
  // nieudany odczyt stanów podsumowań gasi znaczniki, ale nie zabiera
  // użytkownikowi całej historii.
  const summaryStates = await repository.listOwnedSessionSummaryStates(
    context,
    history.data.sessions.map((session) => session.id),
  );

  return toSessionHistoryListResponse(history.data, avatar, summaryStates.ok ? summaryStates.data : new Map());
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

  const summary = await repository.getLatestOwnedSessionSummaryState(context, sessionId);

  if (!summary.ok) {
    return sessionHistoryFailure(mapSessionDataCode(summary.error.code));
  }

  const safeDetail = toSessionHistoryDetail(detail.data, summary.data);

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
