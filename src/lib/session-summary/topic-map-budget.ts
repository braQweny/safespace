import { normalizePersonName } from "./people-memory-budget";

/**
 * Limity mapy tematów. Długości liczymy w znakach Unicode (`Array.from`), tak
 * jak `length()` w PostgreSQL — te same wartości siedzą w migracji
 * `20260906190000_add_topic_map.sql` i są spięte testem dryfu schematu.
 */
export const DIFFICULTY_ENTRY_KINDS = ["how", "coping", "update", "suggested", "agreed", "outcome"] as const;

export type DifficultyEntryKind = (typeof DIFFICULTY_ENTRY_KINDS)[number];

export function isDifficultyEntryKind(value: unknown): value is DifficultyEntryKind {
  return typeof value === "string" && (DIFFICULTY_ENTRY_KINDS as readonly string[]).includes(value);
}

/** Ocena użytkownika: tylko na „jak jest teraz” i „jak poszło”, tylko z jego słów. */
export const DIFFICULTY_EFFECTS = ["better", "same", "worse", "resolved", "mixed"] as const;

export type DifficultyEffect = (typeof DIFFICULTY_EFFECTS)[number];

export function isDifficultyEffect(value: unknown): value is DifficultyEffect {
  return typeof value === "string" && (DIFFICULTY_EFFECTS as readonly string[]).includes(value);
}

export const DIFFICULTY_EFFECT_KINDS = ["update", "outcome"] as const satisfies readonly DifficultyEntryKind[];

export function allowsDifficultyEffect(kind: DifficultyEntryKind) {
  return (DIFFICULTY_EFFECT_KINDS as readonly DifficultyEntryKind[]).includes(kind);
}

/**
 * Dozwolone pary dziecko → rodzic: postanowienie pod propozycją, „jak poszło”
 * pod propozycją albo postanowieniem (feedback bez wcześniejszej zgody).
 */
export const DIFFICULTY_PARENT_KINDS: Readonly<Partial<Record<DifficultyEntryKind, readonly DifficultyEntryKind[]>>> = {
  agreed: ["suggested"],
  outcome: ["suggested", "agreed"],
};

export function isAllowedDifficultyParent(child: DifficultyEntryKind, parent: DifficultyEntryKind) {
  return DIFFICULTY_PARENT_KINDS[child]?.includes(parent) ?? false;
}

export const DIFFICULTY_PERSON_STATES = ["suggested", "confirmed", "rejected"] as const;

export type DifficultyPersonState = (typeof DIFFICULTY_PERSON_STATES)[number];

export function isDifficultyPersonState(value: unknown): value is DifficultyPersonState {
  return typeof value === "string" && (DIFFICULTY_PERSON_STATES as readonly string[]).includes(value);
}

export const DIFFICULTY_MAX_PER_AVATAR = 30;
export const DIFFICULTY_MAX_ENTRIES = 12;
export const DIFFICULTY_MAX_PERSONS = 5;
export const DIFFICULTY_MAX_ALIASES = 6;
/** Ruchome okno „jak jest teraz”, poza limitem wpisów; edytowane nie wypadają. */
export const DIFFICULTY_UPDATE_WINDOW = 6;
export const DIFFICULTY_LABEL_MAX_CHARS = 60;
export const DIFFICULTY_ALIAS_MAX_CHARS = 60;
export const DIFFICULTY_ENTRY_MAX_CHARS = 200;
export const DIFFICULTY_NOTE_MAX_CHARS = 600;

export const DIFFICULTY_RESPONSE_MAX_NEW = 10;
export const DIFFICULTY_RESPONSE_MAX_ENTRIES = 40;
export const DIFFICULTY_RESPONSE_MAX_ALIASES = 12;

// Indeks w prompcie: wszystkie propozycje i postanowienia (model podpina
// pod nie feedback) z najnowszym rezultatem każdego, do tego okno ostatnich
// wpisów pozostałych rodzajów; refy dostają tylko pokazane wpisy.
export const DIFFICULTY_INDEX_MAX_UPDATES = 3;
export const DIFFICULTY_INDEX_MAX_PER_DESCRIPTIVE_KIND = 2;
export const DIFFICULTY_INDEX_MAX_ORPHAN_OUTCOMES = 2;
export const DIFFICULTY_INDEX_TEXT_MAX_CHARS = 120;

/** Ta sama reguła co `private.normalize_difficulty_label` w bazie. */
export const normalizeDifficultyLabel = normalizePersonName;
