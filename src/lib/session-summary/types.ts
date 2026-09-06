import type { Locale } from "@/lib/i18n/locale";

export type SessionSummaryProviderName = "openrouter";
export type SessionSummaryMessageRole = "user" | "assistant";

export interface SessionSummaryConversationMessage {
  role: SessionSummaryMessageRole;
  content: string;
  sequenceIndex?: number;
  /** Lokalny numer rozmowy w partii pamięci; nigdy identyfikator sesji z bazy. */
  conversationIndex?: number;
}

export interface SessionSummaryModalityContext {
  modalityName: string;
  avatarName: string;
  /**
   * Deliberately not the full `sessionStyleHint`: a summary needs the modality
   * lens, not the avatar's conversational rules. Sending the whole style hint
   * here used to overflow the prompt budget and silently truncate its tail.
   */
  summaryLensHint: string;
}

/**
 * Osoba, o której użytkownik kazał zapomnieć (imię i relacja po normalizacji).
 * Pamięć awatara i karty osób pomijają ją przy każdej kolejnej partii.
 */
export interface ForgottenPerson {
  name: string;
  relation: string | null;
}

export interface GenerateSessionSummaryInput {
  messages: readonly SessionSummaryConversationMessage[];
  /** Obecność (również pustego tekstu) włącza aktualizację pamięci całej historii awatara. */
  continuityMemory?: string;
  /** Tylko w trybie pamięci: osoby do pominięcia i usunięcia z poprzedniej pamięci. */
  forgottenPeople?: readonly ForgottenPerson[];
  modality?: SessionSummaryModalityContext;
  /** Język podsumowania — język interfejsu w chwili żądania. */
  locale: Locale;
}

export interface SessionSummaryPromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface SessionSummaryTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export type SessionSummaryFinishReason = "stop" | "length" | "content_filter" | "tool_calls" | "unknown";

export interface SessionSummaryProviderMetadata {
  provider: SessionSummaryProviderName;
  model: string;
  finishReason?: SessionSummaryFinishReason;
  usage?: SessionSummaryTokenUsage;
}

export interface SessionSummaryResponse {
  summaryText: string;
  providerMetadata: SessionSummaryProviderMetadata;
}
