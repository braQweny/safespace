/**
 * Owner-bound repository helpers for `therapy_sessions` metadata and
 * tombstones. Import from `./repository` outside this directory.
 */
import { isRecord } from "@/lib/type-guards";
import type { SessionLensId } from "@/lib/session-ai/session-lenses";
import {
  getStableSupabaseErrorCode,
  mapSupabaseReadError,
  mapSupabaseWriteError,
  ok,
  sessionDataError,
  type SessionDataResult,
} from "./errors";
import {
  HISTORY_SESSION_SELECT,
  SESSION_SELECT,
  coerceSessionRow,
  coerceSessionRows,
  mapSession,
  toDeletedSessionTombstone,
} from "./rows";
import {
  isSessionAvatarId,
  type CreatePendingSessionInput,
  type DeletedSessionTombstone,
  type ListActiveSessionMetadataInput,
  type ListOwnedSessionHistoryInput,
  type ListSessionMetadataOptions,
  type OwnedSessionCountsByAvatar,
  type OwnedSessionHistoryPage,
  type SessionDataContext,
  type SessionDurationBucketSeconds,
  type SessionId,
  type SessionLifecycleStatus,
  type SessionMetadata,
  type TransitionSessionLifecycleInput,
  type UpdateSessionTombstoneInput,
  type VoiceSessionTiming,
} from "./types";

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
      uses_approved_context: input.usesApprovedContext ?? true,
      uses_avatar_memory: input.usesAvatarMemory ?? false,
      about_person_id: input.aboutPersonId ?? null,
      about_difficulty_id: input.aboutDifficultyId ?? null,
      mode: input.mode ?? "text",
    })
    .select(SESSION_SELECT)
    .single();

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error));
  }

  const row = coerceSessionRow(data);
  return row ? ok(mapSession(row)) : sessionDataError("write_failed");
}

/**
 * Counts every text session row the owner has — any lifecycle status, deleted
 * tombstones included — which is exactly what the free-plan cap trigger counts.
 * Voice conversations live in their own allowance (`countOwnedVoiceSessions`).
 */
export async function countOwnedSessions(context: SessionDataContext): Promise<SessionDataResult<number>> {
  const { count, error } = await context.supabase
    .from("therapy_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", context.user.id)
    .eq("mode", "text");

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  return ok(typeof count === "number" && Number.isFinite(count) && count >= 0 ? count : 0);
}

/**
 * Ile rozmów głosowych właściciel ma w ogóle — każdy status, tombstone też —
 * dokładnie to, co liczy bramka próby głosowej konta free (`P0016`).
 */
export async function countOwnedVoiceSessions(context: SessionDataContext): Promise<SessionDataResult<number>> {
  const { count, error } = await context.supabase
    .from("therapy_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", context.user.id)
    .eq("mode", "voice");

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  return ok(typeof count === "number" && Number.isFinite(count) && count >= 0 ? count : 0);
}

const VOICE_TIMING_SELECT = "voice_connected_at,ended_at,expires_at,duration_bucket_seconds,status";
const VOICE_TIMING_LIMIT = 200;

function toVoiceSessionTiming(value: unknown): VoiceSessionTiming | null {
  if (!isRecord(value) || typeof value.voice_connected_at !== "string" || typeof value.status !== "string") {
    return null;
  }

  return {
    voiceConnectedAt: value.voice_connected_at,
    endedAt: typeof value.ended_at === "string" ? value.ended_at : null,
    expiresAt: typeof value.expires_at === "string" ? value.expires_at : null,
    durationBucketSeconds:
      typeof value.duration_bucket_seconds === "number"
        ? (value.duration_bucket_seconds as SessionDurationBucketSeconds)
        : null,
    status: value.status as SessionLifecycleStatus,
  };
}

/**
 * Czasy rozmów głosowych właściciela połączonych od `sinceIso` (miesięczna
 * pula premium). Bez treści i bez identyfikatorów: tylko to, co potrzebne do
 * policzenia zużytych sekund. Tombstone liczy się jak każda inna rozmowa —
 * usunięcie nie zwraca minut.
 */
export async function listOwnedVoiceSessionTimings(
  context: SessionDataContext,
  sinceIso: string,
): Promise<SessionDataResult<VoiceSessionTiming[]>> {
  const { data, error } = await context.supabase
    .from("therapy_sessions")
    .select(VOICE_TIMING_SELECT)
    .eq("user_id", context.user.id)
    .eq("mode", "voice")
    .gte("voice_connected_at", sinceIso)
    .order("voice_connected_at", { ascending: true })
    .limit(VOICE_TIMING_LIMIT);

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  return ok(Array.isArray(data) ? data.map(toVoiceSessionTiming).filter((row) => row !== null) : []);
}

/**
 * Zapisuje pierwsze udane połączenie audio: tylko właściciel, tylko rozmowa
 * głosowa i tylko pusta kolumna, więc reconnect nigdy nie przesuwa startu
 * puli. `true` = zapisano teraz, `false` = już było albo warunek nie zaszedł.
 */
export async function markVoiceSessionConnected(
  context: SessionDataContext,
  sessionId: SessionId,
  connectedAtIso: string,
): Promise<SessionDataResult<boolean>> {
  const { data, error } = await context.supabase
    .from("therapy_sessions")
    .update({ voice_connected_at: connectedAtIso })
    .eq("id", sessionId)
    .eq("user_id", context.user.id)
    .eq("mode", "voice")
    .is("voice_connected_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error));
  }

  return ok(data !== null);
}

/**
 * Ile niesuniętych rozmów właściciel ma z każdą perspektywą. Dane zbiorcze bez
 * treści (sam `avatar_id`), potrzebne, żeby filtr historii pokazywał tylko te
 * twarze, za którymi coś stoi — zamiast pięciu przełączników, z których cztery
 * prowadzą do pustej listy.
 */
export async function countOwnedSessionsByAvatar(
  context: SessionDataContext,
): Promise<SessionDataResult<OwnedSessionCountsByAvatar>> {
  const { data, error } = await context.supabase
    .from("therapy_sessions")
    .select("avatar_id")
    .eq("user_id", context.user.id)
    .neq("status", "deleted");

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  const counts: OwnedSessionCountsByAvatar = {};

  for (const row of Array.isArray(data) ? (data as unknown[]) : []) {
    const avatarId = isRecord(row) ? row.avatar_id : null;

    if (!isSessionAvatarId(avatarId)) {
      continue;
    }

    counts[avatarId] = (counts[avatarId] ?? 0) + 1;
  }

  return ok(counts);
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

export async function listOwnedActiveSessionMetadata(
  context: SessionDataContext,
  input: ListActiveSessionMetadataInput,
): Promise<SessionDataResult<SessionMetadata[]>> {
  let query = context.supabase
    .from("therapy_sessions")
    .select(SESSION_SELECT)
    .eq("user_id", context.user.id)
    .eq("status", "active");

  if (input.avatarId) {
    query = query.eq("avatar_id", input.avatarId);
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(input.limit ?? 5);

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

export async function ensureOwnedNonDeletedSession(
  context: SessionDataContext,
  sessionId: SessionId,
): Promise<SessionDataResult<SessionMetadata>> {
  const session = await getOwnedSessionMetadata(context, sessionId);

  if (!session.ok) {
    return session;
  }

  return session.data.status === "deleted" ? sessionDataError("session_not_found") : session;
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

  // Compare-and-set on the observed status: a concurrent request that already
  // moved the session past this state makes the update match zero rows instead
  // of silently overwriting the newer status.
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
    .eq("status", current.data.status)
    .select(SESSION_SELECT)
    .maybeSingle();

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error));
  }

  const row = coerceSessionRow(data);
  return row ? ok(mapSession(row)) : sessionDataError("invalid_lifecycle_transition");
}

/**
 * Przypina soczewkę tematyczną raz na sesję: tylko właściciel, tylko aktywna
 * rozmowa i tylko pusta kolumna, więc późniejsza etykieta nigdy nie nadpisze
 * pierwszej. `true` = zapisano, `false` = warunek nie zaszedł (sesja już ma
 * soczewkę albo skończyła się w międzyczasie) — dla wywołującego to nie błąd.
 */
export async function setOwnedSessionLens(
  context: SessionDataContext,
  sessionId: SessionId,
  lens: SessionLensId,
): Promise<SessionDataResult<boolean>> {
  const { data, error } = await context.supabase
    .from("therapy_sessions")
    .update({ session_lens: lens })
    .eq("id", sessionId)
    .eq("user_id", context.user.id)
    .eq("status", "active")
    .is("session_lens", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error));
  }

  return ok(data !== null);
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

export async function purgeAndTombstoneOwnedSession(
  context: SessionDataContext,
  input: UpdateSessionTombstoneInput,
): Promise<SessionDataResult<DeletedSessionTombstone>> {
  const response = (await context.supabase.rpc("delete_owned_session", {
    p_session_id: input.sessionId,
    p_deletion_reason_code: input.deletionReasonCode,
    p_ended_at: input.endedAt ?? null,
    p_duration_bucket_seconds: input.durationBucketSeconds ?? null,
  })) as { data: unknown; error: unknown };
  const { data, error } = response;

  if (error) {
    const code = getStableSupabaseErrorCode(error);

    if (code === "P0002") {
      return sessionDataError("session_not_found");
    }

    if (code === "P0004") {
      return sessionDataError("invalid_lifecycle_transition");
    }

    return sessionDataError("delete_failed");
  }

  const row = coerceSessionRow(data);
  const tombstone = row ? toDeletedSessionTombstone(mapSession(row)) : null;
  return tombstone ? ok(tombstone) : sessionDataError("delete_failed");
}
