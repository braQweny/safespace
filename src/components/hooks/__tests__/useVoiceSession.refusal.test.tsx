// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiJsonResult } from "@/lib/api-client";
import { MODALITY_CATALOG, toSelectedModalityAvatar } from "@/lib/modality-catalog";
import type { SessionStartPageState, SessionView } from "@/lib/session-flow/session-state";
import type { VoiceHeartbeatSuccessResponse } from "@/lib/session-flow/voice-contract";
import type { VoicePeerDependencies } from "../voice-peer";

/*
 * The whole hook, with only its edges replaced: the network (`requestApiJson`)
 * and the WebRTC peer. A fake peer answers the offer through the hook's own
 * callback and lets the test drop the connection.
 */
const requestApiJson = vi.hoisted(() => vi.fn<(url: string, init?: { body?: string }) => Promise<ApiJsonResult>>());
const peers = vi.hoisted(() => [] as { dependencies: VoicePeerDependencies }[]);

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
    peers.push({ dependencies });
    return {
      isOpen: true,
      async connect(offerToAnswer: (offerSdp: string) => Promise<string>) {
        await offerToAnswer("v=0\r\na=offer\r\n");
      },
      setMicEnabled: vi.fn(),
      close: vi.fn(),
    };
  },
}));

const { useVoiceSession } = await import("../useVoiceSession");

const cbt = MODALITY_CATALOG.find((entry) => entry.modalityId === "cbt") ?? MODALITY_CATALOG[1];
const session: SessionView = {
  id: "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f",
  status: "active",
  startedAt: "2026-09-12T10:00:00.000Z",
  endedAt: null,
  expiresAt: "2099-09-12T11:00:00.000Z",
  remainingSeconds: 3000,
  isTrial: false,
  durationBucketSeconds: 3600,
  mode: "voice",
};
const initialState: SessionStartPageState = {
  kind: "active",
  trialAvailable: false,
  avatar: { selected: toSelectedModalityAvatar(cbt) },
  session,
  messages: [],
  messageFetchFailed: false,
  sessionQuota: null,
};

function json(status: number, body: unknown): ApiJsonResult {
  return { kind: "json", status, body };
}

function connected(epoch: number) {
  return json(200, {
    ok: true,
    type: "voice_connected",
    sdp: "v=0\r\na=answer\r\n",
    expiresAt: session.expiresAt,
    serverNow: "2026-09-12T10:01:00.000Z",
    epoch,
    reconnected: epoch > 1,
    session,
  });
}

const refused = json(403, { ok: false, type: "voice_error", code: "voice_minutes_exhausted" });

function heartbeat(overrides: Partial<VoiceHeartbeatSuccessResponse> = {}) {
  return json(200, {
    ok: true,
    type: "voice_heartbeat",
    live: false,
    closeReason: "heartbeat_lost",
    epoch: 1,
    remainingSeconds: 2900,
    serverNow: "2026-09-12T10:02:00.000Z",
    session,
    messages: [],
    ...overrides,
  } satisfies VoiceHeartbeatSuccessResponse);
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

describe("useVoiceSession after a pool refusal during a reconnect", () => {
  it("stays refused when the heartbeat from the lost connection resolves late, and drains the tail once", async () => {
    const lostHeartbeat = deferred<ApiJsonResult>();
    const connects = [connected(1), refused];
    const heartbeats = [
      lostHeartbeat.promise,
      Promise.resolve(
        heartbeat({
          messages: [
            {
              id: "m1",
              role: "user",
              sequenceIndex: 0,
              content: "Ostatnie słowa.",
              createdAt: "2026-09-12T10:01:30.000Z",
            },
          ],
        }),
      ),
    ];
    requestApiJson.mockImplementation((url: string) => {
      if (url === "/api/session/voice/connect") return Promise.resolve(connects.shift() ?? refused);
      return heartbeats.shift() ?? Promise.resolve(heartbeat());
    });

    const { result } = renderHook(() => useVoiceSession(initialState, { locale: "pl", voiceAvailable: true }));

    await act(async () => {
      await result.current.enableMicrophone();
    });
    expect(result.current.state.status).toBe("live");

    // The connection drops: the hook starts a heartbeat that will answer only later.
    act(() => {
      peers[0].dependencies.onConnectionLost();
    });
    expect(result.current.state.status).toBe("reconnecting");

    // The reconnect is refused by the minute pool.
    await act(async () => {
      await result.current.reconnect();
    });
    expect(result.current.state).toMatchObject({ status: "refused", refusal: "voice_minutes_exhausted" });

    // The stale heartbeat lands after the refusal: it must not bring back "reconnecting".
    await act(async () => {
      lostHeartbeat.resolve(heartbeat());
      await lostHeartbeat.promise;
    });
    expect(result.current.state).toMatchObject({ status: "refused", notice: null });

    // One final heartbeat after the refusal brings the last saved rows without a reload.
    await waitFor(() => {
      expect(result.current.state.persistedMessages.map((message) => message.id)).toEqual(["m1"]);
    });
    expect(result.current.state.status).toBe("refused");
    expect(heartbeatCalls()).toHaveLength(2);
    expect(peers).toHaveLength(2);
  });

  it("does not drain when the very first connection is refused, since nothing was said", async () => {
    requestApiJson.mockImplementation((url: string) =>
      Promise.resolve(url === "/api/session/voice/connect" ? refused : heartbeat()),
    );

    const { result } = renderHook(() => useVoiceSession(initialState, { locale: "pl", voiceAvailable: true }));

    await act(async () => {
      await result.current.enableMicrophone();
    });

    expect(result.current.state).toMatchObject({ status: "refused", refusal: "voice_minutes_exhausted" });
    expect(heartbeatCalls()).toHaveLength(0);
  });
});
