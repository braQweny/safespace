import type { AdminErrorCode } from "./errors";
import type { AdminOverviewMetrics, AdminUserBlockResult, AdminUserListResult, AdminUserPlanResult } from "./types";

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

export interface AdminUserPlanSuccessResponse {
  ok: true;
  type: "admin_user_plan";
  result: AdminUserPlanResult;
}

export type AdminOverviewResponse = AdminOverviewSuccessResponse | AdminApiFailureResponse;
export type AdminUsersResponse = AdminUsersSuccessResponse | AdminApiFailureResponse;
export type AdminUserBlockResponse = AdminUserBlockSuccessResponse | AdminApiFailureResponse;
export type AdminUserPlanResponse = AdminUserPlanSuccessResponse | AdminApiFailureResponse;
export type AdminApiResponse =
  AdminOverviewResponse | AdminUsersResponse | AdminUserBlockResponse | AdminUserPlanResponse;

export function adminApiFailure(code: AdminApiFailureCode): AdminApiFailureResponse {
  return {
    ok: false,
    type: "admin_error",
    code,
  };
}

function isResponseRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAdminUsersSuccess(value: unknown): value is AdminUsersSuccessResponse {
  return isResponseRecord(value) && value.ok === true && value.type === "admin_users";
}

export function isAdminUserBlockSuccess(value: unknown): value is AdminUserBlockSuccessResponse {
  return isResponseRecord(value) && value.ok === true && value.type === "admin_user_block";
}

export function isAdminUserPlanSuccess(value: unknown): value is AdminUserPlanSuccessResponse {
  return isResponseRecord(value) && value.ok === true && value.type === "admin_user_plan";
}

export function isAdminApiFailure(value: unknown): value is AdminApiFailureResponse {
  return (
    isResponseRecord(value) && value.ok === false && value.type === "admin_error" && typeof value.code === "string"
  );
}

export function getAdminApiFailureStatus(code: AdminApiFailureCode) {
  if (code === "missing_auth") {
    return 401;
  }

  if (code === "not_admin" || code === "blocked_admin") {
    return 403;
  }

  if (code === "invalid_filter" || code === "self_target_forbidden") {
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
