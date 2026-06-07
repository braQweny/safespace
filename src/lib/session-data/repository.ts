import { mapSupabaseReadError, mapSupabaseWriteError, ok, sessionDataError, type SessionDataResult } from "./errors";
import type {
  AppendSessionMessageInput,
  AppendSessionMessagesInput,
  CreatePendingSessionInput,
  DeletedSessionTombstone,
  DeleteOwnedSessionInput,
  ListOwnedSessionHistoryInput,
  ListSessionMetadataOptions,
  ListSessionSummariesOptions,
  OwnedSessionHistoryDetail,
  OwnedSessionHistoryPage,
  SaveVisibleSessionSummaryInput,
  SessionDataContext,
  SessionDeletionReasonCode,
  SessionDurationBucketSeconds,
  SessionId,
  SessionLifecycleStatus,
  SessionMessageRecord,
  SessionMessageRole,
  SessionMetadata,
  SessionSummaryRecord,
  SessionTrialClaimState,
  SessionSummaryStatus,
  TransitionSessionLifecycleInput,
  TrialAvailability,
  TrialClaimId,
  UpdateSessionTombstoneInput,
  UserId,
} from "./types";

const SESSION_SELECT =
  "id,user_id,modality_id,avatar_id,status,started_at,ended_at,expires_at,deleted_at,deletion_reason_code,is_trial,trial_claim_id,duration_bucket_seconds,created_at,updated_at";
const HISTORY_SESSION_SELECT = `${SESSION_SELECT},session_messages!inner(id)`;
const MESSAGE_SELECT = "id,session_id,user_id,role,sequence_index,content,created_at";
const SUMMARY_SELECT = "id,session_id,user_id,summary_text,status,is_visible,revision,created_at,updated_at";
const TRIAL_CLAIM_SELECT = "id,session_id,user_id,trial_duration_seconds,claimed_at,created_at";

interface TherapySessionRow {
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
  created_at: string;
  updated_at: string;
}

interface SessionMessageRow {
  id: string;
  session_id: SessionId;
  user_id: UserId;
  role: SessionMessageRole;
  sequence_index: number;
  content: string;
  created_at: string;
}

interface SessionSummaryRow {
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

interface SessionTrialClaimRow {
  id: TrialClaimId;
  session_id: SessionId;
  user_id: UserId;
  trial_duration_seconds: 900;
  claimed_at: string;
  created_at: string;
}

function isRecord(value: unknown) {
  return value !== null && typeof value === "object";
}

function coerceSessionRow(value: unknown): TherapySessionRow | null {
  return isRecord(value) ? (value as TherapySessionRow) : null;
}

function coerceSessionRows(value: unknown): TherapySessionRow[] {
  return Array.isArray(value) ? value.map(coerceSessionRow).filter((row) => row !== null) : [];
}

function coerceMessageRow(value: unknown): SessionMessageRow | null {
  return isRecord(value) ? (value as SessionMessageRow) : null;
}

function coerceMessageRows(value: unknown): SessionMessageRow[] {
  return Array.isArray(value) ? value.map(coerceMessageRow).filter((row) => row !== null) : [];
}

function coerceSummaryRow(value: unknown): SessionSummaryRow | null {
  return isRecord(value) ? (value as SessionSummaryRow) : null;
}

function coerceSummaryRows(value: unknown): SessionSummaryRow[] {
  return Array.isArray(value) ? value.map(coerceSummaryRow).filter((row) => row !== null) : [];
}

function coerceTrialClaimRow(value: unknown): SessionTrialClaimRow | null {
  return isRecord(value) ? (value as SessionTrialClaimRow) : null;
}

function mapSession(row: TherapySessionRow): SessionMetadata {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: SessionMessageRow): SessionMessageRecord {
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

function mapSummary(row: SessionSummaryRow): SessionSummaryRecord {
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

function mapTrialClaim(row: SessionTrialClaimRow): SessionTrialClaimState {
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

const ALLOWED_TRANSITIONS: Readonly<Record<SessionLifecycleStatus, readonly SessionLifecycleStatus[]>> = {
  created: ["active", "expired", "interrupted", "deleted"],
  active: ["completed", "expired", "interrupted", "deleted"],
  completed: ["deleted"],
  expired: ["deleted"],
  interrupted: ["deleted"],
  deleted: [],
};

export function canTransitionSessionLifecycle(current: SessionLifecycleStatus, next: SessionLifecycleStatus) {
  return ALLOWED_TRANSITIONS[current].includes(next);
}

export async function createPendingSession(
  context: SessionDataContext,
  input: CreatePendingSessionInput = {},
): Promise<SessionDataResult<SessionMetadata>> {
  const { data, error } = await context.supabase
    .from("therapy_sessions")
    .insert({
      user_id: context.user.id,
      modality_id: input.modalityId ?? null,
      avatar_id: input.avatarId ?? null,
      status: "created",
      started_at: input.startedAt ?? null,
      expires_at: input.expiresAt ?? null,
      is_trial: input.isTrial ?? false,
      duration_bucket_seconds: input.durationBucketSeconds ?? null,
    })
    .select(SESSION_SELECT)
    .single();

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error));
  }

  const row = coerceSessionRow(data);
  return row ? ok(mapSession(row)) : sessionDataError("write_failed");
}

export async function listOwnedSessionMetadata(
  context: SessionDataContext,
  options: ListSessionMetadataOptions = {},
): Promise<SessionDataResult<SessionMetadata[]>> {
  let query = context.supabase
    .from("therapy_sessions")
    .select(SESSION_SELECT)
    .eq("user_id", context.user.id)
    .order("created_at", { ascending: false });

  if (!options.includeDeleted) {
    query = query.neq("status", "deleted");
  }

  if (typeof options.limit === "number") {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  return ok(coerceSessionRows(data).map(mapSession));
}

export async function listOwnedSessionHistoryPage(
  context: SessionDataContext,
  input: ListOwnedSessionHistoryInput,
): Promise<SessionDataResult<OwnedSessionHistoryPage>> {
  const offset = (input.page - 1) * input.pageSize;
  const rangeEnd = offset + input.pageSize;
  const { data, error } = await context.supabase
    .from("therapy_sessions")
    .select(HISTORY_SESSION_SELECT)
    .eq("user_id", context.user.id)
    .eq("avatar_id", input.avatarId)
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .range(offset, rangeEnd);

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  const sessions = coerceSessionRows(data).map(mapSession);

  return ok({
    sessions: sessions.slice(0, input.pageSize),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      hasNextPage: sessions.length > input.pageSize,
      hasPreviousPage: input.page > 1,
    },
  });
}

export async function getOwnedSessionMetadata(
  context: SessionDataContext,
  sessionId: SessionId,
): Promise<SessionDataResult<SessionMetadata>> {
  const { data, error } = await context.supabase
    .from("therapy_sessions")
    .select(SESSION_SELECT)
    .eq("id", sessionId)
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  const row = coerceSessionRow(data);
  return row ? ok(mapSession(row)) : sessionDataError("session_not_found");
}

export async function getOwnedSessionHistoryDetail(
  context: SessionDataContext,
  sessionId: SessionId,
): Promise<SessionDataResult<OwnedSessionHistoryDetail>> {
  const session = await getOwnedSessionMetadata(context, sessionId);

  if (!session.ok) {
    return session;
  }

  if (session.data.status === "deleted") {
    return sessionDataError("session_not_found");
  }

  const messages = await listOwnedSessionMessages(context, sessionId);

  if (!messages.ok) {
    return messages;
  }

  return ok({
    session: session.data,
    messages: messages.data,
  });
}

export async function transitionSessionLifecycle(
  context: SessionDataContext,
  input: TransitionSessionLifecycleInput,
): Promise<SessionDataResult<SessionMetadata>> {
  const current = await getOwnedSessionMetadata(context, input.sessionId);

  if (!current.ok) {
    return current;
  }

  if (!canTransitionSessionLifecycle(current.data.status, input.nextStatus)) {
    return sessionDataError("invalid_lifecycle_transition");
  }

  if (input.nextStatus === "deleted" && !input.deletionReasonCode) {
    return sessionDataError("invalid_lifecycle_transition");
  }

  const { data, error } = await context.supabase
    .from("therapy_sessions")
    .update({
      status: input.nextStatus,
      started_at: input.startedAt ?? current.data.startedAt,
      ended_at: input.endedAt ?? current.data.endedAt,
      expires_at: input.expiresAt ?? current.data.expiresAt,
      deletion_reason_code: input.deletionReasonCode ?? current.data.deletionReasonCode,
      duration_bucket_seconds: input.durationBucketSeconds ?? current.data.durationBucketSeconds,
    })
    .eq("id", input.sessionId)
    .eq("user_id", context.user.id)
    .select(SESSION_SELECT)
    .single();

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error));
  }

  const row = coerceSessionRow(data);
  return row ? ok(mapSession(row)) : sessionDataError("write_failed");
}

export async function appendSessionMessage(
  context: SessionDataContext,
  input: AppendSessionMessageInput,
): Promise<SessionDataResult<SessionMessageRecord>> {
  const { data, error } = await context.supabase
    .from("session_messages")
    .insert({
      session_id: input.sessionId,
      user_id: context.user.id,
      role: input.role,
      sequence_index: input.sequenceIndex,
      content: input.content,
    })
    .select(MESSAGE_SELECT)
    .single();

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error));
  }

  const row = coerceMessageRow(data);
  return row ? ok(mapMessage(row)) : sessionDataError("write_failed");
}

export async function appendSessionMessages(
  context: SessionDataContext,
  input: AppendSessionMessagesInput,
): Promise<SessionDataResult<SessionMessageRecord[]>> {
  if (input.length === 0) {
    return ok([]);
  }

  const { data, error } = await context.supabase
    .from("session_messages")
    .insert(
      input.map((message) => ({
        session_id: message.sessionId,
        user_id: context.user.id,
        role: message.role,
        sequence_index: message.sequenceIndex,
        content: message.content,
      })),
    )
    .select(MESSAGE_SELECT);

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error));
  }

  const messages = coerceMessageRows(data).map(mapMessage);
  return messages.length === input.length ? ok(messages) : sessionDataError("write_failed");
}

export async function listOwnedSessionMessages(
  context: SessionDataContext,
  sessionId: SessionId,
): Promise<SessionDataResult<SessionMessageRecord[]>> {
  const session = await getOwnedSessionMetadata(context, sessionId);

  if (!session.ok) {
    return session;
  }

  const { data, error } = await context.supabase
    .from("session_messages")
    .select(MESSAGE_SELECT)
    .eq("session_id", sessionId)
    .eq("user_id", context.user.id)
    .order("sequence_index", { ascending: true });

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  return ok(coerceMessageRows(data).map(mapMessage));
}

export async function saveVisibleSessionSummary(
  context: SessionDataContext,
  input: SaveVisibleSessionSummaryInput,
): Promise<SessionDataResult<SessionSummaryRecord>> {
  const { data, error } = await context.supabase
    .from("session_summaries")
    .upsert(
      {
        session_id: input.sessionId,
        user_id: context.user.id,
        summary_text: input.summaryText,
        status: input.status,
        is_visible: input.isVisible,
        revision: input.revision,
      },
      {
        onConflict: "session_id,revision",
      },
    )
    .select(SUMMARY_SELECT)
    .single();

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error));
  }

  const row = coerceSummaryRow(data);
  return row ? ok(mapSummary(row)) : sessionDataError("write_failed");
}

export async function listOwnedSessionSummaries(
  context: SessionDataContext,
  sessionId: SessionId,
  options: ListSessionSummariesOptions = {},
): Promise<SessionDataResult<SessionSummaryRecord[]>> {
  const session = await getOwnedSessionMetadata(context, sessionId);

  if (!session.ok) {
    return session;
  }

  let query = context.supabase
    .from("session_summaries")
    .select(SUMMARY_SELECT)
    .eq("session_id", sessionId)
    .eq("user_id", context.user.id)
    .order("revision", { ascending: false });

  if (options.visibleOnly) {
    query = query.eq("is_visible", true).neq("status", "deleted");
  }

  const { data, error } = await query;

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  return ok(coerceSummaryRows(data).map(mapSummary));
}

export async function readSafeSessionTombstone(
  context: SessionDataContext,
  sessionId: SessionId,
): Promise<SessionDataResult<DeletedSessionTombstone>> {
  const session = await getOwnedSessionMetadata(context, sessionId);

  if (!session.ok) {
    return session;
  }

  const tombstone = toDeletedSessionTombstone(session.data);
  return tombstone ? ok(tombstone) : sessionDataError("invalid_lifecycle_transition");
}

export async function purgeOwnedSessionMessages(
  context: SessionDataContext,
  sessionId: SessionId,
): Promise<SessionDataResult<null>> {
  const { error } = await context.supabase
    .from("session_messages")
    .delete()
    .eq("session_id", sessionId)
    .eq("user_id", context.user.id);

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error));
  }

  return ok(null);
}

export async function purgeOwnedSessionSummaries(
  context: SessionDataContext,
  sessionId: SessionId,
): Promise<SessionDataResult<null>> {
  const { error } = await context.supabase
    .from("session_summaries")
    .delete()
    .eq("session_id", sessionId)
    .eq("user_id", context.user.id);

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error));
  }

  return ok(null);
}

export async function updateSessionTombstone(
  context: SessionDataContext,
  input: UpdateSessionTombstoneInput,
): Promise<SessionDataResult<DeletedSessionTombstone>> {
  const { data, error } = await context.supabase
    .from("therapy_sessions")
    .update({
      status: "deleted",
      ended_at: input.endedAt ?? null,
      deletion_reason_code: input.deletionReasonCode,
      duration_bucket_seconds: input.durationBucketSeconds ?? null,
    })
    .eq("id", input.sessionId)
    .eq("user_id", context.user.id)
    .select(SESSION_SELECT)
    .single();

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error));
  }

  const row = coerceSessionRow(data);
  const tombstone = row ? toDeletedSessionTombstone(mapSession(row)) : null;
  return tombstone ? ok(tombstone) : sessionDataError("delete_failed");
}

export async function markOwnedSessionDeleted(
  context: SessionDataContext,
  input: DeleteOwnedSessionInput,
): Promise<SessionDataResult<DeletedSessionTombstone>> {
  return updateSessionTombstone(context, input);
}

export async function getTrialAvailability(context: SessionDataContext): Promise<SessionDataResult<TrialAvailability>> {
  const { data, error } = await context.supabase
    .from("session_trial_claims")
    .select(TRIAL_CLAIM_SELECT)
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  const row = coerceTrialClaimRow(data);

  return ok({
    isAvailable: !row,
    existingClaim: row ? mapTrialClaim(row) : null,
  });
}

export async function createSessionTrialClaim(
  context: SessionDataContext,
  sessionId: SessionId,
): Promise<SessionDataResult<SessionTrialClaimState>> {
  const { data, error } = await context.supabase
    .from("session_trial_claims")
    .insert({
      session_id: sessionId,
      user_id: context.user.id,
    })
    .select(TRIAL_CLAIM_SELECT)
    .single();

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error, { conflictCode: "trial_already_claimed" }));
  }

  const row = coerceTrialClaimRow(data);
  return row ? ok(mapTrialClaim(row)) : sessionDataError("write_failed");
}
