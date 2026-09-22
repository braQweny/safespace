import { SESSION_SAFETY_REASON_CODE_VALUES } from "./reason-codes";
import {
  PROVIDER_ACTION_BY_RISK,
  PROVIDER_REASON_CODES,
  ProviderSafetyError,
  type ProviderSafetyDecision,
  type ProviderSafetyReasonCode,
} from "./provider";
import type { SessionSafetyAction, SessionSafetyRisk } from "./types";
import { parseStrictJsonObject, readCompleteChoiceContent } from "@/lib/ai-provider/chat-response";

const PROVIDER_DECISION_KEYS = new Set(["risk", "action", "reasonCode"]);
const SESSION_SAFETY_RISK_VALUES = ["normal", "caution", "crisis"] as const satisfies readonly SessionSafetyRisk[];
const SESSION_SAFETY_ACTION_VALUES = [
  "allow",
  "allow_with_constraints",
  "hard_stop",
] as const satisfies readonly SessionSafetyAction[];

export function parseProviderSafetyDecision(response: unknown): ProviderSafetyDecision {
  // A truncated, filtered or tool-call finish is rejected like any malformed
  // reply: `invalid_provider_response` is a fail-closed reason code, so the
  // turn is refused as retryable instead of trusting a partial verdict.
  const content = readCompleteChoiceContent(response, throwInvalidProviderResponse);
  const decision = parseStrictJsonObject(content, throwInvalidProviderResponse);

  return parseProviderDecisionObject(decision);
}

export function parseProviderDecisionObject(decision: Record<string, unknown>): ProviderSafetyDecision {
  rejectUnknownKeys(decision);

  const risk = parseRisk(decision.risk);
  const action = parseAction(decision.action);
  const reasonCode = parseProviderReasonCode(decision.reasonCode);

  if (action !== PROVIDER_ACTION_BY_RISK[risk] || !isReasonAllowedForRisk(risk, reasonCode)) {
    throwInvalidProviderResponse();
  }

  return { risk, action, reasonCode };
}

function rejectUnknownKeys(decision: Record<string, unknown>) {
  if (Object.keys(decision).some((key) => !PROVIDER_DECISION_KEYS.has(key))) {
    throwInvalidProviderResponse();
  }
}

function parseRisk(value: unknown): SessionSafetyRisk {
  if (typeof value === "string" && includesValue(SESSION_SAFETY_RISK_VALUES, value)) {
    return value;
  }

  throwInvalidProviderResponse();
}

function parseAction(value: unknown): SessionSafetyAction {
  if (typeof value === "string" && includesValue(SESSION_SAFETY_ACTION_VALUES, value)) {
    return value;
  }

  throwInvalidProviderResponse();
}

function parseProviderReasonCode(value: unknown): ProviderSafetyReasonCode {
  if (
    typeof value === "string" &&
    includesValue(SESSION_SAFETY_REASON_CODE_VALUES, value) &&
    includesValue(PROVIDER_REASON_CODES, value)
  ) {
    return value;
  }

  throwInvalidProviderResponse();
}

function isReasonAllowedForRisk(risk: SessionSafetyRisk, reasonCode: ProviderSafetyReasonCode) {
  if (risk === "normal") {
    return reasonCode === "none_detected";
  }

  if (risk === "caution") {
    return reasonCode === "ambiguous_distress";
  }

  return (
    reasonCode === "self_harm_signal" ||
    reasonCode === "harm_to_others_signal" ||
    reasonCode === "immediate_danger_signal"
  );
}

function includesValue<const T extends string>(values: readonly T[], value: string): value is T {
  return values.includes(value as T);
}

function throwInvalidProviderResponse(): never {
  throw new ProviderSafetyError("invalid_provider_response");
}
