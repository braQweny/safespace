// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiJsonResult } from "@/lib/api-client";
import { MODALITY_CATALOG, toSelectedModalityAvatar } from "@/lib/modality-catalog";
import type { SessionStartPageState, SessionView } from "@/lib/session-flow/session-state";
import type { VoiceHeartbeatSuccessResponse } from "@/lib/session-flow/voice-contract";
import type { VoicePeerDependencies } from "../voice-peer";

/*
 * The hook before the first audio connection: the conversation's clock stands
 * still until `connect` returns the shifted window, and the original deadline
 * must not cut a connection that is still being made. Only the network and
 * the WebRTC peer are replaced.
 */
const requestApiJson = vi.hoisted(() => vi.fn<(url: string, init?: { body?: string }) => Promise<ApiJsonResult>>());
const peers = vi.hoisted(() => [] as { dependencies: VoicePeerDependencies; close: () => void }[]);

vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  requestApiJson,
}));
vi.mock("@/lib/session-flow/voice-support", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session-flow/voice-support")>()),
  readClientVoiceSupport: () => true,
}));
vi.mock("@/components/hooks/voice-peer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../voice-peer")>()),
  createVoicePeer: (dependencies: VoicePeerDependencies) => {
    const close = vi.fn();
    peers.push({ dependencies, close });
    return {
      isOpen: true,
      async connect(offerToAnswer: (offerSdp: string) => Promise<string>) {
        await offerToAnswer("v=0\r\na=offer\r\n");
      },
      setMicEnabled: vi.fn(),
      close,
    };
  },
}));

const { useVoiceSession } = await import("../useVoiceSession");

const cbt = MODALITY_CATALOG.find((entry) => entry.modalityId === "cbt") ?? MODALITY_CATALOG[1];
// Started ten minutes ago, never connected: the original deadline is now.
const waitingSession: SessionView = {
  id: "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f",
  status: "active",
  startedAt: "2026-09-23T18:35:50.000Z",
  endedAt: null,
  expiresAt: "2026-09-23T18:45:50.000Z",
  remainingSeconds: 0,
  isTrial: false,
  durationBucketSeconds: 600,
  mode: "voice",
  voiceConnected: false,
};
const shiftedSession: SessionView = {
  ...waitingSession,
  startedAt: "2026-09-23T18:45:48.000Z",
  expiresAt: "2026-09-23T18:55:48.000Z",
  remainingSeconds: 600,
  voiceConnected: true,
};
const initialState: SessionStartPageState = {
  kind: "active",
  trialAvailable: false,
  avatar: { selected: toSelectedModalityAvatar(cbt) },
  session: waitingSession,
  messages: [],
  messageFetchFailed: false,
  sessionQuota: null,
};

function json(status: number, body: unknown): ApiJsonResult {
  return { kind: "json", status, body };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function heartbeatCalls() {
  return requestApiJson.mock.calls.filter(([url]) => url === "/api/session/voice/heartbeat");
}

beforeEach(() => {
  peers.length = 0;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useVoiceSession before the first audio connection", () => {
  it("lets a connection in flight decide instead of the original deadline, then adopts the shifted window", async () => {
    const connect = deferred<ApiJsonResult>();
    requestApiJson.mockImplementation((url: string) =>
      url === "/api/session/voice/connect" ? connect.promise : Promise.resolve(json(503, { ok: false })),
    );

    const { result } = renderHook(() => useVoiceSession(initialState, { locale: "pl", voiceAvailable: true }));
    let connecting: Promise<void> = Promise.resolve();

    act(() => {
      connecting = result.current.enableMicrophone();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state.status).toBe("connecting");

    // The header's timer reaches the original deadline while the connection is being made.
    act(() => {
      result.current.handleExpired();
    });
    expect(result.current.state).toMatchObject({ kind: "active", status: "connecting" });
    expect(peers[0].close).not.toHaveBeenCalled();
    expect(heartbeatCalls()).toHaveLength(0);

    await act(async () => {
      connect.resolve(
        json(200, {
          ok: true,
          type: "voice_connected",
          sdp: "v=0\r\na=answer\r\n",
          expiresAt: shiftedSession.expiresAt,
          serverNow: "2026-09-23T18:45:48.000Z",
          epoch: 1,
          reconnected: false,
          session: shiftedSession,
        }),
      );
      await connecting;
    });

    expect(result.current.state).toMatchObject({ kind: "active", status: "live", session: shiftedSession });
  });

  it("ends a waiting conversation at its original deadline when nothing is connecting, without the time-is-up notice", async () => {
    const expiredSession: SessionView = { ...waitingSession, status: "expired" };
    requestApiJson.mockImplementation(() =>
      Promise.resolve(
        json(200, {
          ok: true,
          type: "voice_heartbeat",
          live: false,
          closeReason: "time_limit_reached",
          epoch: 0,
          remainingSeconds: 0,
          serverNow: "2026-09-23T18:45:51.000Z",
          session: expiredSession,
          messages: [],
        } satisfies VoiceHeartbeatSuccessResponse),
      ),
    );

    const { result } = renderHook(() => useVoiceSession(initialState, { locale: "pl", voiceAvailable: true }));

    await act(async () => {
      result.current.handleExpired();
      await Promise.resolve();
    });

    expect(result.current.state).toMatchObject({ kind: "expired", status: "ended", notice: null });
    expect(result.current.state.session).toMatchObject({ status: "expired", voiceConnected: false });
    expect(heartbeatCalls()).toHaveLength(1);
  });
});
