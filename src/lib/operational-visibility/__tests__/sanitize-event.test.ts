import { describe, expect, it } from "vitest";
import { sanitizeOperationalEvent } from "../sanitize-event";

describe("sanitizeOperationalEvent", () => {
  it("keeps only allowlisted primitive event fields", () => {
    const event = sanitizeOperationalEvent({
      event: "auth.signin",
      level: "info",
      requestId: "req-1",
      route: "/auth/signin?next=/dashboard",
      method: "post",
      status: 200,
      outcome: "success",
      reasonCode: "invalid_credentials",
      durationMs: 12.6,
      provider: "supabase",
      deploymentTarget: "local",
      unknownField: "drop-me",
      nested: { value: "drop-me" },
    });

    expect(event).toEqual({
      event: "auth.signin",
      level: "info",
      requestId: "req-1",
      route: "/auth/signin",
      method: "POST",
      status: 200,
      outcome: "success",
      reasonCode: "invalid_credentials",
      durationMs: 13,
      provider: "supabase",
      deploymentTarget: "local",
      schemaVersion: 1,
    });
    expect(event).not.toHaveProperty("unknownField");
    expect(event).not.toHaveProperty("nested");
  });

  it("marks denied private field names without preserving their values", () => {
    const event = sanitizeOperationalEvent({
      event: "session.safety_evaluated",
      requestId: "req-1",
      userMessage: "private text",
      promptText: "private prompt",
      authorizationHeader: "Bearer token",
      rawError: "database details",
    });

    expect(event).toEqual({
      event: "session.safety_evaluated",
      requestId: "req-1",
      level: "warn",
      outcome: "failure",
      reasonCode: "private_field_denied",
      schemaVersion: 1,
    });
    expect(JSON.stringify(event)).not.toContain("private text");
    expect(JSON.stringify(event)).not.toContain("private prompt");
    expect(JSON.stringify(event)).not.toContain("Bearer token");
    expect(JSON.stringify(event)).not.toContain("database details");
  });

  it("returns a safe diagnostic event for malformed inputs", () => {
    expect(sanitizeOperationalEvent(null)).toEqual({
      level: "warn",
      outcome: "failure",
      reasonCode: "invalid_event_payload",
      schemaVersion: 1,
    });
  });

  it("omits invalid enum and unsafe scalar values", () => {
    const event = sanitizeOperationalEvent({
      event: "custom.event",
      level: "debug",
      route: "https://example.test/private",
      method: "GET /dashboard",
      status: 700,
      durationMs: -1,
      provider: "custom-provider",
      riskState: "unknown",
      action: "custom_action",
      schemaVersion: 99,
    });

    expect(event).toEqual({
      schemaVersion: 1,
    });
  });
});
