/** Private, owner-bound turn receipts. Never expose hashes or lease ids in logs. */
import { isRecord } from "@/lib/type-guards";
import { mapSupabaseWriteError, ok, sessionDataError, type SessionDataResult } from "./errors";
import { coerceMessageRows, mapMessage } from "./rows";
import type { SessionDataContext, SessionMessageRecord } from "./types";

export interface MessageTurnKey {
  sessionId: string;
  clientMessageId: string;
}

export interface MessageTurnLease extends MessageTurnKey {
  attemptId: string;
}

export type MessageTurnClaim =
  | { kind: "claimed"; attemptId: string }
  | { kind: "completed"; responseType: "success" | "caution"; messages: SessionMessageRecord[] };

function readTurnMessages(value: unknown): SessionMessageRecord[] | null {
  const messages = coerceMessageRows(value).map(mapMessage);
  return messages.length === 2 && messages[0].role === "user" && messages[1].role === "assistant" ? messages : null;
}

export async function claimSessionMessageTurn(
  context: SessionDataContext,
  input: MessageTurnKey & { message: string },
): Promise<SessionDataResult<MessageTurnClaim>> {
  const { data, error } = (await context.supabase.rpc("claim_session_message_turn", {
    p_session_id: input.sessionId,
    p_client_message_id: input.clientMessageId,
    p_message: input.message,
  })) as { data: unknown; error: unknown };
  if (error) return sessionDataError(mapSupabaseWriteError(error));
  if (!isRecord(data)) return sessionDataError("write_failed");
  if (data.kind === "claimed" && typeof data.attempt_id === "string") {
    return ok({ kind: "claimed", attemptId: data.attempt_id });
  }
  if (data.kind === "completed" && (data.response_type === "success" || data.response_type === "caution")) {
    const messages = readTurnMessages(data.messages);
    if (messages) return ok({ kind: "completed", responseType: data.response_type, messages });
  }
  return sessionDataError("write_failed");
}

export async function completeSessionMessageTurn(
  context: SessionDataContext,
  input: MessageTurnLease & { userMessage: string; assistantMessage: string; responseType: "success" | "caution" },
): Promise<SessionDataResult<SessionMessageRecord[]>> {
  const { data, error } = (await context.supabase.rpc("complete_session_message_turn", {
    p_session_id: input.sessionId,
    p_client_message_id: input.clientMessageId,
    p_attempt_id: input.attemptId,
    p_user_message: input.userMessage,
    p_assistant_message: input.assistantMessage,
    p_response_type: input.responseType,
  })) as { data: unknown; error: unknown };
  if (error) return sessionDataError(mapSupabaseWriteError(error));
  const messages = isRecord(data) ? readTurnMessages(data.messages) : null;
  return messages ? ok(messages) : sessionDataError("write_failed");
}

export async function releaseSessionMessageTurn(context: SessionDataContext, input: MessageTurnLease) {
  // Best effort; a disconnected Worker can leave a lease behind, but it expires.
  // Never let cleanup turn a successful response into a retry or log private RPC arguments.
  try {
    await context.supabase.rpc("release_session_message_turn", {
      p_session_id: input.sessionId,
      p_client_message_id: input.clientMessageId,
      p_attempt_id: input.attemptId,
    });
  } catch {
    // The two-minute database lease is the recovery path.
  }
}
