import { describe, expect, it, vi } from "vitest";
import type { ApiJsonResult } from "@/lib/api-client";
import { getSessionCopy } from "@/lib/session-copy";
import type { SessionView } from "@/lib/session-flow/session-state";
import type { VoiceHeartbeatSuccessResponse } from "@/lib/session-flow/voice-contract";
import type { VoiceSessionAction } from "@/lib/session-flow/voice-session-state";
import { getVoiceSessionCopy } from "@/components/session/voice-session-copy";
import type { TimedSessionTransport } from "../useTimedSession";
import { buildVoiceHeartbeatNotices, connectVoiceSession, runVoiceHeartbeat } from "../useVoiceSession";

const SESSION_ID = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";

const session: SessionView = {
  id: SESSION_ID,
  status: "active",
  startedAt: "2026-09-12T10:00:00.000Z",
  endedAt: null,
  expiresAt: "2026-09-12T10:10:00.000Z",
  remainingSeconds: 540,
  isTrial: false,
  durationBucketSeconds: 600,
  mode: "voice",
};

function createTransport(result: ApiJsonResult) {
  const request = vi.fn<TimedSessionTransport["request"]>(() => Promise.resolve(result));
  const navigate = vi.fn();
  const dispatched: VoiceSessionAction[] = [];
  const dispatch = (action: VoiceSessionAction) => {
    dispatched.push(action);
  };
  return { transport: { request, navigate } satisfies TimedSessionTransport, request, navigate, dispatched, dispatch };
}

function json(status: number, body: unknown): ApiJsonResult {
  return { kind: "json", status, body };
}

const copy = getVoiceSessionCopy("pl");
const turn = getSessionCopy("pl").turn;

describe("connectVoiceSession", () => {
  it("posts the offer, dispatches connected and hands back the answer with the epoch", async () => {
    const { transport, request, dispatched, dispatch } = createTransport(
      json(200, {
        ok: true,
        type: "voice_connected",
        sdp: "v=0\r\na=answer",
        expiresAt: session.expiresAt,
        serverNow: "2026-09-12T10:01:00.000Z",
        epoch: 4,
        reconnected: false,
        session,
      }),
    );

    await expect(
      connectVoiceSession({ sessionId: SESSION_ID, offerSdp: "v=0\r\na=offer", locale: "pl" }, dispatch, transport),
    ).resolves.toEqual({ answerSdp: "v=0\r\na=answer", epoch: 4 });
    expect(request).toHaveBeenCalledWith(
      "/api/session/voice/connect",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sessionId: SESSION_ID, sdp: "v=0\r\na=offer" }),
      }),
    );
    expect(dispatched.map((action) => action.type)).toEqual(["connecting", "connected"]);
    expect(dispatched[1]).toMatchObject({ epoch: 4, session });
  });

  it("marks retryable failures for the provider, the network and throttling, but not a bad request", async () => {
    const cases: [ApiJsonResult, boolean, string][] = [
      [{ kind: "network_error" }, true, turn.connectionUnavailableBody],
      [json(429, { ok: false, code: "rate_limited" }), true, copy.notices.connectRateLimitedBody],
      [
        json(503, { ok: false, type: "voice_error", code: "voice_provider_unavailable", category: "provider_timeout" }),
        true,
        copy.notices.connectFailedBody,
      ],
      [
        json(503, { ok: false, type: "voice_error", code: "voice_observer_unavailable" }),
        true,
        copy.notices.connectFailedBody,
      ],
      [json(200, { unexpected: true }), true, copy.notices.connectFailedBody],
      [
        json(400, { ok: false, type: "validation_failed", code: "validation_failed" }),
        false,
        copy.notices.connectFailedBody,
      ],
    ];

    for (const [result, retryable, body] of cases) {
      const { transport, dispatched, dispatch } = createTransport(result);
      await expect(
        connectVoiceSession({ sessionId: SESSION_ID, offerSdp: "v=0", locale: "pl" }, dispatch, transport),
      ).resolves.toBeNull();
      expect(dispatched.at(-1)).toMatchObject({
        type: "connect_failed",
        retryable,
        notice: { variant: "info", copy: { title: copy.notices.connectFailedTitle, body } },
      });
    }
  });

  it("expires, ends, redirects or declares the feature unavailable by the route's code", async () => {
    const expired = createTransport(
      json(409, { ok: false, type: "expired", code: "session_expired", session: { ...session, status: "expired" } }),
    );
    await connectVoiceSession(
      { sessionId: SESSION_ID, offerSdp: "v=0", locale: "pl" },
      expired.dispatch,
      expired.transport,
    );
    expect(expired.dispatched.at(-1)).toMatchObject({
      type: "session_expired",
      session: { status: "expired" },
      notice: { copy: { title: turn.expiredTitle } },
    });

    const ended = createTransport(json(409, { ok: false, type: "voice_error", code: "session_not_active" }));
    await connectVoiceSession(
      { sessionId: SESSION_ID, offerSdp: "v=0", locale: "pl" },
      ended.dispatch,
      ended.transport,
    );
    expect(ended.dispatched.at(-1)).toMatchObject({ type: "session_unavailable" });

    const blocked = createTransport(json(403, { ok: false, type: "voice_error", code: "account_blocked" }));
    await connectVoiceSession(
      { sessionId: SESSION_ID, offerSdp: "v=0", locale: "pl" },
      blocked.dispatch,
      blocked.transport,
    );
    expect(blocked.navigate).toHaveBeenCalledWith("/account/blocked");

    const off = createTransport(json(403, { ok: false, type: "voice_error", code: "voice_unavailable" }));
    await connectVoiceSession({ sessionId: SESSION_ID, offerSdp: "v=0", locale: "pl" }, off.dispatch, off.transport);
    expect(off.dispatched.at(-1)).toMatchObject({
      type: "connect_failed",
      retryable: false,
      notice: { copy: { title: copy.unavailableTitle } },
    });
  });
});

describe("runVoiceHeartbeat", () => {
  const response: VoiceHeartbeatSuccessResponse = {
    ok: true,
    type: "voice_heartbeat",
    live: true,
    closeReason: null,
    epoch: 4,
    remainingSeconds: 500,
    serverNow: "2026-09-12T10:01:40.000Z",
    session,
    messages: [{ id: "m1", role: "user", sequenceIndex: 1, content: "Hej", createdAt: "2026-09-12T10:01:00.000Z" }],
  };

  it("posts the epoch and dispatches the response together with the localized notices", async () => {
    const { transport, request, dispatched, dispatch } = createTransport(json(200, response));

    await expect(
      runVoiceHeartbeat({ sessionId: SESSION_ID, epoch: 4, locale: "pl" }, dispatch, transport),
    ).resolves.toEqual(response);
    expect(request).toHaveBeenCalledWith(
      "/api/session/voice/heartbeat",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ sessionId: SESSION_ID, epoch: 4 }) }),
    );
    expect(dispatched).toEqual([{ type: "heartbeat", response, notices: buildVoiceHeartbeatNotices("pl") }]);
    expect(buildVoiceHeartbeatNotices("pl").superseded.copy.title).toBe(copy.notices.supersededTitle);
    expect(buildVoiceHeartbeatNotices("en").expired.copy.title).toBe(getSessionCopy("en").turn.expiredTitle);
  });

  it("reports a silent failure on throttling and a visible one when the server is unreachable", async () => {
    const throttled = createTransport(json(429, { ok: false, code: "rate_limited" }));
    await runVoiceHeartbeat({ sessionId: SESSION_ID, epoch: 4, locale: "pl" }, throttled.dispatch, throttled.transport);
    expect(throttled.dispatched).toEqual([{ type: "heartbeat_failed", notice: null }]);

    const offline = createTransport({ kind: "network_error", reason: "timeout" });
    await runVoiceHeartbeat({ sessionId: SESSION_ID, epoch: 4, locale: "pl" }, offline.dispatch, offline.transport);
    expect(offline.dispatched.at(-1)).toMatchObject({
      type: "heartbeat_failed",
      notice: { copy: { title: copy.notices.heartbeatFailedTitle } },
    });

    const broken = createTransport(json(503, { ok: false, type: "voice_error", code: "voice_observer_unavailable" }));
    await runVoiceHeartbeat({ sessionId: SESSION_ID, epoch: 4, locale: "pl" }, broken.dispatch, broken.transport);
    expect(broken.dispatched.at(-1)).toMatchObject({ type: "heartbeat_failed", notice: { variant: "info" } });
  });

  it("expires, ends or redirects like connect does", async () => {
    const expired = createTransport(
      json(409, { ok: false, type: "expired", code: "session_expired", session: { ...session, status: "expired" } }),
    );
    await runVoiceHeartbeat({ sessionId: SESSION_ID, epoch: 4, locale: "pl" }, expired.dispatch, expired.transport);
    expect(expired.dispatched.at(-1)).toMatchObject({ type: "session_expired" });

    const gone = createTransport(json(404, { ok: false, type: "voice_error", code: "session_not_found" }));
    await runVoiceHeartbeat({ sessionId: SESSION_ID, epoch: 4, locale: "pl" }, gone.dispatch, gone.transport);
    expect(gone.dispatched.at(-1)).toMatchObject({ type: "session_unavailable" });

    const signedOut = createTransport(json(401, { ok: false, type: "voice_error", code: "missing_auth" }));
    await runVoiceHeartbeat({ sessionId: SESSION_ID, epoch: 4, locale: "pl" }, signedOut.dispatch, signedOut.transport);
    expect(signedOut.navigate).toHaveBeenCalledWith("/auth/signin");
    expect(signedOut.dispatched).toEqual([]);
  });
});
