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

export interface GenerateSessionSummaryInput {
  messages: readonly SessionSummaryConversationMessage[];
  /** Obecność (również pustego tekstu) włącza aktualizację pamięci całej historii awatara. */
  continuityMemory?: string;
  modality?: SessionSummaryModalityContext;
  locale?: string;
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
