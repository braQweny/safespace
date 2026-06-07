import { describe, expect, it } from "vitest";
import type { SessionSafetyDecision } from "@/lib/session-safety/types";
import {
  buildSessionAiProviderFailedEvent,
  buildSessionCompletedEvent,
  buildSessionSafetyEvaluatedEvent,
  buildSessionSafetyEvaluatedEventFromDecision,
  buildSessionStartAttemptedEvent,
  buildSessionTimeLimitReachedEvent,
} from "../session-events";

describe("session operational event builders", () => {
  it("builds lifecycle events with only safe operational metadata", () => {
    const event = buildSessionStartAttemptedEvent({
      requestId: "req-1",
      outcome: "success",
      durationMs: 12.3,
      userHash: "usr_1234567890abcdef1234567890abcdef",
      message: "private text",
      prompt: "private prompt",
      modalityId: "cbt",
      avatarId: "guide",
    } as Parameters<typeof buildSessionStartAttemptedEvent>[0] & Record<string, unknown>);

    expect(event).toEqual({
      event: "session.start_attempted",
      level: "info",
      requestId: "req-1",
      outcome: "success",
      durationMs: 12,
      userHash: "usr_1234567890abcdef1234567890abcdef",
    });
    expect(event).not.toHaveProperty("message");
    expect(event).not.toHaveProperty("prompt");
    expect(event).not.toHaveProperty("modalityId");
    expect(event).not.toHaveProperty("avatarId");
  });

  it("maps F-02 decisions to coarse safety metadata", () => {
    const decision = {
      risk: "caution",
      action: "allow_with_constraints",
      reasonCode: "ambiguous_distress",
    } as Pick<SessionSafetyDecision, "risk" | "action" | "reasonCode">;

    expect(
      buildSessionSafetyEvaluatedEventFromDecision(decision, {
        requestId: "req-1",
        provider: "openrouter",
      }),
    ).toEqual({
      event: "session.safety_evaluated",
      level: "warn",
      requestId: "req-1",
      outcome: "success",
      riskState: "caution",
      action: "allow_with_constraints",
      reasonCode: "ambiguous_distress",
      provider: "openrouter",
    });
  });

  it("uses fail_closed for F-02 provider boundary failures", () => {
    const decision = {
      risk: "crisis",
      action: "hard_stop",
      reasonCode: "missing_configuration",
    } as Pick<SessionSafetyDecision, "risk" | "action" | "reasonCode">;

    expect(buildSessionSafetyEvaluatedEventFromDecision(decision)).toMatchObject({
      event: "session.safety_evaluated",
      level: "error",
      outcome: "blocked",
      riskState: "crisis",
      action: "fail_closed",
      reasonCode: "missing_configuration",
    });
  });

  it("builds provider failure, time-limit, and completion events without private payloads", () => {
    expect(
      buildSessionAiProviderFailedEvent({
        requestId: "req-1",
        provider: "openrouter",
        reasonCode: "provider_timeout",
        durationMs: 100,
      }),
    ).toEqual({
      event: "session.ai_provider_failed",
      level: "error",
      requestId: "req-1",
      outcome: "failure",
      durationMs: 100,
      provider: "openrouter",
      reasonCode: "provider_timeout",
    });

    expect(buildSessionTimeLimitReachedEvent({ requestId: "req-1", durationMs: 900_000 })).toEqual({
      event: "session.time_limit_reached",
      level: "info",
      requestId: "req-1",
      outcome: "blocked",
      durationMs: 900_000,
      reasonCode: "time_limit_reached",
    });

    expect(buildSessionCompletedEvent({ requestId: "req-1", durationMs: 120_000 })).toEqual({
      event: "session.completed",
      level: "info",
      requestId: "req-1",
      outcome: "success",
      durationMs: 120_000,
      reasonCode: "completed",
    });
  });

  it("omits unsafe session safety metadata at runtime", () => {
    const event = buildSessionSafetyEvaluatedEvent({
      requestId: "req-1",
      riskState: "normal",
      action: "allow",
      reasonCode: "none_detected",
      userMessage: "private text",
      providerPayload: { raw: true },
      rawError: "provider details",
      modalityId: "cbt",
      avatarId: "guide",
    } as Parameters<typeof buildSessionSafetyEvaluatedEvent>[0] & Record<string, unknown>);

    expect(event).toEqual({
      event: "session.safety_evaluated",
      level: "info",
      requestId: "req-1",
      outcome: "success",
      riskState: "normal",
      action: "allow",
      reasonCode: "none_detected",
    });
    expect(JSON.stringify(event)).not.toContain("private text");
    expect(JSON.stringify(event)).not.toContain("provider details");
    expect(event).not.toHaveProperty("providerPayload");
    expect(event).not.toHaveProperty("modalityId");
    expect(event).not.toHaveProperty("avatarId");
  });
});
