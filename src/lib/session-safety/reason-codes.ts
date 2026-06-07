export const SESSION_SAFETY_REASON_CODES = {
  none_detected: "none_detected",
  ambiguous_distress: "ambiguous_distress",
  self_harm_signal: "self_harm_signal",
  harm_to_others_signal: "harm_to_others_signal",
  immediate_danger_signal: "immediate_danger_signal",
  provider_unavailable: "provider_unavailable",
  invalid_provider_response: "invalid_provider_response",
  missing_configuration: "missing_configuration",
} as const;

export type SessionSafetyReasonCode = keyof typeof SESSION_SAFETY_REASON_CODES;

export const SESSION_SAFETY_REASON_CODE_VALUES = Object.values(
  SESSION_SAFETY_REASON_CODES,
) as readonly SessionSafetyReasonCode[];
