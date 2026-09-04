export const SESSION_SAFETY_REASON_CODES = {
  none_detected: "none_detected",
  ambiguous_distress: "ambiguous_distress",
  self_harm_signal: "self_harm_signal",
  harm_to_others_signal: "harm_to_others_signal",
  immediate_danger_signal: "immediate_danger_signal",
  provider_unavailable: "provider_unavailable",
  provider_timeout: "provider_timeout",
  provider_rate_limited: "provider_rate_limited",
  invalid_provider_response: "invalid_provider_response",
  missing_configuration: "missing_configuration",
} as const;

export type SessionSafetyReasonCode = keyof typeof SESSION_SAFETY_REASON_CODES;

export const SESSION_SAFETY_REASON_CODE_VALUES = Object.values(
  SESSION_SAFETY_REASON_CODES,
) as readonly SessionSafetyReasonCode[];

/**
 * Reason codes that mean "the boundary itself could not decide" (outage,
 * malformed reply, missing configuration) as opposed to a detected crisis.
 * Both fail closed for the current turn, but only a detected crisis ends the
 * session — a transient outage must leave the user a way to retry.
 */
export const FAIL_CLOSED_SESSION_SAFETY_REASON_CODES = [
  "provider_unavailable",
  "provider_timeout",
  "provider_rate_limited",
  "invalid_provider_response",
  "missing_configuration",
] as const satisfies readonly SessionSafetyReasonCode[];

export type FailClosedSessionSafetyReasonCode = (typeof FAIL_CLOSED_SESSION_SAFETY_REASON_CODES)[number];

export function isFailClosedSessionSafetyReasonCode(
  reasonCode: SessionSafetyReasonCode,
): reasonCode is FailClosedSessionSafetyReasonCode {
  return (FAIL_CLOSED_SESSION_SAFETY_REASON_CODES as readonly SessionSafetyReasonCode[]).includes(reasonCode);
}
