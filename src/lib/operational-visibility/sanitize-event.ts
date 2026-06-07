import {
  OPERATIONAL_EVENT_LEVELS,
  OPERATIONAL_EVENT_NAMES,
  OPERATIONAL_EVENT_OUTCOMES,
  OPERATIONAL_EVENT_PROVIDERS,
  OPERATIONAL_EVENT_SCHEMA_VERSION,
  OPERATIONAL_RISK_STATES,
  OPERATIONAL_SAFETY_ACTIONS,
} from "./types";
import {
  isDeniedOperationalEventField,
  isOperationalEventAllowedField,
  type OperationalEventAllowedField,
} from "./allowed-fields";
import type { SanitizedOperationalEvent } from "./types";

const MAX_SAFE_STRING_LENGTH = 160;
const MAX_REQUEST_ID_LENGTH = 96;
const MAX_USER_HASH_LENGTH = 96;

const EVENT_NAME_SET = new Set<string>(OPERATIONAL_EVENT_NAMES);
const LEVEL_SET = new Set<string>(OPERATIONAL_EVENT_LEVELS);
const OUTCOME_SET = new Set<string>(OPERATIONAL_EVENT_OUTCOMES);
const PROVIDER_SET = new Set<string>(OPERATIONAL_EVENT_PROVIDERS);
const RISK_STATE_SET = new Set<string>(OPERATIONAL_RISK_STATES);
const SAFETY_ACTION_SET = new Set<string>(OPERATIONAL_SAFETY_ACTIONS);

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function sanitizeShortString(value: unknown, maxLength = MAX_SAFE_STRING_LENGTH) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    return undefined;
  }

  return trimmed;
}

function sanitizeRoute(value: unknown) {
  const route = sanitizeShortString(value);
  if (!route?.startsWith("/")) {
    return undefined;
  }

  return route.split("?")[0];
}

function sanitizeMethod(value: unknown) {
  const method = sanitizeShortString(value, 12)?.toUpperCase();
  if (!method || !/^[A-Z]+$/.test(method)) {
    return undefined;
  }

  return method;
}

function sanitizeStatus(value: unknown) {
  if (!Number.isInteger(value)) {
    return undefined;
  }

  if (value < 100 || value > 599) {
    return undefined;
  }

  return value;
}

function sanitizeDuration(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  if (value < 0) {
    return undefined;
  }

  return Math.round(value);
}

function sanitizeSchemaVersion(value: unknown) {
  return value === OPERATIONAL_EVENT_SCHEMA_VERSION ? value : undefined;
}

function sanitizeEnum(value: unknown, values: ReadonlySet<string>) {
  const stringValue = sanitizeShortString(value);
  return stringValue && values.has(stringValue) ? stringValue : undefined;
}

function sanitizeFieldValue(field: OperationalEventAllowedField, value: unknown) {
  switch (field) {
    case "event":
      return sanitizeEnum(value, EVENT_NAME_SET);
    case "level":
      return sanitizeEnum(value, LEVEL_SET);
    case "requestId":
      return sanitizeShortString(value, MAX_REQUEST_ID_LENGTH);
    case "route":
      return sanitizeRoute(value);
    case "method":
      return sanitizeMethod(value);
    case "status":
      return sanitizeStatus(value);
    case "outcome":
      return sanitizeEnum(value, OUTCOME_SET);
    case "reasonCode":
      return sanitizeShortString(value);
    case "durationMs":
      return sanitizeDuration(value);
    case "provider":
      return sanitizeEnum(value, PROVIDER_SET);
    case "riskState":
      return sanitizeEnum(value, RISK_STATE_SET);
    case "action":
      return sanitizeEnum(value, SAFETY_ACTION_SET);
    case "userHash":
      return sanitizeShortString(value, MAX_USER_HASH_LENGTH);
    case "deploymentTarget":
      return sanitizeShortString(value);
    case "schemaVersion":
      return sanitizeSchemaVersion(value);
  }
}

export function sanitizeOperationalEvent(input: unknown): SanitizedOperationalEvent {
  const sanitized: SanitizedOperationalEvent = {
    schemaVersion: OPERATIONAL_EVENT_SCHEMA_VERSION,
  };

  if (!isRecord(input)) {
    return {
      ...sanitized,
      level: "warn",
      outcome: "failure",
      reasonCode: "invalid_event_payload",
    };
  }

  let deniedFieldFound = false;

  for (const [fieldName, value] of Object.entries(input)) {
    if (isDeniedOperationalEventField(fieldName)) {
      deniedFieldFound = true;
      continue;
    }

    if (!isOperationalEventAllowedField(fieldName)) {
      continue;
    }

    const sanitizedValue = sanitizeFieldValue(fieldName, value);
    if (sanitizedValue === undefined) {
      continue;
    }

    Object.assign(sanitized, { [fieldName]: sanitizedValue });
  }

  if (deniedFieldFound) {
    return {
      ...sanitized,
      level: "warn",
      outcome: "failure",
      reasonCode: "private_field_denied",
    };
  }

  return sanitized;
}
