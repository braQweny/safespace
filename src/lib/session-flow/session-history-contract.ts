import type {
  DeletedSessionTombstone,
  SessionHistoryDetail,
  SessionHistoryListItem,
  SessionHistoryPagination,
} from "@/lib/session-data/types";
import type { SelectedModalityAvatar } from "@/lib/modalities";

export type SessionHistoryFailureCode =
  | "missing_auth"
  | "invalid_avatar"
  | "invalid_page"
  | "session_not_found"
  | "read_failed"
  | "delete_failed"
  | "session_data_unavailable"
  | "account_blocked"
  | "account_access_unavailable";

export interface SessionHistoryFailureResponse {
  ok: false;
  type: "session_history_error";
  code: SessionHistoryFailureCode;
}

export interface SessionHistoryListSuccessResponse {
  ok: true;
  type: "session_history_list";
  avatar: SelectedModalityAvatar;
  items: SessionHistoryListItem[];
  pagination: SessionHistoryPagination;
}

export interface SessionHistoryDetailSuccessResponse {
  ok: true;
  type: "session_history_detail";
  detail: SessionHistoryDetail;
}

export interface SessionHistoryDeleteSuccessResponse {
  ok: true;
  type: "session_history_deleted";
  deletedSession: DeletedSessionTombstone;
}

export type SessionHistoryListResponse = SessionHistoryListSuccessResponse | SessionHistoryFailureResponse;
export type SessionHistoryDetailResponse = SessionHistoryDetailSuccessResponse | SessionHistoryFailureResponse;
export type SessionHistoryDeleteResponse = SessionHistoryDeleteSuccessResponse | SessionHistoryFailureResponse;

export function sessionHistoryFailure(code: SessionHistoryFailureCode): SessionHistoryFailureResponse {
  return {
    ok: false,
    type: "session_history_error",
    code,
  };
}

function isResponseRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSessionHistoryListSuccess(value: unknown): value is SessionHistoryListSuccessResponse {
  return isResponseRecord(value) && value.ok === true && value.type === "session_history_list";
}

export function isSessionHistoryDetailSuccess(value: unknown): value is SessionHistoryDetailSuccessResponse {
  return isResponseRecord(value) && value.ok === true && value.type === "session_history_detail";
}

export function isSessionHistoryDeleteSuccess(value: unknown): value is SessionHistoryDeleteSuccessResponse {
  return isResponseRecord(value) && value.ok === true && value.type === "session_history_deleted";
}

export function isSessionHistoryFailure(value: unknown): value is SessionHistoryFailureResponse {
  return (
    isResponseRecord(value) &&
    value.ok === false &&
    value.type === "session_history_error" &&
    typeof value.code === "string"
  );
}
