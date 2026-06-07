import type { AstroCookies } from "astro";
import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase";

export type AdminSupabaseClient = NonNullable<ReturnType<typeof createClient>>;

export type AdminUserId = string;

export type AccountStatus = "active" | "blocked";

export type AdminBlockReasonCode = "policy_violation" | "safety_risk" | "abuse_prevention" | "owner_request" | "other";

export type AdminAuditEventType = "account_blocked" | "account_unblocked";

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
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditEvent {
  id: string;
  adminUserId: AdminUserId;
  targetUserId: AdminUserId;
  action: AdminAuditEventType;
  reasonCode: AdminBlockReasonCode;
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
  activeSessions: PrivacySafeCount;
  completedSessions: PrivacySafeCount;
  trialSessions: PrivacySafeCount;
  followUpSessions: PrivacySafeCount;
  approvedSummaries: PrivacySafeCount;
}

export type AdminUserStatusFilter = "all" | "active" | "blocked";
export type AdminUserSort = "created_desc" | "created_asc" | "last_activity_desc" | "last_activity_asc";

export interface AdminUserListFilters {
  emailSearch: string;
  status: AdminUserStatusFilter;
  sort: AdminUserSort;
  page: number;
  pageSize: number;
}
