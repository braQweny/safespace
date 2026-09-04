import type { SessionSafetyReasonCode } from "./reason-codes";

export type SessionSafetyRisk = "normal" | "caution" | "crisis";

export type SessionSafetyAction = "allow" | "allow_with_constraints" | "hard_stop";

export type CrisisResourceRegionId = "pl" | "us" | "local_fallback";

export type CrisisResourceContactKind = "emergency_number" | "crisis_line" | "local_guidance";

export interface CrisisResourceContact {
  kind: CrisisResourceContactKind;
  label: string;
  value: string;
  description: string;
}

export interface CrisisResourceRegion {
  id: CrisisResourceRegionId;
  label: string;
  contacts: readonly CrisisResourceContact[];
  note: string;
}

export interface SessionSafetyCopy {
  title: string;
  body: string;
  nextSteps: readonly string[];
}

export interface SessionSafetyConstraint {
  id:
    | "avoid_diagnosis"
    | "avoid_risk_increasing_instructions"
    | "avoid_prescriptive_treatment_claims"
    | "supportive_non_clinical_language";
  instruction: string;
}

export interface SessionSafetyInputMetadata {
  sessionId?: string;
  userId?: string;
  modalityId?: string;
  avatarId?: string;
  locale?: string;
  regionHint?: string;
}

export interface SessionSafetyInput {
  currentUserMessage: string;
  /**
   * The user's own most recent earlier turns of this session (newest last),
   * already bounded by the caller. Context only: it lets the classifier notice
   * gradual escalation instead of judging every message in isolation.
   */
  recentUserMessages?: readonly string[];
  metadata?: SessionSafetyInputMetadata;
}

interface BaseSessionSafetyDecision {
  risk: SessionSafetyRisk;
  action: SessionSafetyAction;
  reasonCode: SessionSafetyReasonCode;
  copy: SessionSafetyCopy | null;
  constraints: readonly SessionSafetyConstraint[];
  crisisResources: readonly CrisisResourceRegion[];
}

export interface AllowSessionSafetyDecision extends BaseSessionSafetyDecision {
  risk: "normal";
  action: "allow";
  reasonCode: "none_detected";
  copy: null;
  constraints: readonly [];
  crisisResources: readonly [];
}

export interface ConstrainedSessionSafetyDecision extends BaseSessionSafetyDecision {
  risk: "caution";
  action: "allow_with_constraints";
  reasonCode: Exclude<
    SessionSafetyReasonCode,
    | "none_detected"
    | "self_harm_signal"
    | "harm_to_others_signal"
    | "immediate_danger_signal"
    | "provider_unavailable"
    | "invalid_provider_response"
    | "missing_configuration"
  >;
  copy: null;
  constraints: readonly SessionSafetyConstraint[];
  crisisResources: readonly [];
}

export interface HardStopSessionSafetyDecision extends BaseSessionSafetyDecision {
  risk: "crisis";
  action: "hard_stop";
  reasonCode: Exclude<SessionSafetyReasonCode, "none_detected" | "ambiguous_distress">;
  copy: SessionSafetyCopy;
  constraints: readonly [];
  crisisResources: readonly CrisisResourceRegion[];
}

export type SessionSafetyDecision =
  AllowSessionSafetyDecision | ConstrainedSessionSafetyDecision | HardStopSessionSafetyDecision;
