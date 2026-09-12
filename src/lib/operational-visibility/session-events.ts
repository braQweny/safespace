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

const SESSION_AI_PROVIDER_VALUES = ["openrouter", "openai"] as const satisfies readonly OperationalEventProvider[];

const SESSION_START_REASON_CODES = [
  "session_start_failed",
  // Free-plan allowance exhausted: a conversion signal, not an incident.
  "session_limit_reached",
  "interrupted",
  // Voice start gate: flag/provider off, free trial used, premium pool empty.
  "voice_unavailable",
  "voice_trial_used",
  "voice_minutes_exhausted",
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
const SESSION_VOICE_CLOSE_REASON_CODES = [
  "completed",
  "interrupted",
  "time_limit_reached",
  "heartbeat_lost",
  "safety_unavailable",
  "reconnected",
  "deleted",
  "voice_disabled",
  "provider_closed",
] as const satisfies readonly OperationalSessionReasonCode[];
const SESSION_VOICE_CONNECT_REASON_CODES = [
  "voice_unavailable",
  "voice_observer_unavailable",
  "reconnected",
  "provider_timeout",
  "provider_rate_limited",
  "provider_unavailable",
  "invalid_provider_response",
  "missing_configuration",
] as const satisfies readonly OperationalSessionReasonCode[];
const SESSION_VOICE_OBSERVER_REASON_CODES = [
  "observer_attached",
  "observer_rotated",
  "observer_reattached",
  "observer_attach_failed",
  "observer_steer_failed",
  "observer_hangup_failed",
] as const satisfies readonly OperationalSessionReasonCode[];
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

export type SessionVoiceCloseReasonCode = (typeof SESSION_VOICE_CLOSE_REASON_CODES)[number];

export type SessionVoiceObserverReasonCode = (typeof SESSION_VOICE_OBSERVER_REASON_CODES)[number];

export type SessionVoiceConnectReasonCode = (typeof SESSION_VOICE_CONNECT_REASON_CODES)[number];

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

export interface SessionAiTurnCompletedEventMetadata extends SessionEventBaseMetadata {
  provider?: SessionAiProvider;
  inputUnits?: number;
  outputUnits?: number;
}

export type SessionTranscriptionFailedEventMetadata = SessionProviderFailedEventMetadata;

export interface SessionPeopleMemoryUpdatedEventMetadata extends SessionEventBaseMetadata {
  provider?: SessionAiProvider;
  inputUnits?: number;
  outputUnits?: number;
  /** Partia przyjęta mimo przepełnionej odpowiedzi przy najmniejszym podziale. */
  partial?: boolean;
}

/** Wynik wykrywania soczewki; etykieta tematu celowo nie jest polem zdarzenia. */
export type SessionLensEvaluationResult = "detected" | "none" | "failed";

export interface SessionLensEvaluatedEventMetadata extends SessionEventBaseMetadata {
  result: SessionLensEvaluationResult;
  provider?: SessionAiProvider;
  /** Tylko przy `failed`: kategoria błędu providera, nigdy treść. */
  reasonCode?: SessionProviderFailureReasonCode;
  inputUnits?: number;
  outputUnits?: number;
}

export interface SessionVoiceClosedEventMetadata extends SessionEventBaseMetadata {
  reasonCode: SessionVoiceCloseReasonCode;
  provider?: SessionAiProvider;
}

export interface SessionVoiceObserverEventMetadata extends SessionEventBaseMetadata {
  outcome: SessionLifecycleOutcome;
  reasonCode: SessionVoiceObserverReasonCode;
  provider?: SessionAiProvider;
}

export interface SessionVoiceConnectedEventMetadata extends SessionEventBaseMetadata {
  outcome: SessionLifecycleOutcome;
  /** Tylko przy porażce lub wznowieniu; sukces pierwszego połączenia nie ma kodu. */
  reasonCode?: SessionVoiceConnectReasonCode;
  provider?: SessionAiProvider;
}

type SessionEventName = Extract<
  OperationalEvent["event"],
  | "session.voice_observer"
  | "session.voice_closed"
  | "session.voice_connected"
  | "session.start_attempted"
  | "session.safety_evaluated"
  | "session.ai_provider_failed"
  | "session.ai_turn_completed"
  | "session.transcription_failed"
  | "session.time_limit_reached"
  | "session.completed"
  | "session.opening_failed"
  | "session.people_memory_updated"
  | "session.lens_evaluated"
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

function sanitizeUnitCount(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return undefined;
  }

  return value;
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

/**
 * One successful reply turn. The only place cost becomes visible: the
 * provider's token counts, never the text they were spent on.
 */
export function buildSessionAiTurnCompletedEvent(metadata: SessionAiTurnCompletedEventMetadata = {}): OperationalEvent {
  const provider = hasAllowedValue(SESSION_AI_PROVIDER_VALUES, metadata.provider) ? metadata.provider : "openrouter";
  const inputUnits = sanitizeUnitCount(metadata.inputUnits);
  const outputUnits = sanitizeUnitCount(metadata.outputUnits);

  return {
    ...buildSessionEvent("session.ai_turn_completed", "info", {
      requestId: metadata.requestId,
      outcome: metadata.outcome ?? "success",
      durationMs: metadata.durationMs,
      userHash: metadata.userHash,
    }),
    provider,
    ...(inputUnits !== undefined ? { inputUnits } : {}),
    ...(outputUnits !== undefined ? { outputUnits } : {}),
  };
}

/**
 * Jedna zapisana partia kart osób: liczniki jednostek providera i czas, nigdy
 * imiona, liczba osób ani identyfikatory. `partial` to jedyny kod powodu.
 */
export function buildSessionPeopleMemoryUpdatedEvent(
  metadata: SessionPeopleMemoryUpdatedEventMetadata = {},
): OperationalEvent {
  const provider = hasAllowedValue(SESSION_AI_PROVIDER_VALUES, metadata.provider) ? metadata.provider : "openrouter";
  const inputUnits = sanitizeUnitCount(metadata.inputUnits);
  const outputUnits = sanitizeUnitCount(metadata.outputUnits);
  const partial = metadata.partial === true;

  return {
    ...buildSessionEvent("session.people_memory_updated", partial ? "warn" : "info", {
      requestId: metadata.requestId,
      outcome: metadata.outcome ?? "success",
      durationMs: metadata.durationMs,
      userHash: metadata.userHash,
    }),
    provider,
    ...(partial ? { reasonCode: "people_memory_partial" as const } : {}),
    ...(inputUnits !== undefined ? { inputUnits } : {}),
    ...(outputUnits !== undefined ? { outputUnits } : {}),
  };
}

/**
 * Jedno wykrywanie soczewki tematycznej: wynik, czas i liczniki jednostek.
 * Sama etykieta mówi, o czym jest rozmowa, więc nigdy nie jest polem — nawet
 * przekazana omyłkowo nie przechodzi przez ten builder.
 */
export function buildSessionLensEvaluatedEvent(metadata: SessionLensEvaluatedEventMetadata): OperationalEvent {
  const provider = hasAllowedValue(SESSION_AI_PROVIDER_VALUES, metadata.provider) ? metadata.provider : "openrouter";
  const outcome: SessionLifecycleOutcome =
    metadata.result === "detected" ? "success" : metadata.result === "none" ? "skipped" : "failure";
  const reasonCode =
    outcome === "failure" && hasAllowedValue(SESSION_PROVIDER_FAILURE_REASON_CODES, metadata.reasonCode)
      ? metadata.reasonCode
      : undefined;
  const inputUnits = sanitizeUnitCount(metadata.inputUnits);
  const outputUnits = sanitizeUnitCount(metadata.outputUnits);

  return {
    ...buildSessionEvent("session.lens_evaluated", outcome === "failure" ? "warn" : "info", {
      requestId: metadata.requestId,
      outcome,
      durationMs: metadata.durationMs,
      userHash: metadata.userHash,
    }),
    provider,
    ...(reasonCode ? { reasonCode } : {}),
    ...(inputUnits !== undefined ? { inputUnits } : {}),
    ...(outputUnits !== undefined ? { outputUnits } : {}),
  };
}

export function buildSessionTranscriptionFailedEvent(
  metadata: SessionTranscriptionFailedEventMetadata,
): OperationalEvent {
  const provider = hasAllowedValue(SESSION_AI_PROVIDER_VALUES, metadata.provider) ? metadata.provider : "openrouter";
  const reasonCode = hasAllowedValue(SESSION_PROVIDER_FAILURE_REASON_CODES, metadata.reasonCode)
    ? metadata.reasonCode
    : "provider_unavailable";

  return {
    ...buildSessionEvent("session.transcription_failed", "warn", {
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

/**
 * Zamknięcie sesji live rozmowy głosowej z naszym powodem. `durationMs` to
 * czas od uzbrojenia obserwatora — koszt warstwy głosowej, nie treść.
 */
export function buildSessionVoiceClosedEvent(metadata: SessionVoiceClosedEventMetadata): OperationalEvent {
  const reasonCode = hasAllowedValue(SESSION_VOICE_CLOSE_REASON_CODES, metadata.reasonCode)
    ? metadata.reasonCode
    : "provider_closed";
  const provider = hasAllowedValue(SESSION_AI_PROVIDER_VALUES, metadata.provider) ? metadata.provider : undefined;
  const outcome =
    metadata.outcome ??
    (reasonCode === "completed" || reasonCode === "time_limit_reached" || reasonCode === "reconnected"
      ? "success"
      : "blocked");
  const event = buildSessionEvent("session.voice_closed", outcome === "success" ? "info" : "warn", {
    requestId: metadata.requestId,
    outcome,
    durationMs: metadata.durationMs,
    userHash: metadata.userHash,
  });

  return { ...event, reasonCode, ...(provider ? { provider } : {}) };
}

/**
 * Jedno połączenie audio rozmowy głosowej (`POST /api/session/voice/connect`):
 * wynik, czas do odpowiedzi SDP, powód porażki. Bez identyfikatora sesji live,
 * bez oferty SDP — builder nie ma dla nich pól.
 */
export function buildSessionVoiceConnectedEvent(metadata: SessionVoiceConnectedEventMetadata): OperationalEvent {
  const reasonCode = hasAllowedValue(SESSION_VOICE_CONNECT_REASON_CODES, metadata.reasonCode)
    ? metadata.reasonCode
    : undefined;
  const provider = hasAllowedValue(SESSION_AI_PROVIDER_VALUES, metadata.provider) ? metadata.provider : undefined;
  const event = buildSessionEvent("session.voice_connected", getOutcomeLevel(metadata.outcome), {
    requestId: metadata.requestId,
    outcome: metadata.outcome,
    durationMs: metadata.durationMs,
    userHash: metadata.userHash,
  });

  return { ...event, ...(reasonCode ? { reasonCode } : {}), ...(provider ? { provider } : {}) };
}

/** Sideband obserwatora: podłączenie, rotacja, ponowne podłączenie i ich awarie. */
export function buildSessionVoiceObserverEvent(metadata: SessionVoiceObserverEventMetadata): OperationalEvent {
  const reasonCode = hasAllowedValue(SESSION_VOICE_OBSERVER_REASON_CODES, metadata.reasonCode)
    ? metadata.reasonCode
    : "observer_attach_failed";
  const provider = hasAllowedValue(SESSION_AI_PROVIDER_VALUES, metadata.provider) ? metadata.provider : undefined;
  const event = buildSessionEvent("session.voice_observer", getOutcomeLevel(metadata.outcome), {
    requestId: metadata.requestId,
    outcome: metadata.outcome,
    durationMs: metadata.durationMs,
    userHash: metadata.userHash,
  });

  return { ...event, reasonCode, ...(provider ? { provider } : {}) };
}
