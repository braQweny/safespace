import type { LatestSessionSummaryState, SessionSummaryPreview } from "@/lib/session-data/types";

export type SessionSummaryFailureCode =
  | "missing_auth"
  | "session_data_unavailable"
  | "session_not_found"
  | "session_not_summarizable"
  | "summary_unavailable"
  | "generation_failed"
  | "approval_failed"
  | "read_failed"
  | "provider_unavailable"
  | "account_blocked"
  | "account_access_unavailable";

export interface SessionSummaryFailureResponse {
  ok: false;
  type: "session_summary_error";
  code: SessionSummaryFailureCode;
}

export interface SessionSummaryStateSuccessResponse {
  ok: true;
  type: "session_summary_state";
  state: LatestSessionSummaryState;
}

export interface SessionSummaryGeneratedSuccessResponse {
  ok: true;
  type: "session_summary_generated";
  summary: SessionSummaryPreview;
}

export interface SessionSummaryApprovedSuccessResponse {
  ok: true;
  type: "session_summary_approved";
  summary: SessionSummaryPreview;
}

export type SessionSummaryStateResponse = SessionSummaryStateSuccessResponse | SessionSummaryFailureResponse;
export type SessionSummaryGenerateResponse = SessionSummaryGeneratedSuccessResponse | SessionSummaryFailureResponse;
export type SessionSummaryApproveResponse = SessionSummaryApprovedSuccessResponse | SessionSummaryFailureResponse;
export type SessionSummaryResponse =
  SessionSummaryStateResponse | SessionSummaryGenerateResponse | SessionSummaryApproveResponse;

export function sessionSummaryFailure(code: SessionSummaryFailureCode): SessionSummaryFailureResponse {
  return {
    ok: false,
    type: "session_summary_error",
    code,
  };
}

function isResponseRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSessionSummaryGeneratedSuccess(value: unknown): value is SessionSummaryGeneratedSuccessResponse {
  return isResponseRecord(value) && value.ok === true && value.type === "session_summary_generated";
}

export function isSessionSummaryApprovedSuccess(value: unknown): value is SessionSummaryApprovedSuccessResponse {
  return isResponseRecord(value) && value.ok === true && value.type === "session_summary_approved";
}

export function isSessionSummaryFailure(value: unknown): value is SessionSummaryFailureResponse {
  return (
    isResponseRecord(value) &&
    value.ok === false &&
    value.type === "session_summary_error" &&
    typeof value.code === "string"
  );
}
