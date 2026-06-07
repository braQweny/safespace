import type { SessionAiErrorCategory } from "./errors";

export type SessionAiProviderName = "openrouter";

export type SessionAiMessageRole = "user" | "assistant";

export interface SessionAiRecentMessage {
  role: SessionAiMessageRole;
  content: string;
  sequenceIndex?: number;
}

export interface SessionAiModalityContext {
  modalityName: string;
  avatarName: string;
  sessionStyleHint: string;
}

export interface SessionAiConstraint {
  id: string;
  instruction: string;
}

export interface GenerateSessionResponseInput {
  currentUserMessage: string;
  modality: SessionAiModalityContext;
  cautionConstraints?: readonly SessionAiConstraint[];
  recentMessages?: readonly SessionAiRecentMessage[];
  locale?: string;
}

export interface SessionResponsePromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface SessionAiTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export type SessionAiFinishReason = "stop" | "length" | "content_filter" | "tool_calls" | "unknown";

export interface SessionAiProviderMetadata {
  provider: SessionAiProviderName;
  model: string;
  finishReason?: SessionAiFinishReason;
  usage?: SessionAiTokenUsage;
}

export interface SessionAiResponse {
  assistantText: string;
  providerMetadata: SessionAiProviderMetadata;
}

export interface SessionAiFailureCopy {
  title: string;
  body: string;
  retryLabel: string;
}

export interface SessionAiFailureState {
  category: SessionAiErrorCategory;
  copy: SessionAiFailureCopy;
}
