export const OPERATIONAL_EVENT_ALLOWED_FIELDS = [
  "event",
  "level",
  "requestId",
  "route",
  "method",
  "status",
  "outcome",
  "reasonCode",
  "durationMs",
  "provider",
  "riskState",
  "action",
  "userHash",
  "inputUnits",
  "outputUnits",
  "deploymentTarget",
  "schemaVersion",
] as const;

export type OperationalEventAllowedField = (typeof OPERATIONAL_EVENT_ALLOWED_FIELDS)[number];

const OPERATIONAL_EVENT_ALLOWED_FIELD_SET = new Set<string>(OPERATIONAL_EVENT_ALLOWED_FIELDS);

const DENIED_PRIVATE_FIELD_TOKENS = [
  "message",
  "prompt",
  "content",
  "email",
  "token",
  "cookie",
  "authorization",
  "password",
  "secret",
  "session",
  "summary",
  "error",
] as const;

function normalizeFieldName(fieldName: string) {
  return fieldName.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isOperationalEventAllowedField(fieldName: string): fieldName is OperationalEventAllowedField {
  return OPERATIONAL_EVENT_ALLOWED_FIELD_SET.has(fieldName);
}

export function isDeniedOperationalEventField(fieldName: string) {
  const normalizedField = normalizeFieldName(fieldName);

  return DENIED_PRIVATE_FIELD_TOKENS.some((token) => normalizedField.includes(token));
}
