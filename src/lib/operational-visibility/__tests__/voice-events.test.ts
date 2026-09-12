import { describe, expect, it } from "vitest";
import { sanitizeOperationalEvent } from "../sanitize-event";
import { buildSessionVoiceClosedEvent, buildSessionVoiceObserverEvent } from "../session-events";

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
