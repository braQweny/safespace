import type { Locale } from "@/lib/i18n/locale";
import type { PeopleFactKind } from "./people-memory-budget";
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

export interface GeneratePeopleMemoryInput {
  locale: Locale;
  /** Imię awatara — model nie tworzy dla niego karty. */
  avatarFirstName: string;
  persons: readonly PeoplePromptPerson[];
  forgottenPeople: readonly ForgottenPerson[];
  messages: readonly SessionSummaryConversationMessage[];
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

export interface PeopleMemoryChanges {
  newPersons: PeopleMemoryNewPerson[];
  updates: PeopleMemoryPersonUpdate[];
  /** Model nie zmieścił wszystkiego w limitach odpowiedzi — partię trzeba podzielić. */
  incomplete: boolean;
}

export interface PeopleMemoryResponse {
  changes: PeopleMemoryChanges;
  providerMetadata: SessionSummaryProviderMetadata;
}

/** Co parser uznaje za znane: refy z indeksu i liczba rozmów w partii. */
export interface PeopleMemoryRefIndex {
  personRefs: ReadonlySet<number>;
  factRefsByPerson: ReadonlyMap<number, ReadonlySet<number>>;
  conversationCount: number;
}
