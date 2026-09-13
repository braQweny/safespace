/**
 * Kontrakt formularza „Usuń zapisane karty” na stronie konta: jeden formularz
 * dla osób i tematów, z wyborem zakresu. Kody statusu wracają w adresie
 * (`?memory=`), więc strona nie może ufać dowolnej wartości z zapytania.
 */
export const MEMORY_DELETE_SCOPES = ["people", "topics", "all"] as const;

export type MemoryDeleteScope = (typeof MEMORY_DELETE_SCOPES)[number];

export function isMemoryDeleteScope(value: unknown): value is MemoryDeleteScope {
  return typeof value === "string" && (MEMORY_DELETE_SCOPES as readonly string[]).includes(value);
}

export const MEMORY_SETTINGS_STATUS_CODES = [
  "deleted_people",
  "deleted_topics",
  "deleted_all",
  "delete_failed",
  "delete_confirmation_required",
  "invalid_scope",
] as const;

export type MemorySettingsStatusCode = (typeof MEMORY_SETTINGS_STATUS_CODES)[number];

export function isMemorySettingsStatusCode(value: unknown): value is MemorySettingsStatusCode {
  return typeof value === "string" && (MEMORY_SETTINGS_STATUS_CODES as readonly string[]).includes(value);
}
