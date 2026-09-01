/**
 * Owner-bound repository helpers for `session_messages` (private content).
 * Import from `./repository` outside this directory.
 */
import { mapSupabaseReadError, mapSupabaseWriteError, ok, sessionDataError, type SessionDataResult } from "./errors";
import { MESSAGE_SELECT, coerceMessageRow, coerceMessageRows, mapMessage } from "./rows";
import { getOwnedSessionMetadata } from "./sessions";
import type {
  AppendSessionMessageInput,
  AppendSessionMessagesInput,
  OwnedSessionHistoryDetail,
  SessionDataContext,
  SessionId,
  SessionMessageRecord,
} from "./types";

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
    return sessionDataError(mapSupabaseWriteError(error, { conflictCode: "sequence_conflict" }));
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

/**
 * Bounded tail of a conversation, for the model context window. A turn only
 * ever needs the last few messages, so the full transcript must not travel out
 * of the database for it — that is both a cost and a privacy-exposure concern.
 * Ownership is enforced by RLS plus the `user_id` filter; callers that need to
 * tell "not found" from "not owner" apart resolve the session metadata first.
 */
export async function listRecentOwnedSessionMessages(
  context: SessionDataContext,
  sessionId: SessionId,
  limit: number,
): Promise<SessionDataResult<SessionMessageRecord[]>> {
  if (limit <= 0) {
    return ok([]);
  }

  const { data, error } = await context.supabase
    .from("session_messages")
    .select(MESSAGE_SELECT)
    .eq("session_id", sessionId)
    .eq("user_id", context.user.id)
    .order("sequence_index", { ascending: false })
    .limit(limit);

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  return ok(
    coerceMessageRows(data)
      .map(mapMessage)
      .sort((left, right) => left.sequenceIndex - right.sequenceIndex),
  );
}

/**
 * Next free `sequence_index` for a session, read without pulling any message
 * content. The unique (session_id, sequence_index) constraint remains the
 * authority — this only avoids a guaranteed-conflicting first attempt.
 */
export async function getNextSessionMessageSequenceIndex(
  context: SessionDataContext,
  sessionId: SessionId,
): Promise<SessionDataResult<number>> {
  const { data, error } = await context.supabase
    .from("session_messages")
    .select("sequence_index")
    .eq("session_id", sessionId)
    .eq("user_id", context.user.id)
    .order("sequence_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  const highestIndex = coerceSequenceIndex(data);

  return ok(highestIndex === null ? 0 : highestIndex + 1);
}

function coerceSequenceIndex(value: unknown): number | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const sequenceIndex = (value as { sequence_index?: unknown }).sequence_index;

  return typeof sequenceIndex === "number" && Number.isFinite(sequenceIndex) ? sequenceIndex : null;
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
