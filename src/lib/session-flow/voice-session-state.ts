import type { VoiceCloseReason } from "@/lib/voice/observer-state";
import type { SessionMessageViewModel } from "./message-contract";
import { isTerminalSessionKind, type UiSessionMessage } from "./message-state";
import type { SessionNoticeState } from "./session-notice";
import type { SessionStartPageState, SessionView } from "./session-state";
import { toSessionStartPageStateKind, type SessionStartPageStateKind } from "./session-state-kind";
import { isVoiceAwaitingFirstConnection, type VoiceHeartbeatSuccessResponse } from "./voice-contract";
import {
  createVoiceTranscriptState,
  flushAllVoiceUtterances,
  flushIdleVoiceUtterances,
  pushVoiceFragment,
  type VoiceSpeaker,
  type VoiceTranscriptFragment,
  type VoiceTranscriptState,
  type VoiceUtterance,
} from "./voice-transcript";

/**
 * Stan ekranu rozmowy głosowej — czysty reduktor bez Reacta, żeby każde
 * przejście dało się sprawdzić z fałszywym zegarem.
 *
 * Dwie osie: `kind` to stan rozmowy w bazie (aktywna, zakończona, wygasła,
 * przerwana — jak w rozmowie pisanej), `status` to stan połączenia audio.
 * Podgląd transkryptu (`transcript`, `pendingUtterances`) jest tylko do
 * wyświetlania: prawdziwy zapis przychodzi z serwera w odpowiedzi heartbeatu
 * (`persistedMessages`), a przeglądarka niczego nie dostarcza do zapisu.
 */
export type VoiceConnectionStatus =
  | "idle"
  | "unsupported"
  | "unavailable"
  | "requesting_mic"
  | "connecting"
  | "live"
  | "paused_safety"
  | "reconnecting"
  | "audio_blocked"
  /** `connect` odmówił z powodu puli (`refusal`): ponowna próba nic nie zmieni. */
  | "refused"
  | "ended"
  | "hard_stop";

/** Odmowa `connect` z powodu puli minut — ta sama bramka, co przy starcie rozmowy głosowej. */
export type VoiceConnectRefusal = "voice_minutes_exhausted" | "voice_trial_used";

export interface VoiceLiveFragment {
  id: string;
  role: VoiceSpeaker;
  text: string;
}

export interface VoiceSessionUiState {
  kind: SessionStartPageStateKind;
  session: SessionView | null;
  status: VoiceConnectionStatus;
  /** Epoka bieżącego połączenia z odpowiedzi `connect`; 0 przed pierwszym połączeniem. */
  epoch: number;
  isMuted: boolean;
  isAvatarSpeaking: boolean;
  transcript: VoiceTranscriptState;
  /** Wypowiedzi zamknięte lokalnie, na które zapis z serwera jeszcze nie dotarł. */
  pendingUtterances: VoiceUtterance[];
  persistedMessages: UiSessionMessage[];
  notice: SessionNoticeState | null;
  isEnding: boolean;
  reconnectAttempt: number;
  closeReason: VoiceCloseReason | null;
  isClientExpired: boolean;
  /** Dlaczego `connect` odmówił (wyczerpana pula, zużyta próba); ekran mówi, co dalej. */
  refusal: VoiceConnectRefusal | null;
}

/** Powiadomienia budowane z copy przez hook; reduktor nie zna języka. */
export interface VoiceHeartbeatNotices {
  expired: SessionNoticeState;
  disabled: SessionNoticeState;
  superseded: SessionNoticeState;
  connectionLost: SessionNoticeState;
}

export type VoiceSessionAction =
  | { type: "unsupported" }
  | { type: "mic_requested" }
  | { type: "mic_failed"; notice: SessionNoticeState }
  | { type: "connecting" }
  | { type: "connected"; epoch: number; session: SessionView }
  | { type: "connect_failed"; notice: SessionNoticeState | null; retryable: boolean }
  /** Pula nie pozwala połączyć: bez automatycznego wznowienia i bez przycisku ponownej próby. */
  | { type: "connect_refused"; refusal: VoiceConnectRefusal }
  | { type: "audio_blocked" }
  | { type: "audio_unblocked" }
  | { type: "fragment"; fragment: VoiceTranscriptFragment; nowMs: number }
  | { type: "idle_flush"; nowMs: number }
  | { type: "mute_set"; muted: boolean }
  | { type: "heartbeat"; response: VoiceHeartbeatSuccessResponse; notices: VoiceHeartbeatNotices }
  | { type: "heartbeat_failed"; notice: SessionNoticeState | null }
  | { type: "connection_lost"; notice: SessionNoticeState | null }
  | { type: "client_expired" }
  | { type: "end_requested" }
  | { type: "end_succeeded"; session: SessionView }
  | { type: "end_failed"; notice: SessionNoticeState }
  | { type: "end_settled" }
  | { type: "session_expired"; session: SessionView; notice: SessionNoticeState }
  | { type: "hard_stopped"; notice: SessionNoticeState }
  /** Serwer nie zna już tej rozmowy jako aktywnej (zakończona w innej karcie, usunięta). */
  | { type: "session_unavailable"; notice: SessionNoticeState };

export type VoiceSessionDispatch = (action: VoiceSessionAction) => void;

const CONNECTED_STATUSES: readonly VoiceConnectionStatus[] = ["live", "paused_safety", "audio_blocked"];

export function isVoiceConnected(status: VoiceConnectionStatus) {
  return CONNECTED_STATUSES.includes(status);
}

/**
 * Trwająca rozmowa głosowa bez ani jednego połączenia audio: zegar jeszcze nie
 * ruszył (baza przesunie start i termin przy pierwszym połączeniu), więc
 * nagłówek pokazuje pełną długość zamiast odliczania.
 */
export function isAwaitingFirstVoiceConnection(state: Pick<VoiceSessionUiState, "kind" | "session">) {
  return state.kind === "active" && isVoiceAwaitingFirstConnection(state.session);
}

/**
 * Rozmowa głosowa zakończona (termin, „Zakończ”) bez połączenia audio: ani
 * próba, ani minuty puli nie zostały zużyte, a ekran mówi to zamiast „czas
 * minął”. Kryzys wymaga połączenia, więc `interrupted` tu nie trafia.
 */
export function hasVoiceEndedUnconnected(state: Pick<VoiceSessionUiState, "kind" | "session">) {
  return (state.kind === "expired" || state.kind === "completed") && isVoiceAwaitingFirstConnection(state.session);
}

/**
 * Powiadomienie „czas rozmowy minął” nie pasuje do rozmowy, która się nie
 * zaczęła: wtedy mówi karta zamknięcia (nic nie przepadło), bez drugiego
 * komunikatu nad nią.
 */
function expiredNotice(session: SessionView | null, notice: SessionNoticeState | null) {
  return isVoiceAwaitingFirstConnection(session) ? null : notice;
}

/** Heartbeat biegnie, dopóki po naszej stronie połączenie ma sens (także podczas ponownego łączenia). */
export function shouldHeartbeat(state: VoiceSessionUiState) {
  return state.kind === "active" && (isVoiceConnected(state.status) || state.status === "reconnecting");
}

export interface InitialVoiceSessionOptions {
  /** Flaga i dostawca po stronie serwera; bez nich przycisk mikrofonu nie ma czego uruchomić. */
  voiceAvailable: boolean;
}

export function getInitialVoiceSessionState(
  initialState: SessionStartPageState,
  options: InitialVoiceSessionOptions,
): VoiceSessionUiState {
  const status: VoiceConnectionStatus =
    initialState.kind === "active"
      ? options.voiceAvailable
        ? "idle"
        : "unavailable"
      : initialState.kind === "interrupted"
        ? "hard_stop"
        : "ended";

  return {
    kind: initialState.kind,
    session: initialState.session,
    status,
    epoch: 0,
    isMuted: false,
    isAvatarSpeaking: false,
    transcript: createVoiceTranscriptState(),
    pendingUtterances: [],
    persistedMessages: initialState.messages,
    notice: null,
    isEnding: false,
    reconnectAttempt: 0,
    closeReason: null,
    isClientExpired: initialState.session?.remainingSeconds === 0,
    refusal: null,
  };
}

function mergePersistedMessages(
  messages: readonly UiSessionMessage[],
  incoming: readonly SessionMessageViewModel[],
): UiSessionMessage[] {
  if (incoming.length === 0) {
    return [...messages];
  }

  const byId = new Map(messages.map((message) => [message.id, message]));

  for (const message of incoming) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort((left, right) => left.sequenceIndex - right.sequenceIndex);
}

/**
 * Zapisane wiersze zastępują podgląd: dopasowanie po roli i treści, a gdy
 * serwer pogrupował inaczej — najstarsza lokalna wypowiedź tej roli. Podgląd
 * nigdy nie dubluje zapisu, a co najwyżej znika chwilę za wcześnie.
 */
function settlePendingUtterances(
  pending: readonly VoiceUtterance[],
  incoming: readonly SessionMessageViewModel[],
): VoiceUtterance[] {
  let remaining = [...pending];

  for (const message of incoming) {
    const exactIndex = remaining.findIndex(
      (utterance) => utterance.speaker === message.role && utterance.text === message.content.trim(),
    );
    const index = exactIndex >= 0 ? exactIndex : remaining.findIndex((utterance) => utterance.speaker === message.role);

    if (index >= 0) {
      remaining = [...remaining.slice(0, index), ...remaining.slice(index + 1)];
    }
  }

  return remaining;
}

function endedState(state: VoiceSessionUiState, overrides: Partial<VoiceSessionUiState>): VoiceSessionUiState {
  const flushed = flushAllVoiceUtterances(state.transcript);

  return {
    ...state,
    transcript: flushed.state,
    pendingUtterances: [...state.pendingUtterances, ...flushed.closed],
    isAvatarSpeaking: false,
    isMuted: false,
    ...overrides,
  };
}

/**
 * Odmowa puli (`refused`) jest ostateczna dla tego ekranu: puls wysłany przed
 * odmową (po zerwaniu połączenia albo z interwału w trakcie wznawiania) może
 * wrócić po niej, a jego „połączenie do wznowienia” wznowiłoby puls i
 * zapętliło tę samą odmowę. Zapisane wiersze i tak wchodzą, a prawdziwy koniec
 * z serwera (zakończona, wygasła, przerwana, inna karta) wygrywa.
 */
function applyHeartbeat(
  state: VoiceSessionUiState,
  response: VoiceHeartbeatSuccessResponse,
  notices: VoiceHeartbeatNotices,
): VoiceSessionUiState {
  const next = resolveHeartbeatState(state, response, notices);

  if (state.status === "refused" && next.status === "reconnecting") {
    return { ...next, status: "refused", notice: state.notice, reconnectAttempt: state.reconnectAttempt };
  }

  return next;
}

function resolveHeartbeatState(
  state: VoiceSessionUiState,
  response: VoiceHeartbeatSuccessResponse,
  notices: VoiceHeartbeatNotices,
): VoiceSessionUiState {
  const persistedMessages = mergePersistedMessages(state.persistedMessages, response.messages);
  const pendingUtterances = settlePendingUtterances(state.pendingUtterances, response.messages);
  const kind = isTerminalSessionKind(state.kind) ? state.kind : toSessionStartPageStateKind(response.session.status);
  const base: VoiceSessionUiState = {
    ...state,
    persistedMessages,
    pendingUtterances,
    session: response.session,
    kind,
    closeReason: response.closeReason,
  };

  if (response.live) {
    return base;
  }

  // Rozmowa zakończona po naszej stronie: który powód, taki ekran.
  switch (response.closeReason) {
    case "interrupted":
      return endedState(base, {
        status: "hard_stop",
        kind: "interrupted",
        notice: response.notice?.variant === "hard_stop" ? response.notice : state.notice,
      });
    case "time_limit_reached":
      return endedState(base, {
        status: "ended",
        kind: "expired",
        isClientExpired: true,
        notice: expiredNotice(base.session, notices.expired),
      });
    case "voice_disabled":
      return endedState(base, { status: "ended", kind: "completed", notice: notices.disabled });
    case "reconnected":
      return endedState(base, { status: "ended", notice: notices.superseded });
    case "safety_unavailable":
      return endedState(base, {
        status: isTerminalSessionKind(kind) ? "ended" : "reconnecting",
        notice: response.notice?.variant === "retry" ? response.notice : notices.connectionLost,
      });
    case "completed":
    case "deleted":
      return endedState(base, { status: isTerminalSessionKind(kind) ? "ended" : "reconnecting", notice: state.notice });
    default:
      // `heartbeat_lost`, `provider_closed`, brak powodu: połączenie do wznowienia.
      return isTerminalSessionKind(kind)
        ? endedState(base, { status: "ended" })
        : endedState(base, {
            status: "reconnecting",
            notice: state.status === "reconnecting" ? state.notice : notices.connectionLost,
          });
  }
}

export function voiceSessionReducer(state: VoiceSessionUiState, action: VoiceSessionAction): VoiceSessionUiState {
  switch (action.type) {
    case "unsupported":
      return state.kind === "active" ? { ...state, status: "unsupported" } : state;
    case "mic_requested":
      return { ...state, status: "requesting_mic", notice: null };
    case "mic_failed":
      return { ...state, status: state.reconnectAttempt > 0 ? "reconnecting" : "idle", notice: action.notice };
    case "connecting":
      return { ...state, status: "connecting" };
    case "connected":
      return {
        ...state,
        status: "live",
        epoch: action.epoch,
        session: action.session,
        kind: toSessionStartPageStateKind(action.session.status),
        isMuted: false,
        isAvatarSpeaking: false,
        transcript: createVoiceTranscriptState(),
        reconnectAttempt: 0,
        closeReason: null,
        refusal: null,
        notice: null,
      };
    case "connect_failed":
      return {
        ...state,
        status: action.retryable ? "reconnecting" : "idle",
        reconnectAttempt: action.retryable ? state.reconnectAttempt + 1 : state.reconnectAttempt,
        notice: action.notice ?? state.notice,
      };
    case "connect_refused":
      // Wiersz w bazie zostaje aktywny do terminu; zostaje zakończyć rozmowę albo wrócić do panelu.
      return endedState(state, { status: "refused", refusal: action.refusal, reconnectAttempt: 0, notice: null });
    case "audio_blocked":
      return state.status === "live" ? { ...state, status: "audio_blocked" } : state;
    case "audio_unblocked":
      return state.status === "audio_blocked" ? { ...state, status: "live" } : state;
    case "fragment": {
      const pushed = pushVoiceFragment(state.transcript, action.fragment, action.nowMs);

      return {
        ...state,
        transcript: pushed.state,
        pendingUtterances: [...state.pendingUtterances, ...pushed.closed],
        isAvatarSpeaking: action.fragment.speaker === "assistant" ? true : state.isAvatarSpeaking,
      };
    }
    case "idle_flush": {
      const flushed = flushIdleVoiceUtterances(state.transcript, action.nowMs);

      if (flushed.closed.length === 0) {
        return state;
      }

      return {
        ...state,
        transcript: flushed.state,
        pendingUtterances: [...state.pendingUtterances, ...flushed.closed],
        isAvatarSpeaking: flushed.closed.some((utterance) => utterance.speaker === "assistant")
          ? false
          : state.isAvatarSpeaking,
      };
    }
    case "mute_set":
      return isVoiceConnected(state.status) ? { ...state, isMuted: action.muted } : state;
    case "heartbeat":
      return applyHeartbeat(state, action.response, action.notices);
    case "heartbeat_failed":
      return action.notice && shouldHeartbeat(state) ? { ...state, notice: action.notice } : state;
    case "connection_lost":
      if (!isVoiceConnected(state.status)) {
        return state;
      }

      return endedState(state, {
        status: "reconnecting",
        reconnectAttempt: state.reconnectAttempt + 1,
        notice: action.notice ?? state.notice,
      });
    case "client_expired":
      return endedState(state, {
        status: "ended",
        kind: "expired",
        isClientExpired: true,
        notice: expiredNotice(state.session, state.notice),
      });
    case "end_requested":
      return { ...state, isEnding: true, notice: null };
    case "end_succeeded":
      return endedState(state, {
        status: "ended",
        kind: "completed",
        session: action.session,
        isClientExpired: false,
        notice: null,
      });
    case "end_failed":
      return { ...state, notice: action.notice };
    case "end_settled":
      return { ...state, isEnding: false };
    case "session_expired":
      return endedState(state, {
        status: "ended",
        kind: "expired",
        session: action.session,
        isClientExpired: true,
        notice: expiredNotice(action.session, action.notice),
      });
    case "hard_stopped":
      return endedState(state, { status: "hard_stop", kind: "interrupted", notice: action.notice });
    case "session_unavailable":
      return isTerminalSessionKind(state.kind)
        ? state
        : endedState(state, { status: "ended", kind: "completed", notice: action.notice });
  }
}

function fragmentId(utterance: Pick<VoiceUtterance, "epoch" | "speaker" | "startMs">) {
  return `live-${utterance.epoch}-${utterance.speaker}-${utterance.startMs}`;
}

/** Podgląd do wyświetlenia pod zapisem: zamknięte, jeszcze niezapisane wypowiedzi, potem otwarte. */
export function selectLiveFragments(state: VoiceSessionUiState): VoiceLiveFragment[] {
  const open = (["user", "assistant"] as const)
    .map((speaker) => state.transcript.open[speaker])
    .filter((utterance): utterance is NonNullable<typeof utterance> => utterance !== null)
    .map((utterance) => ({ ...utterance, text: utterance.text.trim() }))
    .filter((utterance) => utterance.text.length > 0);

  return [...state.pendingUtterances, ...open]
    .sort((left, right) => left.epoch - right.epoch || left.startMs - right.startMs)
    .map((utterance) => ({ id: fragmentId(utterance), role: utterance.speaker, text: utterance.text }));
}
