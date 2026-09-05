import { coerceAuditEventRow, mapAdminAuditEvent } from "./audit";
import { adminError, adminOk, getStableAdminSupabaseErrorCode, type AdminResult } from "./errors";
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

const STATUS_FILTERS = ["all", "active", "blocked"] as const;
const PLAN_FILTERS = ["all", "free", "premium"] as const;
const USER_SORTS = ["created_desc", "created_asc", "last_activity_desc", "last_activity_asc"] as const;
const BLOCK_REASON_CODES = ["policy_violation", "safety_risk", "abuse_prevention", "owner_request", "other"] as const;
const PLAN_REASON_CODES = ["subscription_paid", "subscription_ended", "owner_request", "other"] as const;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// `auth.users.id` is a Postgres uuid. Anything else can never name an account,
// so it is refused up front as `target_not_found` instead of reaching the RPC
// (where a malformed uuid surfaces as a cast error and would map to
// `write_failed`, the wrong status).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  effective_premium?: boolean;
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
  effective_premium?: boolean;
  premium_granted_by?: AdminUserId | null;
  created_at: string;
  updated_at: string;
}

interface AdminUserMutationRepository {
  mutateBlockState: typeof mutateAdminUserBlockState;
  mutatePlanState: typeof mutateAdminUserPlanState;
}

const defaultAdminUserMutationRepository: AdminUserMutationRepository = {
  mutateBlockState: mutateAdminUserBlockState,
  mutatePlanState: mutateAdminUserPlanState,
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

function parseTargetUserId(value: string | undefined): AdminUserId | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return UUID_PATTERN.test(trimmed) ? trimmed : null;
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

function toListItem(
  profile: SafeAdminUserProfile,
  counters: AdminUserListItem["counters"],
  effectivePremium = false,
): AdminUserListItem {
  return {
    profile,
    accountStatus: profile.blockedAt ? "blocked" : "active",
    plan: effectivePremium || profile.premiumGrantedAt ? "premium" : "free",
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

  return toListItem(
    profile,
    {
      totalSessions: toCount(row.total_sessions),
      activeSessions: toCount(row.active_sessions),
      completedSessions: toCount(row.completed_sessions),
      approvedSummaries: toCount(row.approved_summaries),
    },
    row.effective_premium === true,
  );
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
  const parsedTargetUserId = parseTargetUserId(targetUserId);

  if (!parsedTargetUserId) {
    return adminError("target_not_found");
  }

  if (!isRecord(body)) {
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
    targetUserId: parsedTargetUserId,
    action,
    reasonCode,
  });
}

export function parseAdminUserPlanInput(
  targetUserId: string | undefined,
  body: unknown,
): AdminResult<AdminUserPlanInput> {
  const parsedTargetUserId = parseTargetUserId(targetUserId);

  if (!parsedTargetUserId) {
    return adminError("target_not_found");
  }

  if (!isRecord(body)) {
    return adminError("invalid_filter");
  }

  const action = body.action;
  const reasonCode = body.reasonCode;

  if ((action !== "grant" && action !== "revoke") || typeof reasonCode !== "string" || !isPlanReasonCode(reasonCode)) {
    return adminError("invalid_filter");
  }

  return adminOk({
    targetUserId: parsedTargetUserId,
    action,
    reasonCode,
  });
}

/**
 * An admin never acts on their own account: self-block would lock the panel
 * behind the very admin who could lift it, and self-granted premium has no
 * second pair of eyes. Checked here, in front of both mutations, so every
 * route answers with the same stable code before any write.
 */
function isSelfTarget(context: AdminContext, targetUserId: AdminUserId) {
  return context.user.id === targetUserId;
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
    await context.supabase.rpc("list_private_admin_users_v2", {
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

function mapAtomicAdminUserMutation(value: unknown): AdminUserBlockResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const profile = coerceProfileRow(value.profile);
  const auditEvent = coerceAuditEventRow(value.auditEvent);

  if (!profile || !auditEvent) {
    return null;
  }

  return {
    user: toListItem(mapProfile(profile), EMPTY_COUNTERS, profile.effective_premium === true),
    auditEvent: mapAdminAuditEvent(auditEvent),
  };
}

function adminMutationFailure(error: unknown) {
  return adminError(getStableAdminSupabaseErrorCode(error) === "P0002" ? "target_not_found" : "write_failed");
}

async function mutateAdminUserBlockState(
  context: AdminContext,
  input: AdminUserBlockInput,
): Promise<AdminResult<AdminUserBlockResult>> {
  const result = readRpcResult(
    await context.supabase.rpc("set_private_admin_user_block_state", {
      input_target_user_id: input.targetUserId,
      input_action: input.action,
      input_reason_code: input.reasonCode,
    }),
  );

  if (!result || result.error) {
    return adminMutationFailure(result?.error);
  }

  const mutation = mapAtomicAdminUserMutation(result.data);
  return mutation ? adminOk(mutation) : adminError("write_failed");
}

async function mutateAdminUserPlanState(
  context: AdminContext,
  input: AdminUserPlanInput,
): Promise<AdminResult<AdminUserPlanResult>> {
  const result = readRpcResult(
    await context.supabase.rpc("set_private_admin_user_plan_state", {
      input_target_user_id: input.targetUserId,
      input_action: input.action,
      input_reason_code: input.reasonCode,
    }),
  );

  if (!result || result.error) {
    return adminMutationFailure(result?.error);
  }

  const mutation = mapAtomicAdminUserMutation(result.data);
  return mutation ? adminOk(mutation) : adminError("write_failed");
}

export async function setAdminUserBlockState(
  context: AdminContext,
  input: AdminUserBlockInput,
  repository: Pick<AdminUserMutationRepository, "mutateBlockState"> = defaultAdminUserMutationRepository,
): Promise<AdminResult<AdminUserBlockResult>> {
  if (isSelfTarget(context, input.targetUserId)) {
    return adminError("self_target_forbidden");
  }

  return repository.mutateBlockState(context, input);
}

/**
 * Premium lifts the free-plan session cap (enforced by the database trigger
 * on every session insert). The change is audited like a block/unblock; no
 * private conversation data is touched.
 */
export async function setAdminUserPlanState(
  context: AdminContext,
  input: AdminUserPlanInput,
  repository: Pick<AdminUserMutationRepository, "mutatePlanState"> = defaultAdminUserMutationRepository,
): Promise<AdminResult<AdminUserPlanResult>> {
  if (isSelfTarget(context, input.targetUserId)) {
    return adminError("self_target_forbidden");
  }

  return repository.mutatePlanState(context, input);
}
