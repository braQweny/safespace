import { adminError, adminOk, type AdminResult } from "./errors";
import { writeAdminAuditEvent, type WriteAdminAuditEventInput } from "./audit";
import { isRecord } from "@/lib/type-guards";
import type {
  AdminBlockReasonCode,
  AdminContext,
  AdminPlanReasonCode,
  AdminUserBlockInput,
  AdminUserBlockResult,
  AdminUserId,
  AdminUserListFilters,
  AdminUserListItem,
  AdminUserListResult,
  AdminUserPlanFilter,
  AdminUserPlanInput,
  AdminUserPlanResult,
  AdminUserSort,
  AdminUserStatusFilter,
  SafeAdminUserProfile,
} from "./types";

const ADMIN_USER_PROFILE_SELECT =
  "user_id,email,account_created_at,last_sign_in_at,last_activity_at,blocked_at,blocked_by,block_reason_code,premium_granted_at,premium_granted_by,created_at,updated_at";

const STATUS_FILTERS = ["all", "active", "blocked"] as const;
const PLAN_FILTERS = ["all", "free", "premium"] as const;
const USER_SORTS = ["created_desc", "created_asc", "last_activity_desc", "last_activity_asc"] as const;
const BLOCK_REASON_CODES = ["policy_violation", "safety_risk", "abuse_prevention", "owner_request", "other"] as const;
const PLAN_REASON_CODES = ["subscription_paid", "subscription_ended", "owner_request", "other"] as const;
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
  premium_granted_at?: string | null;
  premium_granted_by?: AdminUserId | null;
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
  premium_granted_at?: string | null;
  premium_granted_by?: AdminUserId | null;
  created_at: string;
  updated_at: string;
}

interface AdminUserMutationRepository {
  updateBlockState: typeof updateAdminUserProfileBlockState;
  updatePlanState: typeof updateAdminUserProfilePlanState;
  writeAuditEvent: typeof writeAdminAuditEvent;
}

const defaultAdminUserMutationRepository: AdminUserMutationRepository = {
  updateBlockState: updateAdminUserProfileBlockState,
  updatePlanState: updateAdminUserProfilePlanState,
  writeAuditEvent: writeAdminAuditEvent,
};

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

function isPlanFilter(value: string): value is AdminUserPlanFilter {
  return PLAN_FILTERS.includes(value as AdminUserPlanFilter);
}

function isUserSort(value: string): value is AdminUserSort {
  return USER_SORTS.includes(value as AdminUserSort);
}

function isBlockReasonCode(value: string): value is AdminBlockReasonCode {
  return BLOCK_REASON_CODES.includes(value as AdminBlockReasonCode);
}

function isPlanReasonCode(value: string): value is AdminPlanReasonCode {
  return PLAN_REASON_CODES.includes(value as AdminPlanReasonCode);
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
    premiumGrantedAt: typeof row.premium_granted_at === "string" ? row.premium_granted_at : null,
    premiumGrantedBy: typeof row.premium_granted_by === "string" ? row.premium_granted_by : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toListItem(profile: SafeAdminUserProfile, counters: AdminUserListItem["counters"]): AdminUserListItem {
  return {
    profile,
    accountStatus: profile.blockedAt ? "blocked" : "active",
    plan: profile.premiumGrantedAt ? "premium" : "free",
    counters,
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
    premium_granted_at: row.premium_granted_at,
    premium_granted_by: row.premium_granted_by,
    created_at: row.created_at ?? row.account_created_at,
    updated_at: row.updated_at ?? row.account_created_at,
  });

  return toListItem(profile, {
    totalSessions: toCount(row.total_sessions),
    activeSessions: toCount(row.active_sessions),
    completedSessions: toCount(row.completed_sessions),
    approvedSummaries: toCount(row.approved_summaries),
  });
}

export function parseAdminUserListFilters(params: URLSearchParams): AdminResult<AdminUserListFilters> {
  const emailSearch = (params.get("q") ?? "").trim().slice(0, 120);
  const status = params.get("status") ?? "all";
  const plan = params.get("plan") ?? "all";
  const sort = params.get("sort") ?? "created_desc";

  if (!isStatusFilter(status) || !isPlanFilter(plan) || !isUserSort(sort)) {
    return adminError("invalid_filter");
  }

  return adminOk({
    emailSearch,
    status,
    plan,
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

export function parseAdminUserPlanInput(
  targetUserId: string | undefined,
  body: unknown,
): AdminResult<AdminUserPlanInput> {
  if (!targetUserId || !isRecord(body)) {
    return adminError("invalid_filter");
  }

  const action = body.action;
  const reasonCode = body.reasonCode;

  if ((action !== "grant" && action !== "revoke") || typeof reasonCode !== "string" || !isPlanReasonCode(reasonCode)) {
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
      input_plan_filter: filters.plan,
    }),
  );

  if (!result || result.error) {
    return adminError("admin_data_unavailable");
  }

  const rows = Array.isArray(result.data) ? result.data.map(coerceUserRow).filter((row) => row !== null) : [];

  return adminOk(toAdminUserListResult(filters, rows));
}

const EMPTY_COUNTERS: AdminUserListItem["counters"] = {
  totalSessions: 0,
  activeSessions: 0,
  completedSessions: 0,
  approvedSummaries: 0,
};

async function updateAdminUserProfile(
  context: AdminContext,
  targetUserId: AdminUserId,
  patch: Record<string, string | null>,
): Promise<AdminResult<AdminUserListItem>> {
  const { data, error } = await context.supabase
    .from("admin_user_profiles")
    .update(patch)
    .eq("user_id", targetUserId)
    .select(ADMIN_USER_PROFILE_SELECT)
    .maybeSingle();

  if (error) {
    return adminError("write_failed");
  }

  const row = coerceProfileRow(data);

  if (!row) {
    return adminError("target_not_found");
  }

  return adminOk(toListItem(mapProfile(row), EMPTY_COUNTERS));
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

  return updateAdminUserProfile(context, input.targetUserId, patch);
}

async function updateAdminUserProfilePlanState(
  context: AdminContext,
  input: AdminUserPlanInput,
): Promise<AdminResult<AdminUserListItem>> {
  const patch =
    input.action === "grant"
      ? {
          premium_granted_at: new Date().toISOString(),
          premium_granted_by: context.user.id,
        }
      : {
          premium_granted_at: null,
          premium_granted_by: null,
        };

  return updateAdminUserProfile(context, input.targetUserId, patch);
}

function getBlockAuditInput(input: AdminUserBlockInput): WriteAdminAuditEventInput {
  return {
    targetUserId: input.targetUserId,
    action: input.action === "block" ? "account_blocked" : "account_unblocked",
    reasonCode: input.reasonCode,
  };
}

function getPlanAuditInput(input: AdminUserPlanInput): WriteAdminAuditEventInput {
  return {
    targetUserId: input.targetUserId,
    action: input.action === "grant" ? "premium_granted" : "premium_revoked",
    reasonCode: input.reasonCode,
  };
}

export async function setAdminUserBlockState(
  context: AdminContext,
  input: AdminUserBlockInput,
  repository: Pick<
    AdminUserMutationRepository,
    "updateBlockState" | "writeAuditEvent"
  > = defaultAdminUserMutationRepository,
): Promise<AdminResult<AdminUserBlockResult>> {
  const user = await repository.updateBlockState(context, input);

  if (!user.ok) {
    return user;
  }

  const auditEvent = await repository.writeAuditEvent(context, getBlockAuditInput(input));

  if (!auditEvent.ok) {
    return auditEvent;
  }

  return adminOk({
    user: user.data,
    auditEvent: auditEvent.data,
  });
}

/**
 * Premium lifts the free-plan session cap (enforced by the database trigger
 * on every session insert). The change is audited like a block/unblock; no
 * private conversation data is touched.
 */
export async function setAdminUserPlanState(
  context: AdminContext,
  input: AdminUserPlanInput,
  repository: Pick<
    AdminUserMutationRepository,
    "updatePlanState" | "writeAuditEvent"
  > = defaultAdminUserMutationRepository,
): Promise<AdminResult<AdminUserPlanResult>> {
  const user = await repository.updatePlanState(context, input);

  if (!user.ok) {
    return user;
  }

  const auditEvent = await repository.writeAuditEvent(context, getPlanAuditInput(input));

  if (!auditEvent.ok) {
    return auditEvent;
  }

  return adminOk({
    user: user.data,
    auditEvent: auditEvent.data,
  });
}
