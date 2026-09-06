/**
 * Limity kart osób. Długości liczymy w znakach Unicode (`Array.from`), tak jak
 * `length()` w PostgreSQL — te same wartości siedzą w migracji
 * `20260906120000_add_people_memory.sql` i są spięte testem dryfu schematu.
 */
export const PEOPLE_FACT_KINDS = ["who", "account", "feeling", "wish"] as const;

export type PeopleFactKind = (typeof PEOPLE_FACT_KINDS)[number];

export function isPeopleFactKind(value: unknown): value is PeopleFactKind {
  return typeof value === "string" && (PEOPLE_FACT_KINDS as readonly string[]).includes(value);
}

export const PEOPLE_MAX_PERSONS = 40;
export const PEOPLE_MAX_FACTS_PER_PERSON = 12;
export const PEOPLE_NAME_MAX_CHARS = 60;
export const PEOPLE_RELATION_MAX_CHARS = 80;
export const PEOPLE_FACT_MAX_CHARS = 200;
export const PEOPLE_NOTE_MAX_CHARS = 600;

// Partia ekstrakcji jest mniejsza niż partia pamięci: prompt niesie jeszcze
// indeks istniejących osób. Przepełniona odpowiedź dzieli partię na pół.
export const PEOPLE_BATCH_DEFAULT_CHARS = 16_000;
export const PEOPLE_BATCH_MIN_CHARS = 2_000;
export const PEOPLE_BATCH_MAX_CHARS = 24_000;
export const PEOPLE_BATCH_MAX_MESSAGES = 128;

export const PEOPLE_BRIEF_MAX_CHARS = 6000;
export const PEOPLE_BRIEF_MAX_PERSONS = 10;
export const PEOPLE_BRIEF_MAX_FACTS = 4;

export const PEOPLE_RESPONSE_MAX_NEW_PERSONS = 20;
export const PEOPLE_RESPONSE_MAX_FACTS = 60;

export function countUnicodeChars(value: string) {
  return Array.from(value).length;
}

/** Ta sama reguła co `private.normalize_person_name` w bazie. */
export function normalizePersonName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isWithinPeopleMemoryBudget(messages: readonly { content: string }[]) {
  return (
    messages.length <= PEOPLE_BATCH_MAX_MESSAGES &&
    messages.reduce((total, message) => total + countUnicodeChars(message.content), 0) <= PEOPLE_BATCH_MAX_CHARS
  );
}
