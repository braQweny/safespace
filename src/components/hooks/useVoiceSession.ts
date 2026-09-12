import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { isRateLimitedApiResult, requestApiJson } from "@/lib/api-client";
import type { Locale } from "@/lib/i18n/locale";
import { getSessionCopy } from "@/lib/session-copy";
import { getMicrophoneErrorCopy } from "@/lib/session-flow/microphone-error-copy";
import { buildInfoNotice } from "@/lib/session-flow/session-notice";
import type { SessionStartPageState } from "@/lib/session-flow/session-state";
import {
  isVoiceConnectResponse,
  isVoiceHeartbeatResponse,
  type VoiceHeartbeatSuccessResponse,
} from "@/lib/session-flow/voice-contract";
import type { VoiceLiveEvent } from "@/lib/session-flow/voice-live-events";
import {
  getInitialVoiceSessionState,
  isVoiceConnected,
  selectLiveFragments,
  shouldHeartbeat,
  voiceSessionReducer,
  type VoiceHeartbeatNotices,
  type VoiceSessionDispatch,
} from "@/lib/session-flow/voice-session-state";
import { getBrowserMediaDevices, readClientVoiceSupport } from "@/lib/session-flow/voice-support";
import { VOICE_HEARTBEAT_INTERVAL_MS } from "@/lib/voice/constants";
import { getVoiceSessionCopy } from "@/components/session/voice-session-copy";
import { endTimedSession, getSessionAccessRedirectHref, type TimedSessionTransport } from "./useTimedSession";
import { createVoicePeer, VoicePeerError, type VoicePeer } from "./voice-peer";

/** Połączenie z dostawcą i uzbrojenie obserwatora mieszczą się w kilku sekundach; dalej to awaria. */
export const VOICE_CONNECT_TIMEOUT_MS = 20_000;
export const VOICE_HEARTBEAT_TIMEOUT_MS = 15_000;
/** Podgląd zamyka otwartą wypowiedź po ciszy; sprawdzamy to co pół sekundy. */
const IDLE_FLUSH_INTERVAL_MS = 500;
/** Jedna automatyczna próba wznowienia po zerwanym połączeniu; dalej ręcznie. */
const AUTO_RECONNECT_DELAY_MS = 1_000;

const defaultTransport: TimedSessionTransport = {
  request: requestApiJson,
  navigate: (href) => {
    window.location.assign(href);
  },
};

export function buildVoiceHeartbeatNotices(locale: Locale): VoiceHeartbeatNotices {
  const { notices } = getVoiceSessionCopy(locale);
  const { turn } = getSessionCopy(locale);

  return {
    expired: buildInfoNotice(turn.expiredTitle, turn.expiredBody),
    disabled: buildInfoNotice(notices.disabledTitle, notices.disabledBody),
    superseded: buildInfoNotice(notices.supersededTitle, notices.supersededBody),
    connectionLost: buildInfoNotice(notices.connectionLostTitle, notices.connectionLostBody),
  };
}

export interface VoiceConnectInput {
  sessionId: string;
  offerSdp: string;
  locale: Locale;
}

/**
 * Oferta SDP → Worker → odpowiedź SDP i epoka. Bez Reacta, żeby dało się
 * przetestować każdy kod odpowiedzi. `null` = połączenie nie doszło do skutku,
 * a reduktor już wie dlaczego.
 */
export async function connectVoiceSession(
  input: VoiceConnectInput,
  dispatch: VoiceSessionDispatch,
  transport: TimedSessionTransport = defaultTransport,
): Promise<{ answerSdp: string; epoch: number } | null> {
  const { notices } = getVoiceSessionCopy(input.locale);
  const { turn } = getSessionCopy(input.locale);
  const connectFailed = (body: string, retryable: boolean) => {
    dispatch({ type: "connect_failed", notice: buildInfoNotice(notices.connectFailedTitle, body), retryable });
    return null;
  };

  dispatch({ type: "connecting" });

  const result = await transport.request("/api/session/voice/connect", {
    method: "POST",
    body: JSON.stringify({ sessionId: input.sessionId, sdp: input.offerSdp }),
    timeoutMs: VOICE_CONNECT_TIMEOUT_MS,
  });

  if (result.kind === "network_error") {
    return connectFailed(turn.connectionUnavailableBody, true);
  }

  if (isRateLimitedApiResult(result)) {
    return connectFailed(notices.connectRateLimitedBody, true);
  }

  const body = result.body;

  if (!isVoiceConnectResponse(body)) {
    return connectFailed(notices.connectFailedBody, true);
  }

  if (body.ok) {
    dispatch({ type: "connected", epoch: body.epoch, session: body.session });
    return { answerSdp: body.sdp, epoch: body.epoch };
  }

  if (body.type === "expired") {
    dispatch({
      type: "session_expired",
      session: body.session,
      notice: buildInfoNotice(turn.expiredTitle, turn.expiredBody),
    });
    return null;
  }

  if (body.type === "validation_failed") {
    return connectFailed(notices.connectFailedBody, false);
  }

  const redirectHref = getSessionAccessRedirectHref(body.code);

  if (redirectHref) {
    transport.navigate(redirectHref);
    return null;
  }

  if (body.code === "voice_unavailable") {
    dispatch({
      type: "connect_failed",
      notice: buildInfoNotice(
        getVoiceSessionCopy(input.locale).unavailableTitle,
        getVoiceSessionCopy(input.locale).unavailableBody,
      ),
      retryable: false,
    });
    return null;
  }

  if (
    body.code === "session_not_active" ||
    body.code === "session_mode_mismatch" ||
    body.code === "session_not_found"
  ) {
    dispatch({
      type: "session_unavailable",
      notice: buildInfoNotice(turn.sessionNotActiveTitle, turn.sessionNotActiveBody),
    });
    return null;
  }

  // Dostawca, obserwator albo dane chwilowo niedostępne: warto spróbować znów.
  return connectFailed(notices.connectFailedBody, true);
}

export interface VoiceHeartbeatInput {
  sessionId: string;
  epoch: number;
  locale: Locale;
}

/** Jeden puls: zapisane wypowiedzi, nasz powód zamknięcia i prawdziwy stan wiersza. */
export async function runVoiceHeartbeat(
  input: VoiceHeartbeatInput,
  dispatch: VoiceSessionDispatch,
  transport: TimedSessionTransport = defaultTransport,
): Promise<VoiceHeartbeatSuccessResponse | null> {
  const { notices } = getVoiceSessionCopy(input.locale);
  const { turn } = getSessionCopy(input.locale);
  const result = await transport.request("/api/session/voice/heartbeat", {
    method: "POST",
    body: JSON.stringify({ sessionId: input.sessionId, epoch: input.epoch }),
    timeoutMs: VOICE_HEARTBEAT_TIMEOUT_MS,
  });

  if (result.kind === "network_error") {
    dispatch({
      type: "heartbeat_failed",
      notice: buildInfoNotice(notices.heartbeatFailedTitle, notices.heartbeatFailedBody),
    });
    return null;
  }

  if (isRateLimitedApiResult(result)) {
    // Puls przyspieszony (dwie karty, reconnect): następny zwykły wystarczy.
    dispatch({ type: "heartbeat_failed", notice: null });
    return null;
  }

  const body = result.body;

  if (!isVoiceHeartbeatResponse(body)) {
    dispatch({
      type: "heartbeat_failed",
      notice: buildInfoNotice(notices.heartbeatFailedTitle, notices.heartbeatFailedBody),
    });
    return null;
  }

  if (body.ok) {
    dispatch({ type: "heartbeat", response: body, notices: buildVoiceHeartbeatNotices(input.locale) });
    return body;
  }

  if (body.type === "expired") {
    dispatch({
      type: "session_expired",
      session: body.session,
      notice: buildInfoNotice(turn.expiredTitle, turn.expiredBody),
    });
    return null;
  }

  if (body.type === "validation_failed") {
    dispatch({ type: "heartbeat_failed", notice: null });
    return null;
  }

  const redirectHref = getSessionAccessRedirectHref(body.code);

  if (redirectHref) {
    transport.navigate(redirectHref);
    return null;
  }

  if (
    body.code === "session_not_active" ||
    body.code === "session_mode_mismatch" ||
    body.code === "session_not_found"
  ) {
    dispatch({
      type: "session_unavailable",
      notice: buildInfoNotice(turn.sessionNotActiveTitle, turn.sessionNotActiveBody),
    });
    return null;
  }

  dispatch({
    type: "heartbeat_failed",
    notice: buildInfoNotice(notices.heartbeatFailedTitle, notices.heartbeatFailedBody),
  });
  return null;
}

export interface UseVoiceSessionOptions {
  locale: Locale;
  /** Flaga i dostawca po stronie serwera (`isVoiceStartAvailable`). */
  voiceAvailable: boolean;
}

export function useVoiceSession(initialState: SessionStartPageState, options: UseVoiceSessionOptions) {
  const { locale, voiceAvailable } = options;
  const [state, dispatch] = useReducer(voiceSessionReducer, { initialState, voiceAvailable }, (init) =>
    getInitialVoiceSessionState(init.initialState, { voiceAvailable: init.voiceAvailable }),
  );
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const peerRef = useRef<VoicePeer | null>(null);
  const epochRef = useRef(0);
  const heartbeatInFlightRef = useRef(false);
  const autoReconnectedRef = useRef(false);
  const sessionId = state.session?.id ?? null;
  const copy = getVoiceSessionCopy(locale);

  // Wsparcie przeglądarki dopiero po hydratacji: SSR nie wie, czy jest mikrofon.
  useEffect(() => {
    if (!readClientVoiceSupport()) {
      dispatch({ type: "unsupported" });
    }
  }, []);

  const heartbeatNow = useCallback(async () => {
    if (!sessionId || heartbeatInFlightRef.current) {
      return;
    }

    heartbeatInFlightRef.current = true;

    try {
      await runVoiceHeartbeat({ sessionId, epoch: epochRef.current, locale }, dispatch);
    } finally {
      heartbeatInFlightRef.current = false;
    }
  }, [locale, sessionId]);

  const handleEvent = useCallback(
    (event: VoiceLiveEvent) => {
      if (event.kind === "input_fragment" || event.kind === "output_fragment") {
        dispatch({
          type: "fragment",
          fragment: {
            speaker: event.kind === "input_fragment" ? "user" : "assistant",
            text: event.delta,
            startMs: event.startMs,
            endMs: event.endMs,
            epoch: epochRef.current,
          },
          nowMs: Date.now(),
        });
        return;
      }

      if (event.kind === "session_closed") {
        // Nasz powód zamknięcia przychodzi z heartbeatu, nie od dostawcy.
        void heartbeatNow();
      }
    },
    [heartbeatNow],
  );

  const closePeer = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
  }, []);

  const enableMicrophone = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    dispatch({ type: "mic_requested" });
    closePeer();

    const peer = createVoicePeer({
      getUserMedia: (constraints) => {
        const mediaDevices = getBrowserMediaDevices();

        if (!mediaDevices) {
          return Promise.reject(new Error("NotSupportedError"));
        }

        return mediaDevices.getUserMedia(constraints);
      },
      createPeerConnection: () => new RTCPeerConnection(),
      onEvent: handleEvent,
      onConnectionLost: () => {
        dispatch({
          type: "connection_lost",
          notice: buildInfoNotice(copy.notices.connectionLostTitle, copy.notices.connectionLostBody),
        });
        void heartbeatNow();
      },
      onRemoteStream: setRemoteStream,
    });
    peerRef.current = peer;

    try {
      // Obiekt, nie zmienna: TypeScript nie zawęża wartości ustawianej w domknięciu.
      const outcome = { connected: false };

      await peer.connect(async (offerSdp) => {
        const answer = await connectVoiceSession({ sessionId, offerSdp, locale }, dispatch);

        if (!answer) {
          throw new VoicePeerError("answer", null);
        }

        epochRef.current = answer.epoch;
        outcome.connected = true;
        return answer.answerSdp;
      });

      if (!outcome.connected) {
        peer.close();
      }
    } catch (error) {
      peer.close();

      if (error instanceof VoicePeerError && error.stage === "media") {
        dispatch({
          type: "mic_failed",
          notice: buildInfoNotice(copy.notices.micFailedTitle, getMicrophoneErrorCopy(locale, error.cause)),
        });
        return;
      }

      // `answer` z pustą przyczyną: reduktor już wie, czemu połączenie padło.
      if (error instanceof VoicePeerError && error.stage === "answer" && error.cause === null) {
        return;
      }

      dispatch({
        type: "connect_failed",
        notice: buildInfoNotice(copy.notices.connectFailedTitle, copy.notices.connectFailedBody),
        retryable: true,
      });
    }
  }, [closePeer, copy, handleEvent, heartbeatNow, locale, sessionId]);

  const heartbeatEnabled = shouldHeartbeat(state);

  useEffect(() => {
    if (!heartbeatEnabled) {
      return;
    }

    const intervalId = setInterval(() => {
      void heartbeatNow();
    }, VOICE_HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [heartbeatEnabled, heartbeatNow]);

  const connected = isVoiceConnected(state.status);

  useEffect(() => {
    if (!connected) {
      return;
    }

    const intervalId = setInterval(() => {
      dispatch({ type: "idle_flush", nowMs: Date.now() });
    }, IDLE_FLUSH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [connected]);

  // Jedna automatyczna próba po zerwaniu; kolejne wymagają dotknięcia.
  const shouldAutoReconnect =
    state.status === "reconnecting" && state.reconnectAttempt === 1 && state.kind === "active";

  useEffect(() => {
    if (!shouldAutoReconnect || autoReconnectedRef.current) {
      return;
    }

    autoReconnectedRef.current = true;
    const timeoutId = setTimeout(() => {
      void enableMicrophone();
    }, AUTO_RECONNECT_DELAY_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [enableMicrophone, shouldAutoReconnect]);

  useEffect(() => {
    if (connected) {
      autoReconnectedRef.current = false;
    }
  }, [connected]);

  // Zamknięta karta: mikrofon gaśnie od razu; obserwator kończy sesję live po
  // utracie pulsu, a zapis dojedzie przy następnym otwarciu rozmowy.
  useEffect(() => {
    function handlePageHide() {
      closePeer();
    }

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      closePeer();
    };
  }, [closePeer]);

  const handleExpired = useCallback(() => {
    closePeer();
    dispatch({ type: "client_expired" });
    // Serwer przenosi wiersz w `expired` i zrzuca resztę bufora.
    void heartbeatNow();
  }, [closePeer, heartbeatNow]);

  const toggleMute = useCallback(() => {
    const nextMuted = !state.isMuted;
    peerRef.current?.setMicEnabled(!nextMuted);
    dispatch({ type: "mute_set", muted: nextMuted });
  }, [state.isMuted]);

  const reportAudioBlocked = useCallback(() => {
    dispatch({ type: "audio_blocked" });
  }, []);

  const reportAudioUnblocked = useCallback(() => {
    dispatch({ type: "audio_unblocked" });
  }, []);

  async function endSession() {
    if (!state.session || state.kind !== "active" || state.session.status !== "active" || state.isEnding) {
      return;
    }

    peerRef.current?.setMicEnabled(false);
    closePeer();
    await endTimedSession({ sessionId: state.session.id, locale }, dispatch);
    // Ostatnie wypowiedzi wracają z zrzutu po zakończeniu (okno 60 s).
    await heartbeatNow();
  }

  return {
    state,
    liveFragments: selectLiveFragments(state),
    remoteStream,
    enableMicrophone,
    reconnect: enableMicrophone,
    toggleMute,
    reportAudioBlocked,
    reportAudioUnblocked,
    handleExpired,
    endSession,
  };
}
