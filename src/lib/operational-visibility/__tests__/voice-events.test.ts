import { describe, expect, it } from "vitest";
import { sanitizeOperationalEvent } from "../sanitize-event";
import {
  buildSessionStartAttemptedEvent,
  buildSessionVoiceClosedEvent,
  buildSessionVoiceConnectedEvent,
  buildSessionVoiceObserverEvent,
} from "../session-events";

describe("voice operational events", () => {
  it("builds a closed event with our reason, the live duration and no identifiers", () => {
    const event = buildSessionVoiceClosedEvent({
      reasonCode: "heartbeat_lost",
      durationMs: 1234.6,
      provider: "openai",
    });

    expect(event).toEqual({
      event: "session.voice_closed",
      level: "warn",
      outcome: "blocked",
      durationMs: 1235,
      reasonCode: "heartbeat_lost",
      provider: "openai",
    });
    expect(buildSessionVoiceClosedEvent({ reasonCode: "completed" })).toMatchObject({
      level: "info",
      outcome: "success",
    });
    expect(buildSessionVoiceClosedEvent({ reasonCode: "bogus" as never })).toMatchObject({
      reasonCode: "provider_closed",
    });
  });

  it("builds observer events that pass the sanitizer untouched", () => {
    const event = buildSessionVoiceObserverEvent({
      outcome: "failure",
      reasonCode: "observer_attach_failed",
      provider: "openai",
    });

    expect(event).toMatchObject({
      event: "session.voice_observer",
      level: "warn",
      reasonCode: "observer_attach_failed",
    });
    const sanitized = sanitizeOperationalEvent(event);
    expect(sanitized).toMatchObject({ event: "session.voice_observer", reasonCode: "observer_attach_failed" });
    expect(sanitized.reasonCode).not.toBe("private_field_denied");
  });
});

describe("voice connect and start events", () => {
  it("builds the connect event with a closed reason code and no room for the offer or the live id", () => {
    expect(buildSessionVoiceConnectedEvent({ outcome: "success", durationMs: 812.4, provider: "openai" })).toEqual({
      event: "session.voice_connected",
      level: "info",
      outcome: "success",
      durationMs: 812,
      provider: "openai",
    });
    expect(
      buildSessionVoiceConnectedEvent({ outcome: "failure", reasonCode: "provider_rate_limited", provider: "openai" }),
    ).toMatchObject({ level: "warn", outcome: "failure", reasonCode: "provider_rate_limited" });
    expect(buildSessionVoiceConnectedEvent({ outcome: "success", reasonCode: "reconnected" })).toMatchObject({
      reasonCode: "reconnected",
    });
    const smuggled = buildSessionVoiceConnectedEvent({
      outcome: "failure",
      reasonCode: "live_u2_secret" as never,
      ...({ sdp: "v=0", liveSessionId: "live_u2_secret" } as object),
    });
    expect(smuggled).not.toHaveProperty("reasonCode");
    expect(JSON.stringify(sanitizeOperationalEvent(smuggled))).not.toContain("live_u2");
  });

  it("accepts the voice gate reason codes on the start event", () => {
    for (const reasonCode of ["voice_unavailable", "voice_trial_used", "voice_minutes_exhausted"] as const) {
      expect(buildSessionStartAttemptedEvent({ outcome: "blocked", reasonCode })).toMatchObject({
        event: "session.start_attempted",
        level: "warn",
        reasonCode,
      });
    }
  });
});
