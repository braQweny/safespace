import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceLiveEvent } from "@/lib/session-flow/voice-live-events";
import {
  VOICE_DATA_CHANNEL_LABEL,
  VOICE_DISCONNECT_GRACE_MS,
  VoicePeerError,
  createVoicePeer,
  type VoicePeerDependencies,
} from "../voice-peer";

/**
 * Atrapy WebRTC: tyle powierzchni, ile peer naprawdę dotyka. Kanał danych
 * celowo nie ma działającego `send` — test pilnuje, że nikt go nie woła.
 */
class FakeTrack {
  enabled = true;
  readonly kind = "audio";
  readonly stop = vi.fn();
}

class FakeStream {
  constructor(private readonly tracks: FakeTrack[] = [new FakeTrack()]) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks;
  }
}

class FakeChannel extends EventTarget {
  readonly label: string;
  readonly send = vi.fn(() => {
    throw new Error("the browser must never send on the data channel");
  });
  readonly close = vi.fn(() => {
    this.dispatchEvent(new Event("close"));
  });
  constructor(label: string) {
    super();
    this.label = label;
  }
  message(payload: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(payload) }));
  }
  raw(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

class FakePeerConnection extends EventTarget {
  iceGatheringState: RTCIceGatheringState = "new";
  connectionState: RTCPeerConnectionState = "new";
  localDescription: { sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  readonly tracks: FakeTrack[] = [];
  channel: FakeChannel | null = null;
  readonly close = vi.fn();
  addTrack(track: FakeTrack) {
    this.tracks.push(track);
  }
  createDataChannel(label: string) {
    this.channel = new FakeChannel(label);
    return this.channel;
  }
  createOffer() {
    return Promise.resolve({ type: "offer", sdp: "v=0\r\na=offer" });
  }
  setLocalDescription(description: { sdp?: string }) {
    this.localDescription = { sdp: `${description.sdp ?? ""}\r\na=candidate` };
    return Promise.resolve();
  }
  setRemoteDescription(description: { type: string; sdp: string }) {
    if (description.sdp === "v=0\r\na=broken") {
      return Promise.reject(new Error("bad answer"));
    }
    this.remoteDescription = description;
    return Promise.resolve();
  }
  gatheringComplete() {
    this.iceGatheringState = "complete";
    this.dispatchEvent(new Event("icegatheringstatechange"));
  }
  setConnectionState(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.dispatchEvent(new Event("connectionstatechange"));
  }
  remoteTrack(stream: FakeStream) {
    const event = new Event("track") as Event & { streams: FakeStream[]; track: FakeTrack };
    event.streams = [stream];
    event.track = stream.getTracks()[0];
    this.dispatchEvent(event);
  }
}

function setup(overrides: Partial<VoicePeerDependencies> = {}) {
  const connection = new FakePeerConnection();
  const microphone = new FakeStream();
  const events: VoiceLiveEvent[] = [];
  const onConnectionLost = vi.fn();
  const onRemoteStream = vi.fn();
  const dependencies: VoicePeerDependencies = {
    getUserMedia: vi.fn(() => Promise.resolve(microphone as unknown as MediaStream)),
    createPeerConnection: () => connection as unknown as RTCPeerConnection,
    onEvent: (event) => {
      events.push(event);
    },
    onConnectionLost,
    onRemoteStream,
    ...overrides,
  };
  return { peer: createVoicePeer(dependencies), connection, microphone, events, onConnectionLost, onRemoteStream };
}

describe("createVoicePeer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks for the microphone, offers with gathered candidates, applies the answer and never sends on the channel", async () => {
    const { peer, connection, microphone, events } = setup();
    const offerToAnswer = vi.fn((offerSdp: string) => {
      expect(offerSdp).toBe("v=0\r\na=offer\r\na=candidate");
      return Promise.resolve("v=0\r\na=answer");
    });

    const connecting = peer.connect(offerToAnswer);
    await vi.advanceTimersByTimeAsync(0);
    connection.gatheringComplete();
    await connecting;

    expect(connection.tracks).toEqual(microphone.getAudioTracks());
    expect(connection.channel?.label).toBe(VOICE_DATA_CHANNEL_LABEL);
    expect(connection.remoteDescription).toEqual({ type: "answer", sdp: "v=0\r\na=answer" });
    expect(peer.isOpen).toBe(true);

    connection.channel?.message({ type: "session.input_transcript.delta", delta: "hej", start_ms: 0, end_ms: 200 });
    // Nie-JSON i ramki binarne są pomijane; nieznane typy dochodzą jako `ignored`.
    connection.channel?.raw("not json at all");
    connection.channel?.raw(new ArrayBuffer(4));
    connection.channel?.message({ type: "session.usage.updated", usage: { seconds: 3 } });
    expect(events).toEqual([
      { kind: "input_fragment", delta: "hej", startMs: 0, endMs: 200 },
      { kind: "usage_updated", usageSeconds: 3 },
    ]);
    expect(connection.channel?.send).not.toHaveBeenCalled();

    peer.setMicEnabled(false);
    expect(microphone.getAudioTracks()[0].enabled).toBe(false);
    peer.setMicEnabled(true);
    expect(microphone.getAudioTracks()[0].enabled).toBe(true);
  });

  it("sends the offer after the gathering timeout when candidates never complete", async () => {
    const { peer, connection } = setup();
    const offerToAnswer = vi.fn(() => Promise.resolve("v=0\r\na=answer"));

    const connecting = peer.connect(offerToAnswer);
    await vi.advanceTimersByTimeAsync(2_000);
    await connecting;

    expect(offerToAnswer).toHaveBeenCalledTimes(1);
    expect(connection.remoteDescription?.sdp).toBe("v=0\r\na=answer");
  });

  it("reports the failing stage: microphone, offer or answer", async () => {
    const denied = new Error("NotAllowedError");
    denied.name = "NotAllowedError";
    const { peer: mediaPeer } = setup({ getUserMedia: () => Promise.reject(denied) });
    await expect(mediaPeer.connect(() => Promise.resolve("v=0"))).rejects.toMatchObject({
      stage: "media",
      cause: denied,
    });

    const { peer: answerPeer, connection } = setup();
    const connecting = answerPeer.connect(() => Promise.resolve("v=0\r\na=broken"));
    await vi.advanceTimersByTimeAsync(0);
    connection.gatheringComplete();
    await expect(connecting).rejects.toBeInstanceOf(VoicePeerError);
    expect(answerPeer.isOpen).toBe(false);

    const { peer: workerPeer, connection: workerConnection } = setup();
    const refused = workerPeer.connect(() => Promise.reject(new Error("refused")));
    await vi.advanceTimersByTimeAsync(0);
    workerConnection.gatheringComplete();
    await expect(refused).rejects.toThrow("refused");
  });

  it("forwards the remote audio stream and reports a lost connection once, after the disconnect grace", async () => {
    const { peer, connection, onConnectionLost, onRemoteStream } = setup();
    const connecting = peer.connect(() => Promise.resolve("v=0\r\na=answer"));
    await vi.advanceTimersByTimeAsync(0);
    connection.gatheringComplete();
    await connecting;

    const remote = new FakeStream();
    connection.remoteTrack(remote);
    expect(onRemoteStream).toHaveBeenCalledWith(remote);

    connection.setConnectionState("disconnected");
    await vi.advanceTimersByTimeAsync(VOICE_DISCONNECT_GRACE_MS - 1);
    expect(onConnectionLost).not.toHaveBeenCalled();
    connection.setConnectionState("connected");
    await vi.advanceTimersByTimeAsync(VOICE_DISCONNECT_GRACE_MS);
    expect(onConnectionLost).not.toHaveBeenCalled();

    connection.setConnectionState("disconnected");
    await vi.advanceTimersByTimeAsync(VOICE_DISCONNECT_GRACE_MS);
    expect(onConnectionLost).toHaveBeenCalledTimes(1);
    connection.setConnectionState("failed");
    connection.channel?.close();
    expect(onConnectionLost).toHaveBeenCalledTimes(1);
    expect(peer.isOpen).toBe(false);
  });

  it("does not treat the provider's own close or our close as a lost connection, and stops the microphone", async () => {
    const { peer, connection, microphone, onConnectionLost } = setup();
    const connecting = peer.connect(() => Promise.resolve("v=0\r\na=answer"));
    await vi.advanceTimersByTimeAsync(0);
    connection.gatheringComplete();
    await connecting;

    connection.channel?.message({ type: "session.closed", reason: "close_requested", usage: { seconds: 3 } });
    connection.channel?.close();
    expect(onConnectionLost).not.toHaveBeenCalled();
    expect(peer.isOpen).toBe(false);

    const {
      peer: closedPeer,
      connection: closedConnection,
      microphone: closedMicrophone,
      onConnectionLost: lost,
    } = setup();
    const closing = closedPeer.connect(() => Promise.resolve("v=0\r\na=answer"));
    await vi.advanceTimersByTimeAsync(0);
    closedConnection.gatheringComplete();
    await closing;
    closedPeer.close();
    expect(closedConnection.close).toHaveBeenCalledTimes(1);
    expect(closedMicrophone.getTracks()[0].stop).toHaveBeenCalledTimes(1);
    closedConnection.setConnectionState("failed");
    expect(lost).not.toHaveBeenCalled();
    expect(microphone.getTracks()[0].stop).not.toHaveBeenCalled();
  });

  it("drops the microphone when closed while still waiting for permission", async () => {
    let grant: (stream: MediaStream) => void = () => undefined;
    const microphone = new FakeStream();
    const { peer, connection } = setup({
      getUserMedia: () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve;
        }),
    });
    const connecting = peer.connect(() => Promise.resolve("v=0"));
    peer.close();
    grant(microphone as unknown as MediaStream);
    await connecting;

    expect(microphone.getTracks()[0].stop).toHaveBeenCalledTimes(1);
    expect(connection.tracks).toHaveLength(0);
  });
});
