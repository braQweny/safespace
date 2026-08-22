import { SESSION_SAFETY_REASON_CODE_VALUES, type SessionSafetyReasonCode } from "@/lib/session-safety/reason-codes";
import type { SessionSafetyDecision } from "@/lib/session-safety/types";
import {
  OPERATIONAL_EVENT_OUTCOMES,
  OPERATIONAL_RISK_STATES,
  OPERATIONAL_SAFETY_ACTIONS,
  type OperationalEvent,
  type OperationalEventLevel,
  type OperationalEventOutcome,
  type OperationalEventProvider,
  type OperationalRiskState,
  type OperationalSafetyAction,
  type OperationalSessionReasonCode,
} from "./types";

const SESSION_AI_PROVIDER_VALUES = ["openrouter"] as const satisfies readonly OperationalEventProvider[];

const SESSION_START_REASON_CODES = [
  "session_start_failed",
  // Free-plan allowance exhausted: a conversion signal, not an incident.
  "session_limit_reached",
  "interrupted",
] as const satisfies readonly OperationalSessionReasonCode[];

const SESSION_OPENING_REASON_CODES = [
  "opening_provider_failed",
  "opening_persistence_failed",
  "opening_unavailable",
] as const satisfies readonly OperationalSessionReasonCode[];

const SESSION_PROVIDER_FAILURE_REASON_CODES = [
  "provider_timeout",
  "provider_rate_limited",
  "provider_unavailable",
  "invalid_provider_response",
  "missing_configuration",
] as const satisfies readonly OperationalSessionReasonCode[];

const SESSION_TIME_LIMIT_REASON_CODES = [
  "time_limit_reached",
] as const satisfies readonly OperationalSessionReasonCode[];
const SESSION_COMPLETED_REASON_CODES = ["completed"] as const satisfies readonly OperationalSessionReasonCode[];
const FAIL_CLOSED_REASON_CODES = [
  "provider_unavailable",
  "invalid_provider_response",
  "missing_configuration",
] as const satisfies readonly SessionSafetyReasonCode[];

export type SessionAiProvider = (typeof SESSION_AI_PROVIDER_VALUES)[number];

export type SessionLifecycleOutcome = Exclude<OperationalEventOutcome, "redirected">;

export type SessionStartReasonCode = (typeof SESSION_START_REASON_CODES)[number];

export type SessionProviderFailureReasonCode = (typeof SESSION_PROVIDER_FAILURE_REASON_CODES)[number];

export type SessionOpeningFailureReasonCode = (typeof SESSION_OPENING_REASON_CODES)[number];

interface SessionEventBaseMetadata {
  requestId?: string;
  outcome?: SessionLifecycleOutcome;
  durationMs?: number;
  userHash?: string;
}

export interface SessionStartAttemptedEventMetadata extends SessionEventBaseMetadata {
  outcome: SessionLifecycleOutcome;
  reasonCode?: SessionStartReasonCode;
}

export interface SessionSafetyEvaluatedEventMetadata extends SessionEventBaseMetadata {
  riskState: OperationalRiskState;
  action: OperationalSafetyAction;
  reasonCode: SessionSafetyReasonCode;
  provider?: SessionAiProvider;
}

export interface SessionProviderFailedEventMetadata extends SessionEventBaseMetadata {
  provider?: SessionAiProvider;
  reasonCode: SessionProviderFailureReasonCode;
}

export type SessionTimeLimitReachedEventMetadata = SessionEventBaseMetadata;

export type SessionCompletedEventMetadata = SessionEventBaseMetadata;

type SessionEventName = Extract<
  OperationalEvent["event"],
  | "session.start_attempted"
  | "session.safety_evaluated"
  | "session.ai_provider_failed"
  | "session.time_limit_reached"
  | "session.completed"
  | "session.opening_failed"
>;

interface SafeSessionEventBase {
  requestId?: string;
  outcome?: SessionLifecycleOutcome;
  durationMs?: number;
  userHash?: string;
}

function hasAllowedValue<const T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function sanitizeShortString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 96 ? trimmed : undefined;
}

function sanitizeDurationMs(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return Math.round(value);
}

function pickBaseMetadata(metadata: SessionEventBaseMetadata): SafeSessionEventBase {
  const requestId = sanitizeShortString(metadata.requestId);
  const outcome = hasAllowedValue(OPERATIONAL_EVENT_OUTCOMES, metadata.outcome) ? metadata.outcome : undefined;
  const durationMs = sanitizeDurationMs(metadata.durationMs);
  const userHash = sanitizeShortString(metadata.userHash);

  return {
    ...(requestId ? { requestId } : {}),
    ...(outcome ? { outcome } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(userHash ? { userHash } : {}),
  };
}

function buildSessionEvent(
  event: SessionEventName,
  level: OperationalEventLevel,
  metadata: SessionEventBaseMetadata,
): OperationalEvent {
  return {
    event,
    level,
    ...pickBaseMetadata(metadata),
  };
}

function getOutcomeLevel(outcome: SessionLifecycleOutcome): OperationalEventLevel {
  if (outcome === "failure" || outcome === "blocked") {
    return "warn";
  }

  return "info";
}

function getSafetyOutcome(action: OperationalSafetyAction): SessionLifecycleOutcome {
  if (action === "hard_stop" || action === "fail_closed") {
    return "blocked";
  }

  return "success";
}

function getSafetyLevel(riskState: OperationalRiskState, action: OperationalSafetyAction): OperationalEventLevel {
  if (action === "fail_closed") {
    return "error";
  }

  if (riskState === "normal") {
    return "info";
  }

  return "warn";
}

function isFailClosedReasonCode(reasonCode: SessionSafetyReasonCode) {
  return hasAllowedValue(FAIL_CLOSED_REASON_CODES, reasonCode);
}

export function mapSessionSafetyDecisionToOperationalMetadata(
  decision: Pick<SessionSafetyDecision, "risk" | "action" | "reasonCode">,
): Pick<SessionSafetyEvaluatedEventMetadata, "riskState" | "action" | "reasonCode"> {
  const reasonCode = hasAllowedValue(SESSION_SAFETY_REASON_CODE_VALUES, decision.reasonCode)
    ? decision.reasonCode
    : "provider_unavailable";
  const riskState = hasAllowedValue(OPERATIONAL_RISK_STATES, decision.risk) ? decision.risk : "crisis";
  const action = isFailClosedReasonCode(reasonCode)
    ? "fail_closed"
    : hasAllowedValue(OPERATIONAL_SAFETY_ACTIONS, decision.action)
      ? decision.action
      : "fail_closed";

  return {
    riskState,
    action,
    reasonCode,
  };
}

export function buildSessionStartAttemptedEvent(metadata: SessionStartAttemptedEventMetadata): OperationalEvent {
  const outcome = hasAllowedValue(OPERATIONAL_EVENT_OUTCOMES, metadata.outcome) ? metadata.outcome : "failure";
  const event = buildSessionEvent("session.start_attempted", getOutcomeLevel(outcome), {
    requestId: metadata.requestId,
    outcome,
    durationMs: metadata.durationMs,
    userHash: metadata.userHash,
  });
  const reasonCode = hasAllowedValue(SESSION_START_REASON_CODES, metadata.reasonCode) ? metadata.reasonCode : undefined;

  return {
    ...event,
    ...(reasonCode ? { reasonCode } : {}),
  };
}

export function buildSessionSafetyEvaluatedEvent(metadata: SessionSafetyEvaluatedEventMetadata): OperationalEvent {
  const riskState = hasAllowedValue(OPERATIONAL_RISK_STATES, metadata.riskState) ? metadata.riskState : "crisis";
  const action = hasAllowedValue(OPERATIONAL_SAFETY_ACTIONS, metadata.action) ? metadata.action : "fail_closed";
  const reasonCode = hasAllowedValue(SESSION_SAFETY_REASON_CODE_VALUES, metadata.reasonCode)
    ? metadata.reasonCode
    : "provider_unavailable";
  const provider = hasAllowedValue(SESSION_AI_PROVIDER_VALUES, metadata.provider) ? metadata.provider : undefined;
  const outcome = metadata.outcome ?? getSafetyOutcome(action);
  const event = buildSessionEvent("session.safety_evaluated", getSafetyLevel(riskState, action), {
    requestId: metadata.requestId,
    outcome,
    durationMs: metadata.durationMs,
    userHash: metadata.userHash,
  });

  return {
    ...event,
    riskState,
    action,
    reasonCode,
    ...(provider ? { provider } : {}),
  };
}

export function buildSessionSafetyEvaluatedEventFromDecision(
  decision: Pick<SessionSafetyDecision, "risk" | "action" | "reasonCode">,
  metadata: SessionEventBaseMetadata & { provider?: SessionAiProvider } = {},
): OperationalEvent {
  const mapped = mapSessionSafetyDecisionToOperationalMetadata(decision);

  return buildSessionSafetyEvaluatedEvent({
    requestId: metadata.requestId,
    outcome: metadata.outcome,
    durationMs: metadata.durationMs,
    userHash: metadata.userHash,
    provider: metadata.provider,
    riskState: mapped.riskState,
    action: mapped.action,
    reasonCode: mapped.reasonCode,
  });
}

export function buildSessionAiProviderFailedEvent(metadata: SessionProviderFailedEventMetadata): OperationalEvent {
  const provider = hasAllowedValue(SESSION_AI_PROVIDER_VALUES, metadata.provider) ? metadata.provider : "openrouter";
  const reasonCode = hasAllowedValue(SESSION_PROVIDER_FAILURE_REASON_CODES, metadata.reasonCode)
    ? metadata.reasonCode
    : "provider_unavailable";

  return {
    ...buildSessionEvent("session.ai_provider_failed", "error", {
      requestId: metadata.requestId,
      outcome: metadata.outcome ?? "failure",
      durationMs: metadata.durationMs,
      userHash: metadata.userHash,
    }),
    provider,
    reasonCode,
  };
}

export function buildSessionOpeningFailedEvent(
  metadata: SessionEventBaseMetadata & { reasonCode: SessionOpeningFailureReasonCode },
): OperationalEvent {
  const reasonCode = hasAllowedValue(SESSION_OPENING_REASON_CODES, metadata.reasonCode)
    ? metadata.reasonCode
    : "opening_unavailable";

  return {
    ...buildSessionEvent("session.opening_failed", "warn", {
      requestId: metadata.requestId,
      outcome: "failure",
      durationMs: metadata.durationMs,
      userHash: metadata.userHash,
    }),
    reasonCode,
  };
}

export function buildSessionTimeLimitReachedEvent(
  metadata: SessionTimeLimitReachedEventMetadata = {},
): OperationalEvent {
  return {
    ...buildSessionEvent("session.time_limit_reached", "info", {
      requestId: metadata.requestId,
      outcome: metadata.outcome ?? "blocked",
      durationMs: metadata.durationMs,
      userHash: metadata.userHash,
    }),
    reasonCode: SESSION_TIME_LIMIT_REASON_CODES[0],
  };
}

export function buildSessionCompletedEvent(metadata: SessionCompletedEventMetadata = {}): OperationalEvent {
  return {
    ...buildSessionEvent("session.completed", "info", {
      requestId: metadata.requestId,
      outcome: metadata.outcome ?? "success",
      durationMs: metadata.durationMs,
      userHash: metadata.userHash,
    }),
    reasonCode: SESSION_COMPLETED_REASON_CODES[0],
  };
}
