import type { AdminAuditEvent, AdminAuditEventType, AdminAuditReasonCode, AdminUserId } from "./types";
import { isRecord } from "@/lib/type-guards";

export interface AdminAuditEventRow {
  id: string;
  admin_user_id: AdminUserId;
  target_user_id: AdminUserId;
  action: AdminAuditEventType;
  reason_code: AdminAuditReasonCode;
  created_at: string;
}

export function coerceAuditEventRow(value: unknown): AdminAuditEventRow | null {
  return isRecord(value) && typeof value.id === "string" ? (value as unknown as AdminAuditEventRow) : null;
}

export function mapAdminAuditEvent(row: AdminAuditEventRow): AdminAuditEvent {
  return {
    id: row.id,
    adminUserId: row.admin_user_id,
    targetUserId: row.target_user_id,
    action: row.action,
    reasonCode: row.reason_code,
    createdAt: row.created_at,
  };
}
