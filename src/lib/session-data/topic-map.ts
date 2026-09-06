import { isRecord } from "@/lib/type-guards";
import {
  isDifficultyEffect,
  isDifficultyEntryKind,
  isDifficultyPersonState,
} from "@/lib/session-summary/topic-map-budget";
import {
  DIFFICULTY_LABEL_TAKEN_SQLSTATE,
  getStableSupabaseErrorCode,
  ok,
  sessionDataError,
  type SessionDataResult,
} from "./errors";
import {
  isSessionAvatarId,
  type DifficultyCard,
  type DifficultyEntry,
  type SessionAvatarId,
  type SessionDataContext,
} from "./types";

/**
 * Mapa tematów: karty trudności do interfejsu i korekty użytkownika. Wszystko
 * owner-only przez RPC `security invoker`; treść nigdy do logów ani admina.
 * Ekstrakcja wsadowa siedzi w `people-memory.ts` (wspólna partia z kartami osób).
 */
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isEntrySource(value: unknown): value is DifficultyEntry["sources"][number] {
  return isRecord(value) && typeof value.sessionId === "string" && typeof value.conversationAt === "string";
}

function isDifficultyEntry(value: unknown): value is DifficultyEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isDifficultyEntryKind(value.kind) &&
    typeof value.text === "string" &&
    (value.effect === null || isDifficultyEffect(value.effect)) &&
    isNullableString(value.personId) &&
    isNullableString(value.parentEntryId) &&
    typeof value.userEdited === "boolean" &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.sources) &&
    value.sources.every(isEntrySource)
  );
}

function isDifficultyAlias(value: unknown): value is DifficultyCard["aliases"][number] {
  return isRecord(value) && typeof value.id === "string" && typeof value.alias === "string";
}

function isDifficultyPersonLink(value: unknown): value is DifficultyCard["persons"][number] {
  return (
    isRecord(value) &&
    typeof value.personId === "string" &&
    typeof value.name === "string" &&
    isNullableString(value.relation) &&
    isDifficultyPersonState(value.state) &&
    typeof value.userDecided === "boolean"
  );
}

function isCurrentState(value: unknown): value is DifficultyCard["currentState"] {
  return (
    value === null ||
    (isRecord(value) &&
      typeof value.id === "string" &&
      typeof value.text === "string" &&
      (value.effect === null || isDifficultyEffect(value.effect)) &&
      isNullableString(value.conversationAt))
  );
}

export function isDifficultyCard(value: unknown): value is DifficultyCard {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isSessionAvatarId(value.avatarId) &&
    typeof value.label === "string" &&
    typeof value.labelLocked === "boolean" &&
    typeof value.userNote === "string" &&
    isNullableString(value.archivedAt) &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.aliases) &&
    value.aliases.every(isDifficultyAlias) &&
    Array.isArray(value.persons) &&
    value.persons.every(isDifficultyPersonLink) &&
    isNullableString(value.firstMentionedAt) &&
    isNullableString(value.lastMentionedAt) &&
    typeof value.mentionCount === "number" &&
    Number.isSafeInteger(value.mentionCount) &&
    isCurrentState(value.currentState) &&
    typeof value.hasNewEntriesSinceArchived === "boolean" &&
    Array.isArray(value.entries) &&
    value.entries.every(isDifficultyEntry)
  );
}

function toDifficultyCard(value: unknown): SessionDataResult<DifficultyCard | null> {
  if (value === null || value === undefined) return ok(null);
  return isDifficultyCard(value) ? ok(value) : sessionDataError("read_failed");
}

function writeResult(error: unknown, value: unknown): SessionDataResult<DifficultyCard | null> {
  if (!error) return toDifficultyCard(value);
  return sessionDataError(
    getStableSupabaseErrorCode(error) === DIFFICULTY_LABEL_TAKEN_SQLSTATE
      ? "duplicate_difficulty_label"
      : "write_failed",
  );
}

export async function listOwnedDifficultyCards(
  context: SessionDataContext,
  avatarId: SessionAvatarId,
): Promise<SessionDataResult<DifficultyCard[]>> {
  const result = await context.supabase.rpc("list_difficulty_cards", { p_avatar_id: avatarId });
  const value: unknown = result.data;
  if (result.error || !Array.isArray(value) || !value.every(isDifficultyCard)) return sessionDataError("read_failed");
  return ok(value);
}

/** `null` = brak karty właściciela o tym id (nigdy cudza). */
export async function getOwnedDifficultyCard(
  context: SessionDataContext,
  difficultyId: string,
): Promise<SessionDataResult<DifficultyCard | null>> {
  const result = await context.supabase.rpc("get_difficulty_card", { p_difficulty_id: difficultyId });
  return result.error ? sessionDataError("read_failed") : toDifficultyCard(result.data);
}

export interface UpdateOwnedDifficultyCardInput {
  difficultyId: string;
  label: string;
  userNote: string;
  archived: boolean;
}

/** Etykieta zajęta przez inną trudność perspektywy → `duplicate_difficulty_label`. */
export async function updateOwnedDifficultyCard(
  context: SessionDataContext,
  input: UpdateOwnedDifficultyCardInput,
): Promise<SessionDataResult<DifficultyCard | null>> {
  const result = await context.supabase.rpc("update_difficulty_card", {
    p_difficulty_id: input.difficultyId,
    p_label: input.label,
    p_user_note: input.userNote,
    p_archived: input.archived,
  });
  return writeResult(result.error, result.data);
}

/** `false` = brak takiej trudności właściciela. Bez wykluczenia. */
export async function deleteOwnedDifficulty(
  context: SessionDataContext,
  difficultyId: string,
): Promise<SessionDataResult<boolean>> {
  const result = await context.supabase.rpc("delete_difficulty", { p_difficulty_id: difficultyId });
  const value: unknown = result.data;
  return result.error || typeof value !== "boolean" ? sessionDataError("write_failed") : ok(value);
}

/** `null` = brak trudności albo osoby właściciela w tej perspektywie. */
export async function decideOwnedDifficultyPerson(
  context: SessionDataContext,
  input: { difficultyId: string; personId: string; state: "confirmed" | "rejected" },
): Promise<SessionDataResult<DifficultyCard | null>> {
  const result = await context.supabase.rpc("decide_difficulty_person", {
    p_difficulty_id: input.difficultyId,
    p_person_id: input.personId,
    p_state: input.state,
  });
  return result.error ? sessionDataError("write_failed") : toDifficultyCard(result.data);
}

export async function updateOwnedDifficultyEntry(
  context: SessionDataContext,
  entryId: string,
  text: string,
): Promise<SessionDataResult<DifficultyCard | null>> {
  const result = await context.supabase.rpc("update_difficulty_entry", { p_entry_id: entryId, p_text: text });
  return result.error ? sessionDataError("write_failed") : toDifficultyCard(result.data);
}

export interface DeletedDifficultyEntry {
  difficultyId: string;
  /** `null`, gdy usunięty wpis był ostatnim i trudność zniknęła razem z nim. */
  card: DifficultyCard | null;
}

/** `null` = brak takiego wpisu właściciela. */
export async function deleteOwnedDifficultyEntry(
  context: SessionDataContext,
  entryId: string,
): Promise<SessionDataResult<DeletedDifficultyEntry | null>> {
  const result = await context.supabase.rpc("delete_difficulty_entry", { p_entry_id: entryId });
  const value: unknown = result.data;
  if (result.error) return sessionDataError("write_failed");
  if (value === null || value === undefined) return ok(null);
  if (!isRecord(value) || typeof value.difficultyId !== "string") return sessionDataError("read_failed");
  const card = toDifficultyCard(value.card);
  return card.ok ? ok({ difficultyId: value.difficultyId, card: card.data }) : card;
}

/** `null` = którejś trudności nie ma u właściciela; zwraca kartę celu. */
export async function mergeOwnedDifficulties(
  context: SessionDataContext,
  input: { sourceId: string; targetId: string },
): Promise<SessionDataResult<DifficultyCard | null>> {
  const result = await context.supabase.rpc("merge_difficulties", {
    p_source_id: input.sourceId,
    p_target_id: input.targetId,
  });
  return result.error ? sessionDataError("write_failed") : toDifficultyCard(result.data);
}

export async function setOwnedTopicMapEnabled(
  context: SessionDataContext,
  enabled: boolean,
): Promise<SessionDataResult<boolean>> {
  const result = await context.supabase.rpc("set_topic_map_enabled", { p_enabled: enabled });
  const value: unknown = result.data;
  return result.error || typeof value !== "boolean" ? sessionDataError("write_failed") : ok(value);
}

export async function disableAndDeleteOwnedTopicMap(context: SessionDataContext): Promise<SessionDataResult<boolean>> {
  const result = await context.supabase.rpc("disable_and_delete_topic_map");
  const value: unknown = result.data;
  return result.error || typeof value !== "boolean" ? sessionDataError("write_failed") : ok(value);
}

/** Brak wiersza preferencji = domyślnie włączone. */
export async function readOwnedTopicMapEnabled(context: SessionDataContext): Promise<SessionDataResult<boolean>> {
  const { data, error } = await context.supabase
    .from("user_preferences")
    .select("topic_map_enabled")
    .eq("user_id", context.user.id)
    .maybeSingle();
  const value: unknown = data;
  if (error) return sessionDataError("read_failed");
  if (value === null) return ok(true);
  return isRecord(value) && typeof value.topic_map_enabled === "boolean"
    ? ok(value.topic_map_enabled)
    : sessionDataError("read_failed");
}

/** Czy właściciel ma jakiekolwiek trudności (dowolna perspektywa) — bez treści. */
export async function hasOwnedDifficultyRows(context: SessionDataContext): Promise<SessionDataResult<boolean>> {
  const { count, error } = await context.supabase
    .from("difficulties")
    .select("id", { count: "exact", head: true })
    .eq("user_id", context.user.id);
  if (error) return sessionDataError("read_failed");
  return ok(typeof count === "number" && count > 0);
}
