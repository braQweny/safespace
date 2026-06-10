import { adminError, adminOk, type AdminResult } from "./errors";
import type { AdminAuditEvent, AdminAuditEventType, AdminBlockReasonCode, AdminContext, AdminUserId } from "./types";
import { isRecord } from "@/lib/type-guards";

const AUDIT_EVENT_SELECT = "id,admin_user_id,target_user_id,action,reason_code,created_at";

interface AdminAuditEventRow {
  id: string;
  admin_user_id: AdminUserId;
  target_user_id: AdminUserId;
  action: AdminAuditEventType;
  reason_code: AdminBlockReasonCode;
  created_at: string;
}

export interface WriteAdminAuditEventInput {
  targetUserId: AdminUserId;
  action: AdminAuditEventType;
  reasonCode: AdminBlockReasonCode;
}

function coerceAuditEventRow(value: unknown): AdminAuditEventRow | null {
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

export async function writeAdminAuditEvent(
  context: AdminContext,
  input: WriteAdminAuditEventInput,
): Promise<AdminResult<AdminAuditEvent>> {
  const { data, error } = await context.supabase
    .from("admin_audit_events")
    .insert({
      admin_user_id: context.user.id,
      target_user_id: input.targetUserId,
      action: input.action,
      reason_code: input.reasonCode,
    })
    .select(AUDIT_EVENT_SELECT)
    .single();

  if (error) {
    return adminError("write_failed");
  }

  const row = coerceAuditEventRow(data);
  return row ? adminOk(mapAdminAuditEvent(row)) : adminError("write_failed");
}
