import { describe, expect, it } from "vitest";
import { parseVoiceLiveEvent } from "../voice-live-events";

describe("parseVoiceLiveEvent", () => {
  it("parses the transcript deltas of both speakers with their session timeline", () => {
    expect(
      parseVoiceLiveEvent(
        JSON.stringify({ type: "session.input_transcript.delta", delta: " Cześć", start_ms: 1400, end_ms: 1600 }),
      ),
    ).toEqual({ kind: "input_fragment", delta: " Cześć", startMs: 1400, endMs: 1600 });
    expect(
      parseVoiceLiveEvent({ type: "session.output_transcript.delta", delta: "Mhm", start_ms: 7800, end_ms: 8000 }),
    ).toEqual({ kind: "output_fragment", delta: "Mhm", startMs: 7800, endMs: 8000 });
    // A delta without a timeline cannot be grouped and is ignored, not thrown.
    expect(parseVoiceLiveEvent({ type: "session.input_transcript.delta", delta: "x" })).toEqual({
      kind: "ignored",
      type: "session.input_transcript.delta",
    });
  });

  it("parses the lifecycle events the observer acts on", () => {
    expect(
      parseVoiceLiveEvent({ type: "session.started", session: { id: "live_u2_abc", expires_at: 1789240937 } }),
    ).toEqual({ kind: "session_started", liveSessionId: "live_u2_abc", expiresAtSeconds: 1789240937 });
    expect(parseVoiceLiveEvent({ type: "session.closed", reason: "close_requested", usage: { seconds: 31 } })).toEqual({
      kind: "session_closed",
      reason: "close_requested",
      usageSeconds: 31,
    });
    expect(parseVoiceLiveEvent({ type: "session.usage.updated", usage: { seconds: 15 } })).toEqual({
      kind: "usage_updated",
      usageSeconds: 15,
    });
    expect(
      parseVoiceLiveEvent({ type: "session.delegation.created", delegation: { id: "item_1", target: "responses" } }),
    ).toEqual({ kind: "delegation_created", delegationId: "item_1" });
  });

  it("recognises acknowledgements and errors by their client event id", () => {
    expect(parseVoiceLiveEvent({ type: "session.instructions.appended", client_event_id: "sb_1" })).toEqual({
      kind: "acknowledged",
      type: "session.instructions.appended",
      clientEventId: "sb_1",
    });
    expect(parseVoiceLiveEvent({ type: "session.input_audio.muted", client_event_id: "m1" })).toMatchObject({
      kind: "acknowledged",
      clientEventId: "m1",
    });
    expect(
      parseVoiceLiveEvent({
        type: "error",
        error: { code: "context_injection_incomplete", client_event_id: "i1", message: "…" },
      }),
    ).toEqual({ kind: "error", code: "context_injection_incomplete", clientEventId: "i1" });
  });

  it("ignores unknown, malformed and non-JSON input without throwing", () => {
    expect(parseVoiceLiveEvent("not json")).toEqual({ kind: "ignored", type: null });
    expect(parseVoiceLiveEvent(42)).toEqual({ kind: "ignored", type: null });
    expect(parseVoiceLiveEvent({ type: "response.event", event: { type: "response.output_text.delta" } })).toEqual({
      kind: "ignored",
      type: "response.event",
    });
  });
});
