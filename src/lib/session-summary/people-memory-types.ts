import type { Locale } from "@/lib/i18n/locale";
import type { PeopleFactKind } from "./people-memory-budget";
import type { DifficultyEffect, DifficultyEntryKind, DifficultyPersonState } from "./topic-map-budget";
import type { ForgottenPerson, SessionSummaryConversationMessage, SessionSummaryProviderMetadata } from "./types";

export type { ForgottenPerson } from "./types";

/**
 * Indeks istniejących osób w prompcie. Refy są lokalne dla jednej partii —
 * identyfikatory z bazy nigdy nie trafiają do providera (jak `conversationIndex`).
 */
export interface PeoplePromptFact {
  ref: number;
  kind: PeopleFactKind;
  text: string;
  /** Poprawione przez użytkownika: model nie może tego zastąpić ani usunąć. */
  userEdited: boolean;
}

export interface PeoplePromptPerson {
  ref: number;
  name: string;
  nameLocked: boolean;
  relation: string | null;
  relationLocked: boolean;
  facts: readonly PeoplePromptFact[];
}

/**
 * Indeks trudności (mapa tematów) w tym samym prompcie: refy lokalne, wpisy
 * pokazane w oknie budżetu (tylko one mają refy), osoby po refach z indeksu osób.
 */
export interface DifficultyPromptEntry {
  ref: number;
  kind: DifficultyEntryKind;
  text: string;
  effect: DifficultyEffect | null;
  personRef: number | null;
  parentRef: number | null;
  userEdited: boolean;
}

export interface DifficultyPromptPerson {
  personRef: number;
  state: DifficultyPersonState;
}

export interface DifficultyPromptItem {
  ref: number;
  label: string;
  labelLocked: boolean;
  /** „Mniej aktualne”: dalej ta sama trudność, nigdy powód do duplikatu. */
  archived: boolean;
  aliases: readonly string[];
  persons: readonly DifficultyPromptPerson[];
  entries: readonly DifficultyPromptEntry[];
}

export interface GeneratePeopleMemoryInput {
  locale: Locale;
  /** Imię awatara — model nie tworzy dla niego karty. */
  avatarFirstName: string;
  persons: readonly PeoplePromptPerson[];
  forgottenPeople: readonly ForgottenPerson[];
  messages: readonly SessionSummaryConversationMessage[];
  /** Karty osób w tej partii: bez nich model nie zwraca osób ani powiązań. Domyślnie włączone. */
  peopleEnabled?: boolean;
  /** Mapa tematów w tej partii: bez niej blok trudności znika z promptu. Domyślnie wyłączona. */
  topicsEnabled?: boolean;
  difficulties?: readonly DifficultyPromptItem[];
}

export interface PeopleMemoryFactDraft {
  kind: PeopleFactKind;
  text: string;
  conversationIndex: number;
}

export interface PeopleMemoryNewPerson {
  name: string;
  relation: string | null;
  facts: PeopleMemoryFactDraft[];
}

export interface PeopleMemoryFactReplacement extends PeopleMemoryFactDraft {
  factRef: number;
}

export interface PeopleMemoryPersonUpdate {
  personRef: number;
  /** `null` = bez zmiany; model nie może wyczyścić relacji. */
  relation: string | null;
  addFacts: PeopleMemoryFactDraft[];
  replaceFacts: PeopleMemoryFactReplacement[];
  removeFactRefs: number[];
  mentionedInConversations: number[];
}

/**
 * Osoba przy trudności: istniejąca po refie albo tworzona w tej samej
 * odpowiedzi po pozycji w `newPersons` (po deduplikacji parsera).
 */
export interface DifficultyPersonLinkDraft {
  personRef: number | null;
  newPersonPosition: number | null;
  /** Niepewne powiązanie → krawędź `suggested`, do potwierdzenia przez użytkownika. */
  uncertain: boolean;
}

export interface DifficultyEntryDraft {
  kind: DifficultyEntryKind;
  text: string;
  effect: DifficultyEffect | null;
  personRef: number | null;
  newPersonPosition: number | null;
  /** Ref istniejącego wpisu z indeksu; w nowej trudności zawsze `null`. */
  parentRef: number | null;
  /** Pozycja wcześniejszego nowego wpisu na tej samej liście (po filtrach parsera). */
  parentPosition: number | null;
  conversationIndex: number;
}

/** Poprawka w miejscu: id i rodzaj zostają, zmienia się tekst i ocena. */
export interface DifficultyEntryReplacement {
  entryRef: number;
  kind: DifficultyEntryKind;
  text: string;
  effect: DifficultyEffect | null;
  conversationIndex: number;
}

export interface PeopleMemoryNewDifficulty {
  label: string;
  aliases: string[];
  persons: DifficultyPersonLinkDraft[];
  entries: DifficultyEntryDraft[];
}

export interface PeopleMemoryDifficultyUpdate {
  difficultyRef: number;
  addAliases: string[];
  addPersons: DifficultyPersonLinkDraft[];
  addEntries: DifficultyEntryDraft[];
  replaceEntries: DifficultyEntryReplacement[];
  removeEntryRefs: number[];
  mentionedInConversations: number[];
}

export interface PeopleMemoryChanges {
  newPersons: PeopleMemoryNewPerson[];
  updates: PeopleMemoryPersonUpdate[];
  newDifficulties: PeopleMemoryNewDifficulty[];
  difficultyUpdates: PeopleMemoryDifficultyUpdate[];
  /** Model nie zmieścił wszystkiego w limitach odpowiedzi — partię trzeba podzielić. */
  incomplete: boolean;
}

export interface PeopleMemoryResponse {
  changes: PeopleMemoryChanges;
  providerMetadata: SessionSummaryProviderMetadata;
}

/** Co parser uznaje za znane: refy z indeksów i liczba rozmów w partii. */
export interface PeopleMemoryRefIndex {
  personRefs: ReadonlySet<number>;
  factRefsByPerson: ReadonlyMap<number, ReadonlySet<number>>;
  difficultyRefs: ReadonlySet<number>;
  /** Rodzaj każdego pokazanego wpisu per trudność — do sprawdzania par rodzic–dziecko. */
  entryKindByRef: ReadonlyMap<number, ReadonlyMap<number, DifficultyEntryKind>>;
  conversationCount: number;
}
