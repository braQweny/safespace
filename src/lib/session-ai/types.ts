import type { Locale } from "@/lib/i18n/locale";
import type { SessionAiErrorCategory } from "./errors";
import type { SessionLensId } from "./session-lenses";

export type SessionAiProviderName = "openrouter" | "openai";

export type SessionAiMessageRole = "user" | "assistant";

export interface SessionAiRecentMessage {
  role: SessionAiMessageRole;
  content: string;
  sequenceIndex?: number;
}

export interface SessionAiApprovedSummaryContext {
  summaryText: string;
  createdAt?: string;
  updatedAt?: string;
  revision?: number;
}

export interface SessionAiModalityContext {
  modalityName: string;
  avatarName: string;
  sessionStyleHint: string;
  /** Przykłady rejestru już wybrane dla języka rozmowy; `session-ai` nie zna katalogu. */
  registerExamples?: readonly string[];
}

export interface SessionAiConstraint {
  id: string;
  instruction: string;
}

/**
 * Relative position in the session's arc, resolved by
 * `session-flow/session-phase`. Deliberately a label rather than a remaining-time
 * value: the model shapes the reply around the phase without ever learning — or
 * being able to quote — the clock.
 */
export type SessionAiSessionPhase = "opening" | "middle" | "closing";

export interface GenerateSessionResponseInput {
  /**
   * The user's message for a normal reply turn. Required in `"reply"` mode,
   * absent in `"opening"` mode, where the avatar starts the conversation.
   */
  currentUserMessage?: string;
  /** Defaults to `"reply"` — one avatar answer to the user's message. */
  mode?: SessionAiGenerationMode;
  modality: SessionAiModalityContext;
  sessionPhase?: SessionAiSessionPhase;
  cautionConstraints?: readonly SessionAiConstraint[];
  recentMessages?: readonly SessionAiRecentMessage[];
  approvedSummaries?: readonly SessionAiApprovedSummaryContext[];
  avatarMemory?: string;
  /** Przypięty brief kart osób z tej samej prywatnej kopii co pamięć awatara. */
  peopleBrief?: string;
  /** Przypięty brief mapy tematów: trudności, osoby przy nich i sposoby z rozmów. */
  topicBrief?: string;
  /** Soczewka tematyczna lepka na sesję; dokleja moduł „co słyszeć i o co pytać” do sekcji nurtu. */
  sessionLens?: SessionLensId;
  /** Język odpowiedzi — język interfejsu w chwili żądania. */
  locale: Locale;
}

/**
 * `"reply"` answers the user's last message; `"opening"` produces the very first
 * message of a fresh or summary-backed session, spoken by the avatar alone.
 */
export type SessionAiGenerationMode = "reply" | "opening";

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
