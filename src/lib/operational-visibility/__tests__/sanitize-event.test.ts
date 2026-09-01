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

  it("keeps whole non-negative token counters and still denies anything named like a token", () => {
    const event = sanitizeOperationalEvent({
      event: "session.ai_turn_completed",
      inputUnits: 1200,
      outputUnits: 340,
    });

    expect(event).toMatchObject({ inputUnits: 1200, outputUnits: 340 });
    expect(sanitizeOperationalEvent({ event: "session.ai_turn_completed", inputUnits: -3 })).not.toHaveProperty(
      "inputUnits",
    );
    expect(sanitizeOperationalEvent({ event: "session.ai_turn_completed", outputUnits: 12.5 })).not.toHaveProperty(
      "outputUnits",
    );
    expect(sanitizeOperationalEvent({ event: "session.ai_turn_completed", accessToken: "abc" })).toMatchObject({
      reasonCode: "private_field_denied",
    });
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

describe("sanitizeOperationalEvent route identifiers", () => {
  function routeOf(route: string) {
    return sanitizeOperationalEvent({ event: "route.request_rejected", route }).route;
  }

  it("masks uuid path segments so session and account ids never reach the logs", () => {
    expect(routeOf("/api/session/summary/123e4567-e89b-42d3-a456-426614174000")).toBe("/api/session/summary/:id");
    expect(routeOf("/api/session/history/123E4567-E89B-42D3-A456-426614174000")).toBe("/api/session/history/:id");
    expect(routeOf("/api/admin/users/123e4567-e89b-42d3-a456-426614174000/block")).toBe("/api/admin/users/:id/block");
  });

  it("masks long hex and base64url segments (tokens, opaque ids)", () => {
    expect(routeOf("/auth/callback/9f86d081884c7d659a2feaa0c55ad015")).toBe("/auth/callback/:id");
    expect(routeOf("/x/AbC123_-xyz789QWErty0")).toBe("/x/:id");
  });

  it("keeps static route names intact, including the longest ones and query stripping", () => {
    expect(routeOf("/api/auth/resend-confirmation?next=/dashboard")).toBe("/api/auth/resend-confirmation");
    expect(routeOf("/api/session/start-next")).toBe("/api/session/start-next");
    expect(routeOf("/dashboard/session")).toBe("/dashboard/session");
    expect(routeOf("/")).toBe("/");
  });
});
