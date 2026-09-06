import type { DifficultyCard } from "@/lib/session-data/types";
import {
  DIFFICULTY_ENTRY_MAX_CHARS,
  DIFFICULTY_LABEL_MAX_CHARS,
  DIFFICULTY_NOTE_MAX_CHARS,
} from "@/lib/session-summary/topic-map-budget";
import { countUnicodeChars } from "@/lib/session-summary/people-memory-budget";
import { isRecord } from "@/lib/type-guards";
import { parseSessionIdParam } from "./session-id";

export { parseSessionIdParam as parseDifficultyIdParam } from "./session-id";

/**
 * Kontrakt tras `/api/session/topics/*` i `/api/profile/topic-map` (wzór:
 * `people-contract.ts`). Ręczne strażniki zamiast schematu; odpowiedzi niosą
 * stabilne kody, nigdy surowe komunikaty Supabase ani etykiety w logach.
 */
export type TopicFailureCode =
  | "missing_auth"
  | "account_blocked"
  | "account_access_unavailable"
  | "session_data_unavailable"
  | "topic_map_unavailable"
  | "validation_failed"
  | "difficulty_not_found"
  | "entry_not_found"
  | "person_not_found"
  | "duplicate_difficulty_label"
  | "read_failed"
  | "update_failed"
  | "merge_failed"
  | "delete_failed";

export interface TopicFailureResponse {
  ok: false;
  type: "topic_error";
  code: TopicFailureCode;
}

export interface TopicListSuccessResponse {
  ok: true;
  type: "topic_list";
  cards: DifficultyCard[];
}

export interface DifficultyUpdateSuccessResponse {
  ok: true;
  type: "difficulty_updated";
  card: DifficultyCard;
}

export interface DifficultyDeletedResponse {
  ok: true;
  type: "difficulty_deleted";
  difficultyId: string;
}

/** `card` jest `null`, gdy usunięty wpis był ostatnim i trudność zniknęła razem z nim. */
export interface DifficultyEntryDeletedResponse {
  ok: true;
  type: "difficulty_entry_deleted";
  difficultyId: string;
  card: DifficultyCard | null;
}

/** Po scaleniu źródło znika, a `card` to cel ze wszystkim, co przejął. */
export interface DifficultyMergedResponse {
  ok: true;
  type: "difficulty_merged";
  sourceId: string;
  card: DifficultyCard;
}

export type TopicListResponse = TopicListSuccessResponse | TopicFailureResponse;
export type DifficultyUpdateResponse = DifficultyUpdateSuccessResponse | TopicFailureResponse;
export type DifficultyDeleteResponse = DifficultyDeletedResponse | TopicFailureResponse;
export type DifficultyEntryDeleteResponse = DifficultyEntryDeletedResponse | TopicFailureResponse;
export type DifficultyMergeResponse = DifficultyMergedResponse | TopicFailureResponse;

export const TOPIC_LIMITS = {
  label: DIFFICULTY_LABEL_MAX_CHARS,
  userNote: DIFFICULTY_NOTE_MAX_CHARS,
  entry: DIFFICULTY_ENTRY_MAX_CHARS,
} as const;

export interface DifficultyUpdateRequest {
  label: string;
  userNote: string;
  archived: boolean;
}

export interface DifficultyEntryUpdateRequest {
  text: string;
}

export type DifficultyPersonDecision = "confirmed" | "rejected";

export interface DifficultyPersonDecisionRequest {
  state: DifficultyPersonDecision;
}

export interface DifficultyMergeRequest {
  targetId: string;
}

export function topicFailure(code: TopicFailureCode): TopicFailureResponse {
  return { ok: false, type: "topic_error", code };
}

export function getTopicFailureStatus(code: TopicFailureCode) {
  switch (code) {
    case "missing_auth":
      return 401;
    case "account_blocked":
      return 403;
    case "validation_failed":
      return 400;
    case "difficulty_not_found":
    case "entry_not_found":
    case "person_not_found":
    case "topic_map_unavailable":
      return 404;
    case "duplicate_difficulty_label":
      return 409;
    case "update_failed":
    case "merge_failed":
    case "delete_failed":
      return 500;
    default:
      return 503;
  }
}

/** Statusy strony ustawień po przekierowaniu z formularzy (`?topics=`). */
export const TOPIC_SETTINGS_STATUS_CODES = [
  "saved",
  "save_failed",
  "deleted",
  "delete_failed",
  "delete_confirmation_required",
  "unavailable",
] as const;

export type TopicSettingsStatusCode = (typeof TOPIC_SETTINGS_STATUS_CODES)[number];

export function isTopicSettingsStatusCode(value: unknown): value is TopicSettingsStatusCode {
  return typeof value === "string" && (TOPIC_SETTINGS_STATUS_CODES as readonly string[]).includes(value);
}

/** `null` = pole puste albo nieobecne; `undefined` = zły typ albo za długie. */
function readBoundedText(value: unknown, maxChars: number): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (countUnicodeChars(text) > maxChars) return undefined;
  return text.length > 0 ? text : null;
}

/** Pusta notatka jest dozwolona; pusta etykieta nie. `archived` domyślnie `false`. */
export function parseDifficultyUpdateRequest(body: unknown): DifficultyUpdateRequest | null {
  if (!isRecord(body)) return null;
  const label = readBoundedText(body.label, TOPIC_LIMITS.label);
  const userNote = readBoundedText(body.userNote, TOPIC_LIMITS.userNote);
  const archived = body.archived ?? false;
  if (!label || userNote === undefined || typeof archived !== "boolean") return null;

  return { label, userNote: userNote ?? "", archived };
}

export function parseDifficultyEntryUpdateRequest(body: unknown): DifficultyEntryUpdateRequest | null {
  if (!isRecord(body)) return null;
  const text = readBoundedText(body.text, TOPIC_LIMITS.entry);
  return text ? { text } : null;
}

export function parseDifficultyPersonDecisionRequest(body: unknown): DifficultyPersonDecisionRequest | null {
  if (!isRecord(body)) return null;
  return body.state === "confirmed" || body.state === "rejected" ? { state: body.state } : null;
}

/** Cel scalenia jako UUID; źródłem jest trudność z adresu trasy. */
export function parseDifficultyMergeRequest(body: unknown): DifficultyMergeRequest | null {
  if (!isRecord(body)) return null;
  const targetId = typeof body.targetId === "string" ? parseSessionIdParam(body.targetId) : null;
  return targetId ? { targetId } : null;
}

function isResponseRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTopicListSuccess(value: unknown): value is TopicListSuccessResponse {
  return isResponseRecord(value) && value.ok === true && value.type === "topic_list" && Array.isArray(value.cards);
}

export function isDifficultyUpdateSuccess(value: unknown): value is DifficultyUpdateSuccessResponse {
  return isResponseRecord(value) && value.ok === true && value.type === "difficulty_updated" && isRecord(value.card);
}

export function isDifficultyDeleted(value: unknown): value is DifficultyDeletedResponse {
  return (
    isResponseRecord(value) &&
    value.ok === true &&
    value.type === "difficulty_deleted" &&
    typeof value.difficultyId === "string"
  );
}

export function isDifficultyEntryDeleted(value: unknown): value is DifficultyEntryDeletedResponse {
  return (
    isResponseRecord(value) &&
    value.ok === true &&
    value.type === "difficulty_entry_deleted" &&
    typeof value.difficultyId === "string"
  );
}

export function isDifficultyMerged(value: unknown): value is DifficultyMergedResponse {
  return (
    isResponseRecord(value) &&
    value.ok === true &&
    value.type === "difficulty_merged" &&
    typeof value.sourceId === "string" &&
    isRecord(value.card)
  );
}

export function isTopicFailure(value: unknown): value is TopicFailureResponse {
  return (
    isResponseRecord(value) && value.ok === false && value.type === "topic_error" && typeof value.code === "string"
  );
}
