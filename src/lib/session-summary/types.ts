export type SessionSummaryProviderName = "openrouter";
export type SessionSummaryMessageRole = "user" | "assistant";

export interface SessionSummaryConversationMessage {
  role: SessionSummaryMessageRole;
  content: string;
  sequenceIndex?: number;
}

export interface SessionSummaryModalityContext {
  modalityName: string;
  avatarName: string;
  sessionStyleHint: string;
}

export interface GenerateSessionSummaryInput {
  messages: readonly SessionSummaryConversationMessage[];
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
