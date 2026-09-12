import { describe, expect, it } from "vitest";
import {
  VOICE_SDP_MAX_CHARS,
  getVoiceRouteFailureStatus,
  isVoiceSession,
  parseVoiceConnectRequest,
  parseVoiceHeartbeatRequest,
  parseVoiceSdpOffer,
  voiceRouteExpired,
  voiceRouteFailure,
  voiceRouteValidationFailure,
  type VoiceRouteFailureCode,
} from "../voice-contract";

const SESSION_ID = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const OFFER = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n";

function request(body: string) {
  return new Request("https://safespace.local/api/session/voice/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("parseVoiceSdpOffer", () => {
  it("accepts a trimmed WebRTC offer and rejects anything that is not one", () => {
    expect(parseVoiceSdpOffer(`  ${OFFER}  `)).toBe(OFFER.trimEnd());
    expect(parseVoiceSdpOffer("v=0")).toBe("v=0");
    for (const value of [undefined, null, 5, "", "   ", "o=- 1", "hello", `x${OFFER}`]) {
      expect(parseVoiceSdpOffer(value)).toBeNull();
    }
  });

  it("refuses control characters other than CR and LF, and an oversized offer", () => {
    const nul = String.fromCharCode(0);
    const escape = String.fromCharCode(27);
    expect(parseVoiceSdpOffer(`v=0\r\na=x${nul}y`)).toBeNull();
    expect(parseVoiceSdpOffer(`v=0\n${escape}[31m`)).toBeNull();
    expect(parseVoiceSdpOffer(`v=0\ta=tab`)).toBe("v=0\ta=tab");
    expect(parseVoiceSdpOffer(`v=0\r\n${"a=x\r\n".repeat(VOICE_SDP_MAX_CHARS / 5)}`)).toBeNull();
  });
});

describe("parseVoiceConnectRequest", () => {
  it("requires a session uuid and an offer, rejecting malformed bodies up front", async () => {
    await expect(
      parseVoiceConnectRequest(request(JSON.stringify({ sessionId: SESSION_ID, sdp: OFFER }))),
    ).resolves.toEqual({
      sessionId: SESSION_ID,
      sdp: OFFER.trimEnd(),
    });
    for (const body of [
      "{",
      "[]",
      "null",
      JSON.stringify({ sessionId: "session-1", sdp: OFFER }),
      JSON.stringify({ sessionId: SESSION_ID }),
      JSON.stringify({ sessionId: SESSION_ID, sdp: "not an offer" }),
      JSON.stringify({ sdp: OFFER }),
    ]) {
      await expect(parseVoiceConnectRequest(request(body))).resolves.toBeNull();
    }
  });
});

describe("parseVoiceHeartbeatRequest", () => {
  it("accepts a session uuid with a non-negative integer epoch", async () => {
    await expect(
      parseVoiceHeartbeatRequest(request(JSON.stringify({ sessionId: SESSION_ID, epoch: 3 }))),
    ).resolves.toEqual({
      sessionId: SESSION_ID,
      epoch: 3,
    });
    await expect(
      parseVoiceHeartbeatRequest(request(JSON.stringify({ sessionId: SESSION_ID, epoch: 0 }))),
    ).resolves.toEqual({
      sessionId: SESSION_ID,
      epoch: 0,
    });
    for (const body of [
      "{",
      JSON.stringify({ sessionId: SESSION_ID }),
      JSON.stringify({ sessionId: SESSION_ID, epoch: -1 }),
      JSON.stringify({ sessionId: SESSION_ID, epoch: 1.5 }),
      JSON.stringify({ sessionId: SESSION_ID, epoch: "1" }),
      JSON.stringify({ sessionId: "nope", epoch: 1 }),
    ]) {
      await expect(parseVoiceHeartbeatRequest(request(body))).resolves.toBeNull();
    }
  });
});

describe("voice route responses", () => {
  it("maps every failure code to its HTTP status", () => {
    const expected: Record<VoiceRouteFailureCode, number> = {
      validation_failed: 400,
      missing_auth: 401,
      account_blocked: 403,
      voice_unavailable: 403,
      session_not_found: 404,
      session_not_active: 409,
      session_expired: 409,
      session_mode_mismatch: 409,
      account_access_unavailable: 503,
      session_data_unavailable: 503,
      voice_provider_unavailable: 503,
      voice_observer_unavailable: 503,
      voice_connect_failed: 503,
      voice_heartbeat_failed: 503,
    };

    for (const [code, status] of Object.entries(expected) as [VoiceRouteFailureCode, number][]) {
      expect(getVoiceRouteFailureStatus(code)).toBe(status);
    }
  });

  it("builds failure bodies with the transport category only when given", () => {
    expect(voiceRouteFailure("voice_provider_unavailable", "provider_timeout")).toEqual({
      ok: false,
      type: "voice_error",
      code: "voice_provider_unavailable",
      category: "provider_timeout",
    });
    expect(voiceRouteFailure("voice_observer_unavailable")).toEqual({
      ok: false,
      type: "voice_error",
      code: "voice_observer_unavailable",
    });
    expect(voiceRouteValidationFailure()).toEqual({ ok: false, type: "validation_failed", code: "validation_failed" });
    const session = {
      id: SESSION_ID,
      status: "expired" as const,
      startedAt: null,
      endedAt: null,
      expiresAt: null,
      remainingSeconds: 0,
      isTrial: false,
      durationBucketSeconds: 600,
      mode: "voice" as const,
    };
    expect(voiceRouteExpired(session)).toEqual({ ok: false, type: "expired", code: "session_expired", session });
    expect(isVoiceSession(session)).toBe(true);
    expect(isVoiceSession({ ...session, mode: undefined })).toBe(false);
    expect(isVoiceSession(null)).toBe(false);
  });
});
