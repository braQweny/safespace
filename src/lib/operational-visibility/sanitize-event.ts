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
import { isRecord } from "@/lib/type-guards";

const MAX_SAFE_STRING_LENGTH = 160;
const MAX_REQUEST_ID_LENGTH = 96;
const MAX_USER_HASH_LENGTH = 96;

const EVENT_NAME_SET = new Set<string>(OPERATIONAL_EVENT_NAMES);
const LEVEL_SET = new Set<string>(OPERATIONAL_EVENT_LEVELS);
const OUTCOME_SET = new Set<string>(OPERATIONAL_EVENT_OUTCOMES);
const PROVIDER_SET = new Set<string>(OPERATIONAL_EVENT_PROVIDERS);
const RISK_STATE_SET = new Set<string>(OPERATIONAL_RISK_STATES);
const SAFETY_ACTION_SET = new Set<string>(OPERATIONAL_SAFETY_ACTIONS);

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

const UUID_SEGMENT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Long hex / base64url runs are opaque identifiers or tokens, never a static
// route name (the longest static segment, `resend-confirmation`, is 19 chars).
const OPAQUE_ID_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{20,}$/;
const ROUTE_ID_PLACEHOLDER = ":id";

function isIdentifierSegment(segment: string) {
  return UUID_SEGMENT_PATTERN.test(segment) || OPAQUE_ID_SEGMENT_PATTERN.test(segment);
}

/**
 * Keeps the route shape but never a concrete identifier: session ids in
 * `/api/session/summary/<uuid>` or admin targets in
 * `/api/admin/users/<uuid>/block` would otherwise let hosted logs be joined
 * against private tables.
 */
function sanitizeRoute(value: unknown) {
  const route = sanitizeShortString(value);
  if (!route?.startsWith("/")) {
    return undefined;
  }

  const pathname = route.split("?")[0];

  return pathname
    .split("/")
    .map((segment) => (isIdentifierSegment(segment) ? ROUTE_ID_PLACEHOLDER : segment))
    .join("/");
}

function sanitizeMethod(value: unknown) {
  const method = sanitizeShortString(value, 12)?.toUpperCase();
  if (!method || !/^[A-Z]+$/.test(method)) {
    return undefined;
  }

  return method;
}

function sanitizeStatus(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
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

// Token counters: whole, non-negative, and bounded well above any real call.
const MAX_UNIT_COUNT = 10_000_000;

function sanitizeUnitCount(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_UNIT_COUNT) {
    return undefined;
  }

  return value;
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
    case "inputUnits":
    case "outputUnits":
      return sanitizeUnitCount(value);
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
