import type { PersonCard } from "@/lib/session-data/types";
import {
  PEOPLE_FACT_MAX_CHARS,
  PEOPLE_NAME_MAX_CHARS,
  PEOPLE_NOTE_MAX_CHARS,
  PEOPLE_RELATION_MAX_CHARS,
  countUnicodeChars,
} from "@/lib/session-summary/people-memory-budget";
import { isRecord } from "@/lib/type-guards";

export { parseSessionIdParam as parsePersonIdParam } from "./session-id";

/**
 * Kontrakt tras `/api/session/people/*` i `/api/profile/people-memory`.
 * Ręczne strażniki zamiast schematu: odpowiedzi niosą stabilne kody, nigdy
 * surowe komunikaty Supabase.
 */
export type PeopleFailureCode =
  | "missing_auth"
  | "account_blocked"
  | "account_access_unavailable"
  | "session_data_unavailable"
  | "people_memory_unavailable"
  | "validation_failed"
  | "person_not_found"
  | "fact_not_found"
  | "read_failed"
  | "update_failed"
  | "forget_failed"
  | "delete_failed";

export interface PeopleFailureResponse {
  ok: false;
  type: "people_error";
  code: PeopleFailureCode;
}

export interface PeopleListSuccessResponse {
  ok: true;
  type: "people_list";
  cards: PersonCard[];
}

export interface PersonUpdateSuccessResponse {
  ok: true;
  type: "person_updated";
  card: PersonCard;
}

export interface PersonForgetSuccessResponse {
  ok: true;
  type: "person_forgotten";
  personId: string;
}

/** `card` jest `null`, gdy usunięty wpis był ostatnim i karta zniknęła razem z nim. */
export interface PersonFactDeletedResponse {
  ok: true;
  type: "person_fact_deleted";
  personId: string;
  card: PersonCard | null;
}

export type PeopleListResponse = PeopleListSuccessResponse | PeopleFailureResponse;
export type PersonUpdateResponse = PersonUpdateSuccessResponse | PeopleFailureResponse;
export type PersonForgetResponse = PersonForgetSuccessResponse | PeopleFailureResponse;
export type PersonFactDeleteResponse = PersonFactDeletedResponse | PeopleFailureResponse;

export const PEOPLE_LIMITS = {
  displayName: PEOPLE_NAME_MAX_CHARS,
  relation: PEOPLE_RELATION_MAX_CHARS,
  userNote: PEOPLE_NOTE_MAX_CHARS,
  fact: PEOPLE_FACT_MAX_CHARS,
} as const;

export interface PersonUpdateRequest {
  displayName: string;
  relation: string | null;
  userNote: string;
}

export interface FactUpdateRequest {
  text: string;
}

export function peopleFailure(code: PeopleFailureCode): PeopleFailureResponse {
  return { ok: false, type: "people_error", code };
}

export function getPeopleFailureStatus(code: PeopleFailureCode) {
  switch (code) {
    case "missing_auth":
      return 401;
    case "account_blocked":
      return 403;
    case "validation_failed":
      return 400;
    case "person_not_found":
    case "fact_not_found":
    case "people_memory_unavailable":
      return 404;
    case "update_failed":
    case "forget_failed":
    case "delete_failed":
      return 500;
    default:
      return 503;
  }
}

/** Statusy strony ustawień po przekierowaniu z formularzy (`?people=`). */
export const PEOPLE_SETTINGS_STATUS_CODES = [
  "saved",
  "save_failed",
  "deleted",
  "delete_failed",
  "delete_confirmation_required",
  "unavailable",
] as const;

export type PeopleSettingsStatusCode = (typeof PEOPLE_SETTINGS_STATUS_CODES)[number];

export function isPeopleSettingsStatusCode(value: unknown): value is PeopleSettingsStatusCode {
  return typeof value === "string" && (PEOPLE_SETTINGS_STATUS_CODES as readonly string[]).includes(value);
}

/** `null` = pole puste albo nieobecne; `undefined` = zły typ albo za długie. */
function readBoundedText(value: unknown, maxChars: number): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (countUnicodeChars(text) > maxChars) return undefined;
  return text.length > 0 ? text : null;
}

/** Pusta relacja i notatka są dozwolone (`null` / `""`); puste imię nie. */
export function parsePersonUpdateRequest(body: unknown): PersonUpdateRequest | null {
  if (!isRecord(body)) return null;
  const displayName = readBoundedText(body.displayName, PEOPLE_LIMITS.displayName);
  const relation = readBoundedText(body.relation, PEOPLE_LIMITS.relation);
  const userNote = readBoundedText(body.userNote, PEOPLE_LIMITS.userNote);
  if (!displayName || relation === undefined || userNote === undefined) return null;

  return { displayName, relation, userNote: userNote ?? "" };
}

export function parseFactUpdateRequest(body: unknown): FactUpdateRequest | null {
  if (!isRecord(body)) return null;
  const text = readBoundedText(body.text, PEOPLE_LIMITS.fact);
  return text ? { text } : null;
}

function isResponseRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPeopleListSuccess(value: unknown): value is PeopleListSuccessResponse {
  return isResponseRecord(value) && value.ok === true && value.type === "people_list" && Array.isArray(value.cards);
}

export function isPersonUpdateSuccess(value: unknown): value is PersonUpdateSuccessResponse {
  return isResponseRecord(value) && value.ok === true && value.type === "person_updated" && isRecord(value.card);
}

export function isPersonForgetSuccess(value: unknown): value is PersonForgetSuccessResponse {
  return isResponseRecord(value) && value.ok === true && value.type === "person_forgotten";
}

export function isPersonFactDeleted(value: unknown): value is PersonFactDeletedResponse {
  return isResponseRecord(value) && value.ok === true && value.type === "person_fact_deleted";
}

export function isPeopleFailure(value: unknown): value is PeopleFailureResponse {
  return (
    isResponseRecord(value) && value.ok === false && value.type === "people_error" && typeof value.code === "string"
  );
}
