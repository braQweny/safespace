import type { SessionLensId } from "@/lib/session-ai/session-lenses";

export interface SessionLensInput {
  currentUserMessage: string;
  /**
   * Własne wcześniejsze tury użytkownika (najnowsza ostatnia), już ograniczone
   * przez wywołującego — te same, które dostaje klasyfikator bezpieczeństwa.
   */
  recentUserMessages?: readonly string[];
}

/** Etykieta z modelu: soczewka albo `none`, gdy żaden temat nie dominuje. */
export type ProviderLensLabel = SessionLensId | "none";

export interface SessionLensUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface ProviderLensDecision {
  lens: ProviderLensLabel;
  usage?: SessionLensUsage;
}

export interface DetectSessionLensOptions {
  timeoutMs?: number;
}

export interface SessionLensProvider {
  detect(input: SessionLensInput, options?: DetectSessionLensOptions): Promise<ProviderLensDecision>;
}

export type SessionLensFailureCategory =
  | "missing_configuration"
  | "provider_timeout"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "invalid_provider_response";

export class SessionLensProviderError extends Error {
  readonly category: SessionLensFailureCategory;

  constructor(category: SessionLensFailureCategory) {
    super(category);
    this.name = "SessionLensProviderError";
    this.category = category;
  }
}

/**
 * Wynik wykrywania nigdy nie jest wyjątkiem: porażka to brak soczewki dla tej
 * tury (fail-open), a tura idzie dalej bez niej.
 */
export type SessionLensDetectionResult =
  | { outcome: "detected"; lens: SessionLensId; durationMs: number; usage?: SessionLensUsage }
  | { outcome: "none"; durationMs: number; usage?: SessionLensUsage }
  | { outcome: "failed"; reasonCode: SessionLensFailureCategory; durationMs: number };
