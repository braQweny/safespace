import type { SendSessionMessageSuccessResponse } from "./message-contract";
import { appendSuccessfulTurn, isTerminalSessionKind, type UiSessionMessage } from "./message-state";
import type { SessionNoticeState } from "./session-notice";
import type { SessionStartPageState, SessionView } from "./session-state";
import { toSessionStartPageStateKind, type SessionStartPageStateKind } from "./session-state-kind";

/**
 * Stan ekranu rozmowy pisanej — czysty reduktor bez Reacta (jak
 * `voice-session-state.ts`), żeby każde przejście tury, zakończenia i
 * wygaśnięcia dało się sprawdzić bez DOM-u. Transport (`sendTimedSessionMessage`,
 * `endTimedSession`) żyje w `components/hooks/timed-session-transport.ts`.
 */

/** Ten sam kształt co w rozmowie głosowej (`session-flow/session-notice.ts`). */
export type SafetyNoticeState = SessionNoticeState;

export interface TimedSessionUiState {
  kind: SessionStartPageStateKind;
  session: SessionView | null;
  messages: UiSessionMessage[];
  draft: string;
  isEnding: boolean;
  isMessagePending: boolean;
  /** Tura trwa dłużej niż `SLOW_RESPONSE_THRESHOLD_MS`; gaśnie razem z turą. */
  isResponseSlow: boolean;
  isClientExpired: boolean;
  isHardStopped: boolean;
  pendingUserText: string | null;
  /**
   * Słowa użytkownika, które nie doszły do serwera, zanim rozmowa się
   * skończyła: wiadomość odrzucona po wygaśnięciu albo szkic zastany przez
   * koniec czasu. Karta zamknięcia pokazuje je do skopiowania — nigdy po
   * zatrzymaniu bezpieczeństwa.
   */
  unsentText: string | null;
  notice: SafetyNoticeState | null;
}

export type TimedSessionAction =
  | { type: "draft_changed"; draft: string }
  | { type: "client_expired" }
  | { type: "end_requested" }
  | { type: "end_succeeded"; session: SessionView }
  | { type: "end_failed"; notice: SafetyNoticeState }
  | { type: "end_settled" }
  | { type: "message_requested"; text: string }
  | { type: "message_slow" }
  | { type: "turn_succeeded"; turn: SendSessionMessageSuccessResponse["messages"]; session: SessionView }
  | { type: "hard_stopped"; notice: SafetyNoticeState }
  | { type: "session_expired"; session: SessionView; notice: SafetyNoticeState }
  | { type: "message_failed"; draft: string; notice: SafetyNoticeState }
  | { type: "message_settled" };

export type TimedSessionDispatch = (action: TimedSessionAction) => void;

/**
 * Akcje, które emituje `endTimedSession`: podzbiór wspólny dla rozmowy pisanej
 * i głosowej, więc jeden przebieg zakończenia obsługuje oba reduktory.
 */
export type EndSessionAction = Extract<
  TimedSessionAction,
  { type: "end_requested" | "end_succeeded" | "end_failed" | "end_settled" | "session_expired" }
>;

export type EndSessionDispatch = (action: EndSessionAction) => void;

function nonEmpty(text: string) {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Czy pole pisania nadal stoi na ekranie. Gdy nie — nieudana wiadomość nie ma
 * dokąd wrócić i trafia do `unsentText` zamiast do szkicu.
 */
function isConversationOpen(state: TimedSessionUiState) {
  return !isTerminalSessionKind(state.kind) && !state.isClientExpired && !state.isHardStopped;
}

export function getInitialTimedSessionState(
  initialState: SessionStartPageState,
  initialDraft: string | null = null,
): TimedSessionUiState {
  return {
    kind: initialState.kind,
    session: initialState.session,
    messages: initialState.messages,
    // Prefill tylko dla trwającej rozmowy: zakończona nie ma już pola pisania.
    draft: initialState.kind === "active" && initialDraft ? initialDraft : "",
    isEnding: false,
    isMessagePending: false,
    isResponseSlow: false,
    isClientExpired: initialState.session?.remainingSeconds === 0,
    isHardStopped: initialState.kind === "interrupted",
    pendingUserText: null,
    unsentText: null,
    notice: null,
  };
}

export function timedSessionReducer(state: TimedSessionUiState, action: TimedSessionAction): TimedSessionUiState {
  switch (action.type) {
    case "draft_changed":
      return { ...state, draft: action.draft };
    case "client_expired":
      // Szkic zastany przez koniec czasu nie znika razem z polem pisania.
      return {
        ...state,
        kind: "expired",
        isClientExpired: true,
        draft: "",
        unsentText: nonEmpty(state.draft) ?? state.unsentText,
      };
    case "end_requested":
      return { ...state, isEnding: true, notice: null };
    case "end_succeeded":
      return {
        ...state,
        session: action.session,
        kind: "completed",
        draft: "",
        unsentText: nonEmpty(state.draft) ?? state.unsentText,
        isClientExpired: false,
        isHardStopped: false,
        notice: null,
      };
    case "end_failed":
      return { ...state, notice: action.notice };
    case "end_settled":
      return { ...state, isEnding: false };
    case "message_requested":
      return {
        ...state,
        isMessagePending: true,
        isResponseSlow: false,
        draft: "",
        pendingUserText: action.text,
        notice: null,
      };
    case "message_slow":
      return state.isMessagePending ? { ...state, isResponseSlow: true } : state;
    case "turn_succeeded": {
      // Odpowiedź, która dotarła po zakończeniu rozmowy (koniec kliknięty w
      // trakcie tury), dopisuje się do zapisu, ale nie otwiera rozmowy na nowo.
      if (isTerminalSessionKind(state.kind)) {
        return {
          ...state,
          messages: appendSuccessfulTurn(state.messages, action.turn),
          pendingUserText: null,
        };
      }

      return {
        ...state,
        messages: appendSuccessfulTurn(state.messages, action.turn),
        session: action.session,
        kind: toSessionStartPageStateKind(action.session.status),
        draft: "",
        pendingUserText: null,
        notice: null,
      };
    }
    case "hard_stopped":
      return {
        ...state,
        kind: "interrupted",
        isHardStopped: true,
        draft: "",
        pendingUserText: null,
        unsentText: null,
        notice: action.notice,
      };
    case "session_expired":
      return {
        ...state,
        kind: "expired",
        session: action.session,
        isClientExpired: true,
        pendingUserText: null,
        unsentText: state.pendingUserText ?? state.unsentText,
        notice: action.notice,
      };
    case "message_failed": {
      if (isConversationOpen(state)) {
        return { ...state, draft: action.draft, pendingUserText: null, notice: action.notice };
      }

      return {
        ...state,
        pendingUserText: null,
        unsentText: state.isHardStopped ? null : (nonEmpty(action.draft) ?? state.unsentText),
      };
    }
    case "message_settled":
      return { ...state, isMessagePending: false, isResponseSlow: false, pendingUserText: null };
  }
}

/**
 * Odpowiedź 401/403 w trakcie rozmowy to nie „spróbuj ponownie”: sesja
 * logowania wygasła albo konto zostało zablokowane, i żadna ponowna wysyłka
 * tego nie zmieni. Użytkownik trafia tam, gdzie coś może zrobić.
 */
export function getSessionAccessRedirectHref(code: string): string | null {
  if (code === "missing_auth") {
    return "/auth/signin";
  }

  if (code === "account_blocked") {
    return "/account/blocked";
  }

  return null;
}

export interface MessageRetryIdentity {
  sessionId: string;
  text: string;
  clientMessageId: string;
}

export function resolveMessageRetryIdentity(
  previous: MessageRetryIdentity | null,
  sessionId: string,
  text: string,
): MessageRetryIdentity {
  const trimmed = text.trim();
  return previous?.sessionId === sessionId && previous.text === trimmed
    ? previous
    : { sessionId, text: trimmed, clientMessageId: crypto.randomUUID() };
}
