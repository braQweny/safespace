import { isRecord } from "@/lib/type-guards";
import {
  PEOPLE_BATCH_DEFAULT_CHARS,
  isPeopleFactKind,
  isWithinPeopleMemoryBudget,
  type PeopleFactKind,
} from "@/lib/session-summary/people-memory-budget";
import {
  isDifficultyEffect,
  isDifficultyEntryKind,
  isDifficultyPersonState,
  type DifficultyEffect,
  type DifficultyEntryKind,
  type DifficultyPersonState,
} from "@/lib/session-summary/topic-map-budget";
import type { ForgottenPerson } from "@/lib/session-summary/types";
import { ok, sessionDataError, type SessionDataResult } from "./errors";
import type { AvatarMemoryCursor, AvatarMemoryWork } from "./avatar-memory";
import { isForgottenPerson } from "./avatar-memory";
import {
  isSessionAvatarId,
  type PersonCard,
  type PersonFact,
  type SessionAvatarId,
  type SessionDataContext,
} from "./types";

/**
 * Karty osób i mapa tematów: jedna partia, wspólne kursory i wspólna rewizja
 * per użytkownik + awatar. Nic stąd nie trafia do logów ani do admina; do
 * providera idą tylko lokalne refy, które mapuje `session-flow/people-memory.ts`.
 */
export interface PeopleMemoryFactRecord {
  id: string;
  kind: PeopleFactKind;
  text: string;
  userEdited: boolean;
}

export interface PeopleMemoryPersonRecord {
  id: string;
  name: string;
  nameLocked: boolean;
  relation: string | null;
  relationLocked: boolean;
  userNote: string;
  facts: PeopleMemoryFactRecord[];
}

export interface DifficultyMemoryEntryRecord {
  id: string;
  kind: DifficultyEntryKind;
  text: string;
  effect: DifficultyEffect | null;
  personId: string | null;
  parentEntryId: string | null;
  userEdited: boolean;
  /** Data najwcześniejszej rozmowy źródłowej; `null` bez źródeł (nie powinno się zdarzyć). */
  conversationAt: string | null;
}

export interface DifficultyMemoryPersonRecord {
  personId: string;
  state: DifficultyPersonState;
  userDecided: boolean;
}

export interface DifficultyMemoryRecord {
  id: string;
  label: string;
  labelLocked: boolean;
  archived: boolean;
  aliases: string[];
  persons: DifficultyMemoryPersonRecord[];
  entries: DifficultyMemoryEntryRecord[];
}

export interface PeopleMemoryWork {
  revision: string;
  /** Preferencja kart osób w chwili odczytu; `false` = brak indeksu osób i zmian osób. */
  enabled: boolean;
  /** Preferencja mapy tematów; `false` = brak indeksu trudności i zmian trudności. */
  topicsEnabled: boolean;
  persons: PeopleMemoryPersonRecord[];
  forgottenPeople: ForgottenPerson[];
  difficulties: DifficultyMemoryRecord[];
  messages: AvatarMemoryWork["messages"];
}

export interface PeopleMemoryFactWrite {
  kind: PeopleFactKind;
  text: string;
  sourceSessionId: string;
}

export interface PeopleMemoryNewPersonWrite {
  name: string;
  relation: string | null;
  relationSourceSessionId: string | null;
  facts: PeopleMemoryFactWrite[];
}

export interface PeopleMemoryPersonUpdateWrite {
  personId: string;
  relation: string | null;
  relationSourceSessionId: string | null;
  addFacts: PeopleMemoryFactWrite[];
  replaceFacts: (PeopleMemoryFactWrite & { factId: string })[];
  removeFactIds: string[];
  mentionedSessionIds: string[];
}

export interface DifficultyAliasWrite {
  text: string;
  sourceSessionId: string | null;
}

/** Osoba istniejąca po id albo tworzona w tej partii po pozycji w `newPersons`. */
export interface DifficultyPersonLinkWrite {
  personId: string | null;
  newPersonPosition: number | null;
  uncertain: boolean;
}

export interface DifficultyEntryWrite {
  kind: DifficultyEntryKind;
  text: string;
  effect: DifficultyEffect | null;
  personId: string | null;
  newPersonPosition: number | null;
  parentEntryId: string | null;
  /** Pozycja wcześniejszego wpisu na tej samej liście `addEntries`. */
  parentPosition: number | null;
  sourceSessionId: string;
}

export interface DifficultyEntryReplaceWrite {
  entryId: string;
  kind: DifficultyEntryKind;
  text: string;
  effect: DifficultyEffect | null;
  sourceSessionId: string;
}

export interface DifficultyChangeWrite {
  addAliases: DifficultyAliasWrite[];
  addPersons: DifficultyPersonLinkWrite[];
  addEntries: DifficultyEntryWrite[];
  replaceEntries: DifficultyEntryReplaceWrite[];
  removeEntryIds: string[];
  mentionedSessionIds: string[];
}

export interface PeopleMemoryNewDifficultyWrite extends DifficultyChangeWrite {
  label: string;
}

export interface PeopleMemoryDifficultyUpdateWrite extends DifficultyChangeWrite {
  difficultyId: string;
}

export interface PeopleMemoryChangeSet {
  newPersons: PeopleMemoryNewPersonWrite[];
  updates: PeopleMemoryPersonUpdateWrite[];
  newDifficulties: PeopleMemoryNewDifficultyWrite[];
  difficultyUpdates: PeopleMemoryDifficultyUpdateWrite[];
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

function hasFactRecordShape(value: Record<string, unknown>) {
  return (
    typeof value.id === "string" &&
    isPeopleFactKind(value.kind) &&
    typeof value.text === "string" &&
    typeof value.userEdited === "boolean"
  );
}

function isFactRecord(value: unknown): value is PeopleMemoryFactRecord {
  return isRecord(value) && hasFactRecordShape(value);
}

function hasPersonRecordShape(value: Record<string, unknown>, isFact: (fact: unknown) => boolean) {
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.nameLocked === "boolean" &&
    (value.relation === null || typeof value.relation === "string") &&
    typeof value.relationLocked === "boolean" &&
    typeof value.userNote === "string" &&
    Array.isArray(value.facts) &&
    value.facts.every(isFact)
  );
}

function isPersonRecord(value: unknown): value is PeopleMemoryPersonRecord {
  return isRecord(value) && hasPersonRecordShape(value, isFactRecord);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isDifficultyEntryRecord(value: unknown): value is DifficultyMemoryEntryRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isDifficultyEntryKind(value.kind) &&
    typeof value.text === "string" &&
    (value.effect === null || isDifficultyEffect(value.effect)) &&
    isNullableString(value.personId) &&
    isNullableString(value.parentEntryId) &&
    typeof value.userEdited === "boolean" &&
    isNullableString(value.conversationAt)
  );
}

function isDifficultyPersonRecord(value: unknown): value is DifficultyMemoryPersonRecord {
  return (
    isRecord(value) &&
    typeof value.personId === "string" &&
    isDifficultyPersonState(value.state) &&
    typeof value.userDecided === "boolean"
  );
}

function isDifficultyRecord(value: unknown): value is DifficultyMemoryRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.labelLocked === "boolean" &&
    typeof value.archived === "boolean" &&
    Array.isArray(value.aliases) &&
    value.aliases.every((alias) => typeof alias === "string") &&
    Array.isArray(value.persons) &&
    value.persons.every(isDifficultyPersonRecord) &&
    Array.isArray(value.entries) &&
    value.entries.every(isDifficultyEntryRecord)
  );
}

export async function getOwnedPeopleMemoryWork(
  context: SessionDataContext,
  avatarId: SessionAvatarId,
  options: { maxChars?: number } = {},
): Promise<SessionDataResult<PeopleMemoryWork>> {
  const result = await context.supabase.rpc("get_people_memory_batch", {
    p_avatar_id: avatarId,
    p_max_chars: options.maxChars ?? PEOPLE_BATCH_DEFAULT_CHARS,
  });
  const value: unknown = result.data;
  if (
    result.error ||
    !isRecord(value) ||
    typeof value.revision !== "string" ||
    typeof value.enabled !== "boolean" ||
    typeof value.topicsEnabled !== "boolean" ||
    !Array.isArray(value.persons) ||
    !value.persons.every(isPersonRecord) ||
    !Array.isArray(value.forgottenPeople) ||
    !value.forgottenPeople.every(isForgottenPerson) ||
    !Array.isArray(value.difficulties) ||
    !value.difficulties.every(isDifficultyRecord) ||
    !Array.isArray(value.messages) ||
    !value.messages.every(isMemoryMessage) ||
    !isWithinPeopleMemoryBudget(value.messages)
  ) {
    return sessionDataError("read_failed");
  }
  return ok({
    revision: value.revision,
    enabled: value.enabled,
    topicsEnabled: value.topicsEnabled,
    persons: value.persons,
    forgottenPeople: value.forgottenPeople,
    difficulties: value.difficulties,
    messages: value.messages,
  });
}

/** `false` = wyścig (rewizja, kursor, źródło, preferencja); błąd RPC = `write_failed`. */
export async function saveOwnedPeopleMemoryWork(
  context: SessionDataContext,
  avatarId: SessionAvatarId,
  input: { revision: string; cursors: AvatarMemoryCursor[]; changes: PeopleMemoryChangeSet },
): Promise<SessionDataResult<boolean>> {
  const result = await context.supabase.rpc("save_people_memory_batch", {
    p_avatar_id: avatarId,
    p_revision: input.revision,
    p_cursors: input.cursors,
    p_changes: input.changes,
  });
  const value: unknown = result.data;
  return result.error || typeof value !== "boolean" ? sessionDataError("write_failed") : ok(value);
}

function isFactSource(value: unknown): value is PersonFact["sources"][number] {
  return isRecord(value) && typeof value.sessionId === "string" && typeof value.conversationAt === "string";
}

function isPersonFact(value: unknown): value is PersonFact {
  return (
    isRecord(value) &&
    hasFactRecordShape(value) &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.sources) &&
    value.sources.every(isFactSource)
  );
}

export function isPersonCard(value: unknown): value is PersonCard {
  return (
    isRecord(value) &&
    hasPersonRecordShape(value, isPersonFact) &&
    isSessionAvatarId(value.avatarId) &&
    typeof value.createdAt === "string" &&
    (value.firstMentionedAt === null || typeof value.firstMentionedAt === "string") &&
    (value.lastMentionedAt === null || typeof value.lastMentionedAt === "string") &&
    typeof value.mentionCount === "number" &&
    Number.isSafeInteger(value.mentionCount)
  );
}

function toPersonCard(value: unknown): SessionDataResult<PersonCard | null> {
  if (value === null || value === undefined) return ok(null);
  return isPersonCard(value) ? ok(value) : sessionDataError("read_failed");
}

export async function listOwnedPersonCards(
  context: SessionDataContext,
  avatarId: SessionAvatarId,
): Promise<SessionDataResult<PersonCard[]>> {
  const result = await context.supabase.rpc("list_person_cards", { p_avatar_id: avatarId });
  const value: unknown = result.data;
  if (result.error || !Array.isArray(value) || !value.every(isPersonCard)) return sessionDataError("read_failed");
  return ok(value);
}

/** `null` = brak karty właściciela o tym id (nigdy cudza). */
export async function getOwnedPersonCard(
  context: SessionDataContext,
  personId: string,
): Promise<SessionDataResult<PersonCard | null>> {
  const result = await context.supabase.rpc("get_person_card", { p_person_id: personId });
  return result.error ? sessionDataError("read_failed") : toPersonCard(result.data);
}

export interface UpdateOwnedPersonCardInput {
  personId: string;
  displayName: string;
  relation: string | null;
  userNote: string;
}

export async function updateOwnedPersonCard(
  context: SessionDataContext,
  input: UpdateOwnedPersonCardInput,
): Promise<SessionDataResult<PersonCard | null>> {
  const result = await context.supabase.rpc("update_person_card", {
    p_person_id: input.personId,
    p_display_name: input.displayName,
    p_relation: input.relation,
    p_user_note: input.userNote,
  });
  return result.error ? sessionDataError("write_failed") : toPersonCard(result.data);
}

export async function updateOwnedPersonFact(
  context: SessionDataContext,
  factId: string,
  text: string,
): Promise<SessionDataResult<PersonCard | null>> {
  const result = await context.supabase.rpc("update_person_fact", { p_fact_id: factId, p_text: text });
  return result.error ? sessionDataError("write_failed") : toPersonCard(result.data);
}

export interface DeletedPersonFact {
  personId: string;
  /** `null`, gdy usunięty wpis był ostatnim i osoba zniknęła razem z nim. */
  card: PersonCard | null;
}

/** `null` = brak takiego wpisu właściciela. */
export async function deleteOwnedPersonFact(
  context: SessionDataContext,
  factId: string,
): Promise<SessionDataResult<DeletedPersonFact | null>> {
  const result = await context.supabase.rpc("delete_person_fact", { p_fact_id: factId });
  const value: unknown = result.data;
  if (result.error) return sessionDataError("write_failed");
  if (value === null || value === undefined) return ok(null);
  if (!isRecord(value) || typeof value.personId !== "string") return sessionDataError("read_failed");
  const card = toPersonCard(value.card);
  return card.ok ? ok({ personId: value.personId, card: card.data }) : card;
}

/** `false` = brak takiej karty właściciela. Unieważnia też pamięć awatara. */
export async function forgetOwnedPerson(
  context: SessionDataContext,
  personId: string,
): Promise<SessionDataResult<boolean>> {
  const result = await context.supabase.rpc("forget_person", { p_person_id: personId });
  const value: unknown = result.data;
  return result.error || typeof value !== "boolean" ? sessionDataError("write_failed") : ok(value);
}

export async function setOwnedPeopleMemoryEnabled(
  context: SessionDataContext,
  enabled: boolean,
): Promise<SessionDataResult<boolean>> {
  const result = await context.supabase.rpc("set_people_memory_enabled", { p_enabled: enabled });
  const value: unknown = result.data;
  return result.error || typeof value !== "boolean" ? sessionDataError("write_failed") : ok(value);
}

export async function disableAndDeleteOwnedPeopleMemory(
  context: SessionDataContext,
): Promise<SessionDataResult<boolean>> {
  const result = await context.supabase.rpc("disable_and_delete_people_memory");
  const value: unknown = result.data;
  return result.error || typeof value !== "boolean" ? sessionDataError("write_failed") : ok(value);
}

/** Brak wiersza preferencji = domyślnie włączone. */
export async function readOwnedPeopleMemoryEnabled(context: SessionDataContext): Promise<SessionDataResult<boolean>> {
  const { data, error } = await context.supabase
    .from("user_preferences")
    .select("people_memory_enabled")
    .eq("user_id", context.user.id)
    .maybeSingle();
  const value: unknown = data;
  if (error) return sessionDataError("read_failed");
  if (value === null) return ok(true);
  return isRecord(value) && typeof value.people_memory_enabled === "boolean"
    ? ok(value.people_memory_enabled)
    : sessionDataError("read_failed");
}

/** Czy właściciel ma jakiekolwiek karty (dowolna perspektywa) — bez treści. */
export async function hasOwnedPeopleRows(context: SessionDataContext): Promise<SessionDataResult<boolean>> {
  const { count, error } = await context.supabase
    .from("people_persons")
    .select("id", { count: "exact", head: true })
    .eq("user_id", context.user.id);
  if (error) return sessionDataError("read_failed");
  return ok(typeof count === "number" && count > 0);
}
