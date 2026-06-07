import type { SessionLifecycleStatus } from "@/lib/session-data/types";
import { adminError, adminOk, type AdminResult } from "./errors";
import { segmentPrivacyCount } from "./privacy-counts";
import type { AdminContext, AdminOverviewMetrics, PrivacySafeCount } from "./types";

const SESSION_STATUSES = ["created", "active", "completed", "expired", "interrupted", "deleted"] as const;

type RawOverviewRecord = Record<string, unknown>;

interface RpcResult {
  data: unknown;
  error: unknown;
}

function isRecord(value: unknown): value is RawOverviewRecord {
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

function mapLifecycleCounts(value: unknown): Partial<Record<SessionLifecycleStatus, PrivacySafeCount>> {
  if (!isRecord(value)) {
    return {};
  }

  return SESSION_STATUSES.reduce<Partial<Record<SessionLifecycleStatus, PrivacySafeCount>>>((counts, status) => {
    if (status in value) {
      counts[status] = segmentPrivacyCount(toCount(value[status]));
    }

    return counts;
  }, {});
}

export function mapAdminOverviewMetrics(value: unknown): AdminResult<AdminOverviewMetrics> {
  if (!isRecord(value)) {
    return adminError("admin_data_unavailable");
  }

  return adminOk({
    totalUsers: toCount(value.totalUsers),
    blockedUsers: toCount(value.blockedUsers),
    sessionsByLifecycle: mapLifecycleCounts(value.sessionsByLifecycle),
    activeSessions: segmentPrivacyCount(toCount(value.activeSessions)),
    completedSessions: segmentPrivacyCount(toCount(value.completedSessions)),
    trialSessions: segmentPrivacyCount(toCount(value.trialSessions)),
    followUpSessions: segmentPrivacyCount(toCount(value.followUpSessions)),
    approvedSummaries: segmentPrivacyCount(toCount(value.approvedSummaries)),
  });
}

export async function readAdminOverviewMetrics(context: AdminContext): Promise<AdminResult<AdminOverviewMetrics>> {
  const result = readRpcResult(await context.supabase.rpc("get_private_admin_overview"));

  if (!result || result.error) {
    return adminError("admin_data_unavailable");
  }

  return mapAdminOverviewMetrics(result.data);
}
