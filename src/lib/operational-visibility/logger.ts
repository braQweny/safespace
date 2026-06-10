import { sanitizeOperationalEvent } from "./sanitize-event";
import { OPERATIONAL_EVENT_SCHEMA_VERSION, type OperationalEvent } from "./types";

type OperationalLogPayload = OperationalEvent | Record<string, unknown>;
type OperationalLogContext = Partial<
  Pick<OperationalEvent, "requestId" | "route" | "method" | "durationMs" | "userHash" | "deploymentTarget">
>;

export function logOperationalEvent(event: OperationalLogPayload, context: OperationalLogContext = {}) {
  try {
    const sanitizedEvent = sanitizeOperationalEvent({
      ...context,
      ...event,
      schemaVersion: OPERATIONAL_EVENT_SCHEMA_VERSION,
    });

    // eslint-disable-next-line no-console
    console.log(sanitizedEvent);
  } catch {
    // Logging is diagnostic only and must never affect product flows, but a
    // silent drop would hide that the only visibility channel is failing.
    // The fallback payload is fully static, so nothing private can leak.
    try {
      // eslint-disable-next-line no-console
      console.warn({
        schemaVersion: OPERATIONAL_EVENT_SCHEMA_VERSION,
        level: "warn",
        outcome: "failure",
        reasonCode: "logger_unavailable",
      });
    } catch {
      // Nothing left to do without a working console.
    }
  }
}
