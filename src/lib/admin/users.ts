import { adminError, adminOk, type AdminResult } from "./errors";
import { writeAdminAuditEvent, type WriteAdminAuditEventInput } from "./audit";
import type {
  AdminBlockReasonCode,
  AdminContext,
  AdminUserBlockInput,
  AdminUserBlockResult,
  AdminUserId,
  AdminUserListFilters,
  AdminUserListItem,
  AdminUserListResult,
  AdminUserSort,
  AdminUserStatusFilter,
  SafeAdminUserProfile,
} from "./types";

const ADMIN_USER_PROFILE_SELECT =
  "user_id,email,account_created_at,last_sign_in_at,last_activity_at,blocked_at,blocked_by,block_reason_code,created_at,updated_at";

const STATUS_FILTERS = ["all", "active", "blocked"] as const;
const USER_SORTS = ["created_desc", "created_asc", "last_activity_desc", "last_activity_asc"] as const;
const BLOCK_REASON_CODES = ["policy_violation", "safety_risk", "abuse_prevention", "owner_request", "other"] as const;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

interface RpcResult {
  data: unknown;
  error: unknown;
}

interface AdminUserRow {
  user_id: AdminUserId;
  email: string;
  account_created_at: string;
  last_sign_in_at: string | null;
  last_activity_at: string | null;
  blocked_at: string | null;
  blocked_by: AdminUserId | null;
  block_reason_code: AdminBlockReasonCode | null;
  created_at?: string;
  updated_at?: string;
  total_sessions: number | string;
  active_sessions: number | string;
  completed_sessions: number | string;
  approved_summaries: number | string;
  total_count: number | string;
}

interface AdminUserProfileRow {
  user_id: AdminUserId;
  email: string;
  account_created_at: string;
  last_sign_in_at: string | null;
  last_activity_at: string | null;
  blocked_at: string | null;
  blocked_by: AdminUserId | null;
  block_reason_code: AdminBlockReasonCode | null;
  created_at: string;
  updated_at: string;
}

interface AdminUserMutationRepository {
  updateBlockState: typeof updateAdminUserProfileBlockState;
  writeAuditEvent: typeof writeAdminAuditEvent;
}

const defaultAdminUserMutationRepository: AdminUserMutationRepository = {
  updateBlockState: updateAdminUserProfileBlockState,
  writeAuditEvent: writeAdminAuditEvent,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRpcResult(value: unknown): RpcResult | null {
  if (!isRecord(value) || !("data" in value) || !("error" in value)) {
    return null;
  }

  return {
    data: value.data,
    error: value.error,
  };
}

function toCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }

  return 0;
}

function isStatusFilter(value: string): value is AdminUserStatusFilter {
  return STATUS_FILTERS.includes(value as AdminUserStatusFilter);
}

function isUserSort(value: string): value is AdminUserSort {
  return USER_SORTS.includes(value as AdminUserSort);
}

function isBlockReasonCode(value: string): value is AdminBlockReasonCode {
  return BLOCK_REASON_CODES.includes(value as AdminBlockReasonCode);
}

function normalizePage(value: string | null) {
  const parsed = value ? Number(value) : 1;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function normalizePageSize(value: string | null) {
  const parsed = value ? Number(value) : DEFAULT_PAGE_SIZE;

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(parsed, MAX_PAGE_SIZE);
}

function coerceUserRow(value: unknown): AdminUserRow | null {
  if (!isRecord(value) || typeof value.user_id !== "string" || typeof value.email !== "string") {
    return null;
  }

  return value as unknown as AdminUserRow;
}

function coerceProfileRow(value: unknown): AdminUserProfileRow | null {
  if (!isRecord(value) || typeof value.user_id !== "string" || typeof value.email !== "string") {
    return null;
  }

  return value as unknown as AdminUserProfileRow;
}

function mapProfile(row: AdminUserProfileRow): SafeAdminUserProfile {
  return {
    userId: row.user_id,
    email: row.email,
    accountCreatedAt: row.account_created_at,
    lastSignInAt: row.last_sign_in_at,
    lastActivityAt: row.last_activity_at,
    blockedAt: row.blocked_at,
    blockedBy: row.blocked_by,
    blockReasonCode: row.block_reason_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapUserRow(row: AdminUserRow): AdminUserListItem {
  const profile = mapProfile({
    user_id: row.user_id,
    email: row.email,
    account_created_at: row.account_created_at,
    last_sign_in_at: row.last_sign_in_at,
    last_activity_at: row.last_activity_at,
    blocked_at: row.blocked_at,
    blocked_by: row.blocked_by,
    block_reason_code: row.block_reason_code,
    created_at: row.created_at ?? row.account_created_at,
    updated_at: row.updated_at ?? row.account_created_at,
  });

  return {
    profile,
    accountStatus: profile.blockedAt ? "blocked" : "active",
    counters: {
      totalSessions: toCount(row.total_sessions),
      activeSessions: toCount(row.active_sessions),
      completedSessions: toCount(row.completed_sessions),
      approvedSummaries: toCount(row.approved_summaries),
    },
  };
}

export function parseAdminUserListFilters(params: URLSearchParams): AdminResult<AdminUserListFilters> {
  const emailSearch = (params.get("q") ?? "").trim().slice(0, 120);
  const status = params.get("status") ?? "all";
  const sort = params.get("sort") ?? "created_desc";

  if (!isStatusFilter(status) || !isUserSort(sort)) {
    return adminError("invalid_filter");
  }

  return adminOk({
    emailSearch,
    status,
    sort,
    page: normalizePage(params.get("page")),
    pageSize: normalizePageSize(params.get("pageSize")),
  });
}

export function parseAdminUserBlockInput(
  targetUserId: string | undefined,
  body: unknown,
): AdminResult<AdminUserBlockInput> {
  if (!targetUserId || !isRecord(body)) {
    return adminError("invalid_filter");
  }

  const action = body.action;
  const reasonCode = body.reasonCode;

  if (
    (action !== "block" && action !== "unblock") ||
    typeof reasonCode !== "string" ||
    !isBlockReasonCode(reasonCode)
  ) {
    return adminError("invalid_filter");
  }

  return adminOk({
    targetUserId,
    action,
    reasonCode,
  });
}

export function toAdminUserListResult(
  filters: AdminUserListFilters,
  rows: readonly AdminUserRow[],
): AdminUserListResult {
  const totalCount = rows.length > 0 ? toCount(rows[0]?.total_count) : 0;

  return {
    filters,
    users: rows.map(mapUserRow),
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalCount,
      hasNextPage: filters.page * filters.pageSize < totalCount,
      hasPreviousPage: filters.page > 1,
    },
  };
}

export async function listAdminUsers(
  context: AdminContext,
  filters: AdminUserListFilters,
): Promise<AdminResult<AdminUserListResult>> {
  const result = readRpcResult(
    await context.supabase.rpc("list_private_admin_users", {
      input_email_search: filters.emailSearch || null,
      input_status_filter: filters.status,
      input_sort: filters.sort,
      input_page: filters.page,
      input_page_size: filters.pageSize,
    }),
  );

  if (!result || result.error) {
    return adminError("admin_data_unavailable");
  }

  const rows = Array.isArray(result.data) ? result.data.map(coerceUserRow).filter((row) => row !== null) : [];

  return adminOk(toAdminUserListResult(filters, rows));
}

async function updateAdminUserProfileBlockState(
  context: AdminContext,
  input: AdminUserBlockInput,
): Promise<AdminResult<AdminUserListItem>> {
  const patch =
    input.action === "block"
      ? {
          blocked_at: new Date().toISOString(),
          blocked_by: context.user.id,
          block_reason_code: input.reasonCode,
        }
      : {
          blocked_at: null,
          blocked_by: null,
          block_reason_code: null,
        };

  const { data, error } = await context.supabase
    .from("admin_user_profiles")
    .update(patch)
    .eq("user_id", input.targetUserId)
    .select(ADMIN_USER_PROFILE_SELECT)
    .maybeSingle();

  if (error) {
    return adminError("write_failed");
  }

  const row = coerceProfileRow(data);

  if (!row) {
    return adminError("target_not_found");
  }

  const profile = mapProfile(row);

  return adminOk({
    profile,
    accountStatus: profile.blockedAt ? "blocked" : "active",
    counters: {
      totalSessions: 0,
      activeSessions: 0,
      completedSessions: 0,
      approvedSummaries: 0,
    },
  });
}

function getAuditInput(input: AdminUserBlockInput): WriteAdminAuditEventInput {
  return {
    targetUserId: input.targetUserId,
    action: input.action === "block" ? "account_blocked" : "account_unblocked",
    reasonCode: input.reasonCode,
  };
}

export async function setAdminUserBlockState(
  context: AdminContext,
  input: AdminUserBlockInput,
  repository: AdminUserMutationRepository = defaultAdminUserMutationRepository,
): Promise<AdminResult<AdminUserBlockResult>> {
  const user = await repository.updateBlockState(context, input);

  if (!user.ok) {
    return user;
  }

  const auditEvent = await repository.writeAuditEvent(context, getAuditInput(input));

  if (!auditEvent.ok) {
    return auditEvent;
  }

  return adminOk({
    user: user.data,
    auditEvent: auditEvent.data,
  });
}
