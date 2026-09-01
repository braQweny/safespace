import type { AstroCookies } from "astro";
import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase";
import type { AccountPlan, SessionLifecycleStatus } from "@/lib/session-data/types";

export type AdminSupabaseClient = NonNullable<ReturnType<typeof createClient>>;

export type AdminUserId = string;

export type AccountStatus = "active" | "blocked";

export type { AccountPlan };

export type AdminBlockReasonCode = "policy_violation" | "safety_risk" | "abuse_prevention" | "owner_request" | "other";

/**
 * Why a plan changed. There is no payment provider yet, so "paid" is an
 * admin-confirmed fact (e.g. a manual transfer), not a webhook.
 */
export type AdminPlanReasonCode = "subscription_paid" | "subscription_ended" | "owner_request" | "other";

export type AdminAuditReasonCode = AdminBlockReasonCode | AdminPlanReasonCode;

export type AdminAuditEventType = "account_blocked" | "account_unblocked" | "premium_granted" | "premium_revoked";

export interface AdminRouteContext {
  request: Request;
  cookies: AstroCookies;
  locals: App.Locals;
}

export interface AccountAccessState {
  userId: AdminUserId;
  status: AccountStatus;
  blockedAt: string | null;
  blockReasonCode: AdminBlockReasonCode | null;
  plan: AccountPlan;
  premiumGrantedAt: string | null;
}

export interface AdminContext {
  supabase: AdminSupabaseClient;
  user: {
    id: AdminUserId;
    email: User["email"] | null;
  };
  account: AccountAccessState;
}

export interface SafeAdminUserProfile {
  userId: AdminUserId;
  email: string;
  accountCreatedAt: string;
  lastSignInAt: string | null;
  lastActivityAt: string | null;
  blockedAt: string | null;
  blockedBy: AdminUserId | null;
  blockReasonCode: AdminBlockReasonCode | null;
  premiumGrantedAt: string | null;
  premiumGrantedBy: AdminUserId | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditEvent {
  id: string;
  adminUserId: AdminUserId;
  /** Null once the target account has been deleted (the audit row outlives it). */
  targetUserId: AdminUserId | null;
  action: AdminAuditEventType;
  reasonCode: AdminAuditReasonCode;
  createdAt: string;
}

export interface PrivacySafeCount {
  value: number | null;
  isSuppressed: boolean;
  label: string;
}

export interface AdminOverviewMetrics {
  totalUsers: number;
  blockedUsers: number;
  premiumUsers: number;
  sessionsByLifecycle: Partial<Record<SessionLifecycleStatus, PrivacySafeCount>>;
  activeSessions: PrivacySafeCount;
  completedSessions: PrivacySafeCount;
  trialSessions: PrivacySafeCount;
  followUpSessions: PrivacySafeCount;
  approvedSummaries: PrivacySafeCount;
}

export type AdminUserStatusFilter = "all" | "active" | "blocked";
export type AdminUserPlanFilter = "all" | "free" | "premium";
export type AdminUserSort = "created_desc" | "created_asc" | "last_activity_desc" | "last_activity_asc";

export interface AdminUserListFilters {
  emailSearch: string;
  status: AdminUserStatusFilter;
  plan: AdminUserPlanFilter;
  sort: AdminUserSort;
  page: number;
  pageSize: number;
}

export interface AdminUserSessionCounters {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  approvedSummaries: number;
}

export interface AdminUserListItem {
  profile: SafeAdminUserProfile;
  accountStatus: AccountStatus;
  plan: AccountPlan;
  counters: AdminUserSessionCounters;
}

export interface AdminUserListPagination {
  page: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface AdminUserListResult {
  filters: AdminUserListFilters;
  users: AdminUserListItem[];
  pagination: AdminUserListPagination;
}

export type AdminUserBlockAction = "block" | "unblock";

export interface AdminUserBlockInput {
  targetUserId: AdminUserId;
  action: AdminUserBlockAction;
  reasonCode: AdminBlockReasonCode;
}

export interface AdminUserBlockResult {
  user: AdminUserListItem;
  auditEvent: AdminAuditEvent;
}

export type AdminUserPlanAction = "grant" | "revoke";

export interface AdminUserPlanInput {
  targetUserId: AdminUserId;
  action: AdminUserPlanAction;
  reasonCode: AdminPlanReasonCode;
}

export interface AdminUserPlanResult {
  user: AdminUserListItem;
  auditEvent: AdminAuditEvent;
}
