import { parseVoiceLiveEvent, type VoiceLiveEvent } from "@/lib/session-flow/voice-live-events";

/**
 * Połączenie WebRTC rozmowy głosowej po stronie przeglądarki, bez Reacta i
 * z wstrzykiwanymi zależnościami (mikrofon, `RTCPeerConnection`), żeby dało
 * się je przetestować z atrapami.
 *
 * Przeglądarka tylko słucha: odbiera zdarzenia z kanału danych (transkrypt do
 * podglądu, `session.closed`) i nigdy nic po nim nie wysyła — sterowanie,
 * klasyfikacja i termin są po stronie serwera. Oferta SDP idzie przez Worker
 * (`POST /api/session/voice/connect`), klucz dostawcy nie dociera tutaj.
 */
export const VOICE_DATA_CHANNEL_LABEL = "oai-events";

/** Tyle czekamy na zebranie kandydatów ICE, zanim wyślemy ofertę „jak jest”. */
export const VOICE_ICE_GATHERING_TIMEOUT_MS = 2_000;

/** `disconnected` bywa chwilowe (zmiana sieci); dopiero po tej ciszy uznajemy połączenie za zerwane. */
export const VOICE_DISCONNECT_GRACE_MS = 3_000;

export type VoicePeerStage = "media" | "offer" | "answer";

/** Na którym etapie połączenie padło: mikrofon (zgoda, brak urządzenia) albo sama sesja. */
export class VoicePeerError extends Error {
  readonly stage: VoicePeerStage;
  readonly cause: unknown;

  constructor(stage: VoicePeerStage, cause: unknown) {
    super(`voice_peer_${stage}_failed`);
    this.name = "VoicePeerError";
    this.stage = stage;
    this.cause = cause;
  }
}

export interface VoicePeerDependencies {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createPeerConnection: () => RTCPeerConnection;
  onEvent: (event: VoiceLiveEvent) => void;
  onConnectionLost: () => void;
  onRemoteStream: (stream: MediaStream) => void;
}

export interface VoicePeer {
  /**
   * Jednorazowe: mikrofon → oferta → `offerToAnswer` (Worker) → odpowiedź.
   * Ponowne łączenie tworzy nowy peer; stary jest zamykany.
   */
  connect(offerToAnswer: (offerSdp: string) => Promise<string>): Promise<void>;
  setMicEnabled(enabled: boolean): void;
  close(): void;
  readonly isOpen: boolean;
}

export const VOICE_MICROPHONE_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true },
};

function waitForIceGathering(connection: RTCPeerConnection, timeoutMs: number) {
  if (connection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      connection.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (connection.iceGatheringState === "complete") {
        finish();
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    connection.addEventListener("icegatheringstatechange", check);
  });
}

export function createVoicePeer(dependencies: VoicePeerDependencies): VoicePeer {
  // Jeden obiekt stanu zamiast luźnych `let`: wartości zmieniane w domknięciach
  // (zamknięcie, zdarzenia) nie dają się wtedy błędnie zawęzić przez TypeScript.
  const peer: {
    stream: MediaStream | null;
    connection: RTCPeerConnection | null;
    channel: RTCDataChannel | null;
    disconnectTimer: ReturnType<typeof setTimeout> | null;
    closing: boolean;
    closedByProvider: boolean;
    lostReported: boolean;
    open: boolean;
  } = {
    stream: null,
    connection: null,
    channel: null,
    disconnectTimer: null,
    closing: false,
    closedByProvider: false,
    lostReported: false,
    open: false,
  };

  function reportLost() {
    if (peer.closing || peer.closedByProvider || peer.lostReported) {
      return;
    }

    peer.lostReported = true;
    peer.open = false;
    dependencies.onConnectionLost();
  }

  function clearDisconnectTimer() {
    if (peer.disconnectTimer !== null) {
      clearTimeout(peer.disconnectTimer);
      peer.disconnectTimer = null;
    }
  }

  function handleMessage(event: MessageEvent) {
    // Zdarzenia dostawcy są tekstem JSON; ramki binarne i nie-JSON nie są zdarzeniami.
    if (typeof event.data !== "string") {
      return;
    }

    let payload: unknown;

    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    const parsed = parseVoiceLiveEvent(payload);

    if (parsed.kind === "session_closed") {
      peer.closedByProvider = true;
      peer.open = false;
    }

    dependencies.onEvent(parsed);
  }

  function handleConnectionState() {
    const state = peer.connection?.connectionState;

    if (state === "failed" || state === "closed") {
      clearDisconnectTimer();
      reportLost();
      return;
    }

    if (state === "disconnected") {
      peer.disconnectTimer ??= setTimeout(() => {
        peer.disconnectTimer = null;
        if (peer.connection?.connectionState === "disconnected") {
          reportLost();
        }
      }, VOICE_DISCONNECT_GRACE_MS);
      return;
    }

    if (state === "connected") {
      clearDisconnectTimer();
    }
  }

  function stopTracks() {
    peer.stream?.getTracks().forEach((track) => {
      track.stop();
    });
  }

  // Odczyt przez funkcję: po `await` domknięcia mogły zmienić stan, a TypeScript
  // zawęża własności obiektu tylko w prostej linii kodu.
  function isClosing() {
    return peer.closing;
  }

  function currentConnection() {
    return peer.connection;
  }

  return {
    get isOpen() {
      return peer.open;
    },

    async connect(offerToAnswer) {
      try {
        peer.stream = await dependencies.getUserMedia(VOICE_MICROPHONE_CONSTRAINTS);
      } catch (error) {
        throw new VoicePeerError("media", error);
      }

      if (isClosing()) {
        stopTracks();
        return;
      }

      let offerSdp: string;

      try {
        const connection = dependencies.createPeerConnection();
        peer.connection = connection;
        for (const track of peer.stream.getAudioTracks()) {
          connection.addTrack(track, peer.stream);
        }
        connection.addEventListener("track", (event) => {
          const remote = event.streams[0] ?? new MediaStream([event.track]);
          dependencies.onRemoteStream(remote);
        });
        connection.addEventListener("connectionstatechange", handleConnectionState);
        // Kanał otwiera przeglądarka, ale nigdy nic po nim nie wysyła.
        const channel = connection.createDataChannel(VOICE_DATA_CHANNEL_LABEL);
        peer.channel = channel;
        channel.addEventListener("message", handleMessage);
        channel.addEventListener("close", reportLost);
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await waitForIceGathering(connection, VOICE_ICE_GATHERING_TIMEOUT_MS);
        offerSdp = connection.localDescription?.sdp ?? offer.sdp ?? "";
      } catch (error) {
        throw new VoicePeerError("offer", error);
      }

      const answerSdp = await offerToAnswer(offerSdp);
      const connection = currentConnection();

      if (isClosing() || !connection) {
        return;
      }

      try {
        await connection.setRemoteDescription({ type: "answer", sdp: answerSdp });
        peer.open = true;
      } catch (error) {
        throw new VoicePeerError("answer", error);
      }
    },

    setMicEnabled(enabled) {
      peer.stream?.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    },

    close() {
      peer.closing = true;
      peer.open = false;
      clearDisconnectTimer();
      peer.channel?.removeEventListener("close", reportLost);
      peer.channel?.close();
      peer.connection?.close();
      stopTracks();
      peer.channel = null;
      peer.connection = null;
      peer.stream = null;
    },
  };
}
