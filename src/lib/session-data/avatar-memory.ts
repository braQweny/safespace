import { isRecord } from "@/lib/type-guards";
import { ok, sessionDataError, type SessionDataResult } from "./errors";
import type { SessionAvatarId, SessionDataContext, SessionMetadata } from "./types";

export interface AvatarMemoryWork {
  revision: string;
  summaryText: string;
  sessionId: string | null;
  sequenceIndex: number;
  characterOffset: number;
  messages: { role: "user" | "assistant"; content: string; sequenceIndex: number }[];
}

export async function getOwnedAvatarMemoryPreview(
  context: SessionDataContext,
  avatarId: SessionAvatarId,
): Promise<SessionDataResult<string>> {
  const { data, error } = await context.supabase
    .from("avatar_memories")
    .select("summary_text")
    .eq("user_id", context.user.id)
    .eq("avatar_id", avatarId)
    .maybeSingle();
  const value: unknown = data;
  if (error) return sessionDataError("read_failed");
  if (value === null) return ok("");
  return isRecord(value) && typeof value.summary_text === "string"
    ? ok(value.summary_text)
    : sessionDataError("read_failed");
}

function isMemoryMessage(value: unknown): value is AvatarMemoryWork["messages"][number] {
  return (
    isRecord(value) &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string" &&
    typeof value.sequenceIndex === "number" &&
    Number.isSafeInteger(value.sequenceIndex)
  );
}

export async function getOwnedAvatarMemoryWork(
  context: SessionDataContext,
  avatarId: SessionAvatarId,
): Promise<SessionDataResult<AvatarMemoryWork>> {
  const result = await context.supabase.rpc("get_avatar_memory_work", { p_avatar_id: avatarId });
  const value: unknown = result.data;
  if (
    result.error ||
    !isRecord(value) ||
    typeof value.revision !== "string" ||
    typeof value.summaryText !== "string" ||
    !(value.sessionId === null || typeof value.sessionId === "string") ||
    typeof value.sequenceIndex !== "number" ||
    typeof value.characterOffset !== "number" ||
    !Array.isArray(value.messages) ||
    !value.messages.every(isMemoryMessage)
  ) {
    return sessionDataError("read_failed");
  }
  return ok({
    revision: value.revision,
    summaryText: value.summaryText,
    sessionId: value.sessionId,
    sequenceIndex: value.sequenceIndex,
    characterOffset: value.characterOffset,
    messages: value.messages,
  });
}

export async function saveOwnedAvatarMemoryWork(
  context: SessionDataContext,
  avatarId: SessionAvatarId,
  input: Omit<AvatarMemoryWork, "messages"> & { sessionId: string },
): Promise<SessionDataResult<boolean>> {
  const result = await context.supabase.rpc("save_avatar_memory_work", {
    p_avatar_id: avatarId,
    p_revision: input.revision,
    p_session_id: input.sessionId,
    p_sequence_index: input.sequenceIndex,
    p_character_offset: input.characterOffset,
    p_summary_text: input.summaryText,
  });
  const value: unknown = result.data;
  return result.error || typeof value !== "boolean" ? sessionDataError("write_failed") : ok(value);
}

/** Prywatna kopia przypięta do sesji. Brak wiersza to awaria, nigdy zgoda na start od zera. */
export async function getOwnedSessionAvatarMemory(
  context: SessionDataContext,
  session: Pick<SessionMetadata, "id" | "avatarId">,
): Promise<SessionDataResult<string>> {
  const { data, error } = await context.supabase
    .from("avatar_session_contexts")
    .select("summary_text")
    .eq("session_id", session.id)
    .eq("user_id", context.user.id)
    .eq("avatar_id", session.avatarId)
    .maybeSingle();
  const value: unknown = data;
  return error || !isRecord(value) || typeof value.summary_text !== "string"
    ? sessionDataError("read_failed")
    : ok(value.summary_text);
}
