import { isRecord } from "@/lib/type-guards";
import { isWithinAvatarMemoryBudget } from "@/lib/session-summary/avatar-memory-budget";
import { ok, sessionDataError, type SessionDataResult } from "./errors";
import type { SessionAvatarId, SessionDataContext, SessionMetadata } from "./types";

export interface AvatarMemoryWork {
  revision: string;
  summaryText: string;
  messages: (AvatarMemoryCursor & { role: "user" | "assistant"; content: string })[];
}

export interface AvatarMemoryCursor {
  sessionId: string;
  sequenceIndex: number;
  /** Koniec fragmentu w oryginalnej wiadomości, liczony w znakach Unicode. */
  characterOffset: number;
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
    value.content.length > 0 &&
    typeof value.sessionId === "string" &&
    value.sessionId.length > 0 &&
    typeof value.sequenceIndex === "number" &&
    Number.isSafeInteger(value.sequenceIndex) &&
    value.sequenceIndex >= 0 &&
    typeof value.characterOffset === "number" &&
    Number.isSafeInteger(value.characterOffset) &&
    value.characterOffset >= Array.from(value.content).length
  );
}

export async function getOwnedAvatarMemoryWork(
  context: SessionDataContext,
  avatarId: SessionAvatarId,
): Promise<SessionDataResult<AvatarMemoryWork>> {
  const result = await context.supabase.rpc("get_avatar_memory_batch", { p_avatar_id: avatarId });
  const value: unknown = result.data;
  if (
    result.error ||
    !isRecord(value) ||
    typeof value.revision !== "string" ||
    typeof value.summaryText !== "string" ||
    !Array.isArray(value.messages) ||
    !value.messages.every(isMemoryMessage) ||
    !isWithinAvatarMemoryBudget(value.messages, value.summaryText)
  ) {
    return sessionDataError("read_failed");
  }
  return ok({
    revision: value.revision,
    summaryText: value.summaryText,
    messages: value.messages,
  });
}

export async function saveOwnedAvatarMemoryWork(
  context: SessionDataContext,
  avatarId: SessionAvatarId,
  input: Pick<AvatarMemoryWork, "revision" | "summaryText"> & { cursors: AvatarMemoryCursor[] },
): Promise<SessionDataResult<boolean>> {
  const result = await context.supabase.rpc("save_avatar_memory_batch", {
    p_avatar_id: avatarId,
    p_revision: input.revision,
    p_cursors: input.cursors,
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
