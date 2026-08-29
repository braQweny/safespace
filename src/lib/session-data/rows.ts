/**
 * Internal to session-data: raw Supabase row shapes, select lists, and
 * row → domain mappers shared by the per-entity repository modules.
 * Import from `./repository` outside this directory.
 */
import type {
  DeletedSessionTombstone,
  SessionDeletionReasonCode,
  SessionDurationBucketSeconds,
  SessionId,
  SessionLifecycleStatus,
  SessionMessageRecord,
  SessionMessageRole,
  SessionMetadata,
  SessionSummaryRecord,
  SessionSummaryStatus,
  SessionTrialClaimState,
  TrialClaimId,
  UserId,
} from "./types";

export const SESSION_SELECT =
  "id,user_id,modality_id,avatar_id,status,started_at,ended_at,expires_at,deleted_at,deletion_reason_code,is_trial,trial_claim_id,duration_bucket_seconds,uses_approved_context,created_at,updated_at";
export const HISTORY_SESSION_SELECT = `${SESSION_SELECT},session_messages!inner(id)`;
export const MESSAGE_SELECT = "id,session_id,user_id,role,sequence_index,content,created_at";
export const SUMMARY_SELECT = "id,session_id,user_id,summary_text,status,is_visible,revision,created_at,updated_at";
export const SUMMARY_WITH_SESSION_SELECT = `${SUMMARY_SELECT},therapy_sessions!inner(id,status,deleted_at)`;
/**
 * Celowo bez `summary_text`: ten select obsługuje listę historii, która nie ma
 * prawa zobaczyć treści podsumowania — tylko to, w jakim jest stanie.
 */
export const SUMMARY_STATE_SELECT = "session_id,status,is_visible,revision";
export const TRIAL_CLAIM_SELECT = "id,session_id,user_id,trial_duration_seconds,claimed_at,created_at";

export interface TherapySessionRow {
  id: SessionId;
  user_id: UserId;
  modality_id: SessionMetadata["modalityId"];
  avatar_id: SessionMetadata["avatarId"];
  status: SessionLifecycleStatus;
  started_at: string | null;
  ended_at: string | null;
  expires_at: string | null;
  deleted_at: string | null;
  deletion_reason_code: SessionDeletionReasonCode | null;
  is_trial: boolean;
  trial_claim_id: TrialClaimId | null;
  duration_bucket_seconds: SessionDurationBucketSeconds | null;
  uses_approved_context: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionMessageRow {
  id: string;
  session_id: SessionId;
  user_id: UserId;
  role: SessionMessageRole;
  sequence_index: number;
  content: string;
  created_at: string;
}

export interface SessionSummaryRow {
  id: string;
  session_id: SessionId;
  user_id: UserId;
  summary_text: string;
  status: SessionSummaryStatus;
  is_visible: boolean;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface SessionSummaryStateRow {
  session_id: SessionId;
  status: SessionSummaryStatus;
  is_visible: boolean;
  revision: number;
}

export interface SessionTrialClaimRow {
  id: TrialClaimId;
  session_id: SessionId;
  user_id: UserId;
  trial_duration_seconds: 900;
  claimed_at: string;
  created_at: string;
}

export function isRecord(value: unknown) {
  return value !== null && typeof value === "object";
}

export function coerceSessionRow(value: unknown): TherapySessionRow | null {
  return isRecord(value) ? (value as TherapySessionRow) : null;
}

export function coerceSessionRows(value: unknown): TherapySessionRow[] {
  return Array.isArray(value) ? value.map(coerceSessionRow).filter((row) => row !== null) : [];
}

export function coerceMessageRow(value: unknown): SessionMessageRow | null {
  return isRecord(value) ? (value as SessionMessageRow) : null;
}

export function coerceMessageRows(value: unknown): SessionMessageRow[] {
  return Array.isArray(value) ? value.map(coerceMessageRow).filter((row) => row !== null) : [];
}

export function coerceSummaryRow(value: unknown): SessionSummaryRow | null {
  return isRecord(value) ? (value as SessionSummaryRow) : null;
}

export function coerceSummaryRows(value: unknown): SessionSummaryRow[] {
  return Array.isArray(value) ? value.map(coerceSummaryRow).filter((row) => row !== null) : [];
}

export function coerceSummaryStateRow(value: unknown): SessionSummaryStateRow | null {
  return isRecord(value) ? (value as SessionSummaryStateRow) : null;
}

export function coerceSummaryStateRows(value: unknown): SessionSummaryStateRow[] {
  return Array.isArray(value) ? value.map(coerceSummaryStateRow).filter((row) => row !== null) : [];
}

export function coerceTrialClaimRow(value: unknown): SessionTrialClaimRow | null {
  return isRecord(value) ? (value as SessionTrialClaimRow) : null;
}

export function mapSession(row: TherapySessionRow): SessionMetadata {
  return {
    id: row.id,
    userId: row.user_id,
    modalityId: row.modality_id,
    avatarId: row.avatar_id,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    expiresAt: row.expires_at,
    deletedAt: row.deleted_at,
    deletionReasonCode: row.deletion_reason_code,
    isTrial: row.is_trial,
    trialClaimId: row.trial_claim_id,
    durationBucketSeconds: row.duration_bucket_seconds,
    // The column is `not null default true`, so a row written before the flag
    // existed still reports the previous carry-over behaviour.
    usesApprovedContext: row.uses_approved_context,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMessage(row: SessionMessageRow): SessionMessageRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    role: row.role,
    sequenceIndex: row.sequence_index,
    content: row.content,
    createdAt: row.created_at,
  };
}

export function mapSummary(row: SessionSummaryRow): SessionSummaryRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    summaryText: row.summary_text,
    status: row.status,
    isVisible: row.is_visible,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTrialClaim(row: SessionTrialClaimRow): SessionTrialClaimState {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    trialDurationSeconds: row.trial_duration_seconds,
    claimedAt: row.claimed_at,
    createdAt: row.created_at,
  };
}

export function toDeletedSessionTombstone(session: SessionMetadata): DeletedSessionTombstone | null {
  if (session.status !== "deleted" || !session.deletedAt || !session.deletionReasonCode) {
    return null;
  }

  return {
    id: session.id,
    userId: session.userId,
    status: "deleted",
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    expiresAt: session.expiresAt,
    deletedAt: session.deletedAt,
    deletionReasonCode: session.deletionReasonCode,
    isTrial: session.isTrial,
    trialClaimId: session.trialClaimId,
    durationBucketSeconds: session.durationBucketSeconds,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}
