import type { AdminErrorCode } from "./errors";
import type { AdminOverviewMetrics, AdminUserBlockResult, AdminUserListResult } from "./types";

export type AdminApiFailureCode =
  | AdminErrorCode
  | "missing_auth"
  | "not_admin"
  | "blocked_admin"
  | "target_not_found"
  | "invalid_filter"
  | "write_failed"
  | "admin_data_unavailable";

export interface AdminApiFailureResponse {
  ok: false;
  type: "admin_error";
  code: AdminApiFailureCode;
}

export interface AdminOverviewSuccessResponse {
  ok: true;
  type: "admin_overview";
  metrics: AdminOverviewMetrics;
}

export interface AdminUsersSuccessResponse {
  ok: true;
  type: "admin_users";
  result: AdminUserListResult;
}

export interface AdminUserBlockSuccessResponse {
  ok: true;
  type: "admin_user_block";
  result: AdminUserBlockResult;
}

export type AdminOverviewResponse = AdminOverviewSuccessResponse | AdminApiFailureResponse;
export type AdminUsersResponse = AdminUsersSuccessResponse | AdminApiFailureResponse;
export type AdminUserBlockResponse = AdminUserBlockSuccessResponse | AdminApiFailureResponse;
export type AdminApiResponse = AdminOverviewResponse | AdminUsersResponse | AdminUserBlockResponse;

export function adminApiFailure(code: AdminApiFailureCode): AdminApiFailureResponse {
  return {
    ok: false,
    type: "admin_error",
    code,
  };
}

export function getAdminApiFailureStatus(code: AdminApiFailureCode) {
  if (code === "missing_auth") {
    return 401;
  }

  if (code === "not_admin" || code === "blocked_admin") {
    return 403;
  }

  if (code === "invalid_filter") {
    return 400;
  }

  if (code === "target_not_found") {
    return 404;
  }

  if (code === "write_failed") {
    return 409;
  }

  return 503;
}
