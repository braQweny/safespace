import type { SessionSafetyReasonCode } from "./reason-codes";
import type { SessionSafetyAction, SessionSafetyInput, SessionSafetyRisk } from "./types";

export type ProviderSafetyReasonCode = Extract<
  SessionSafetyReasonCode,
  "none_detected" | "ambiguous_distress" | "self_harm_signal" | "harm_to_others_signal" | "immediate_danger_signal"
>;

export type ProviderSafetyErrorCategory = Extract<
  SessionSafetyReasonCode,
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_rate_limited"
  | "invalid_provider_response"
  | "missing_configuration"
>;

export interface ProviderSafetyDecision {
  risk: SessionSafetyRisk;
  action: SessionSafetyAction;
  reasonCode: ProviderSafetyReasonCode;
}

export interface SessionSafetyProvider {
  classify(input: SessionSafetyInput): Promise<ProviderSafetyDecision>;
}

export class ProviderSafetyError extends Error {
  readonly category: ProviderSafetyErrorCategory;

  constructor(category: ProviderSafetyErrorCategory) {
    super(category);
    this.name = "ProviderSafetyError";
    this.category = category;
  }
}

export const PROVIDER_ACTION_BY_RISK = {
  normal: "allow",
  caution: "allow_with_constraints",
  crisis: "hard_stop",
} as const satisfies Record<SessionSafetyRisk, SessionSafetyAction>;

export const PROVIDER_REASON_CODES = [
  "none_detected",
  "ambiguous_distress",
  "self_harm_signal",
  "harm_to_others_signal",
  "immediate_danger_signal",
] as const satisfies readonly ProviderSafetyReasonCode[];
