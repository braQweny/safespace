import { useCallback, useReducer, useRef } from "react";
import { isRateLimitedApiResult, isTimedOutApiResult, requestApiJson } from "@/lib/api-client";
import type { SessionAiFailureCopy } from "@/lib/session-ai/types";
import type { CrisisResourceRegion, SessionSafetyCopy } from "@/lib/session-safety/types";
import type { Locale } from "@/lib/i18n/locale";
import { getSessionCopy } from "@/lib/session-copy";
import {
  isSendSessionMessageResponse,
  type SendSessionMessageSuccessResponse,
} from "@/lib/session-flow/message-contract";
import {
  appendSuccessfulTurn,
  isComposerAvailable,
  isTerminalSessionKind,
  type UiSessionMessage,
} from "@/lib/session-flow/message-state";
import { isCompleteSessionResponse } from "@/lib/session-flow/session-completion-contract";
import {
  toSessionStartPageStateKind,
  type SessionStartPageState,
  type SessionStartPageStateKind,
  type SessionView,
} from "@/lib/session-flow/session-state";

/**
 * Twardy limit na jedną turę. Model z włączonym rozumowaniem potrafi
 * odpowiadać po minucie, więc limit jest hojny — ale bez niego zawieszony
 * provider zostawiał ekran z wirującym wskaźnikiem aż do odświeżenia strony.
 */
export const SESSION_MESSAGE_TIMEOUT_MS = 80_000;

/**
 * Po tylu milisekundach czekania wskaźnik „myśli” dostaje drugą linijkę.
 * Zwykła odpowiedź przychodzi szybciej; cisza dłuższa niż to zaczyna wyglądać
 * jak awaria, a jedno zdanie mówi, że to jeszcze nie ona.
 */
export const SLOW_RESPONSE_THRESHOLD_MS = 12_000;

export interface SafetyNoticeState {
  variant: "hard_stop" | "retry" | "info";
  copy: SessionSafetyCopy | SessionAiFailureCopy;
  crisisResources?: readonly CrisisResourceRegion[];
}

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

function buildGenericNotice(title: string, body: string): SafetyNoticeState {
  return {
    variant: "info",
    copy: {
      title,
      body,
      nextSteps: [],
    },
  };
}

function buildExpiredNotice(locale: Locale) {
  const { turn } = getSessionCopy(locale);

  return buildGenericNotice(turn.expiredTitle, turn.expiredBody);
}

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

export interface TimedSessionTransport {
  request: typeof requestApiJson;
  navigate: (href: string) => void;
}

const defaultTransport: TimedSessionTransport = {
  request: requestApiJson,
  navigate: (href) => {
    window.location.assign(href);
  },
};

/**
 * Pełna tura po stronie klienta, bez Reacta: od `message_requested` do
 * `message_settled`. Wyciągnięta z hooka, żeby dało się ją przetestować z
 * fałszywymi zegarami i bez DOM-u.
 */
export async function sendTimedSessionMessage(
  input: { sessionId: string; text: string; clientMessageId?: string; locale: Locale },
  dispatch: TimedSessionDispatch,
  transport: TimedSessionTransport = defaultTransport,
) {
  const text = input.text.trim();
  const { turn } = getSessionCopy(input.locale);

  if (!text) {
    return;
  }

  dispatch({ type: "message_requested", text });

  const slowTimeoutId = setTimeout(() => {
    dispatch({ type: "message_slow" });
  }, SLOW_RESPONSE_THRESHOLD_MS);

  try {
    const result = await transport.request("/api/session/message", {
      method: "POST",
      body: JSON.stringify({
        sessionId: input.sessionId,
        message: text,
        clientMessageId: input.clientMessageId ?? crypto.randomUUID(),
      }),
      timeoutMs: SESSION_MESSAGE_TIMEOUT_MS,
    });

    if (isTimedOutApiResult(result)) {
      dispatch({
        type: "message_failed",
        draft: text,
        notice: buildGenericNotice(turn.timeoutTitle, turn.timeoutBody),
      });
      return;
    }

    if (result.kind === "network_error") {
      dispatch({
        type: "message_failed",
        draft: text,
        notice: buildGenericNotice(turn.sendFailedTitle, turn.connectionUnavailableBody),
      });
      return;
    }

    if (isRateLimitedApiResult(result)) {
      dispatch({
        type: "message_failed",
        draft: text,
        notice: buildGenericNotice(turn.sendRateLimitedTitle, turn.sendRateLimitedBody),
      });
      return;
    }

    const body = result.body;

    if (!isSendSessionMessageResponse(body)) {
      dispatch({
        type: "message_failed",
        draft: text,
        notice: buildGenericNotice(turn.sendFailedTitle, turn.sendRetryBody),
      });
      return;
    }

    if (body.ok) {
      dispatch({ type: "turn_succeeded", turn: body.messages, session: body.session });
      return true;
    }

    if (body.type === "message_in_progress" || body.type === "message_request_conflict") {
      dispatch({
        type: "message_failed",
        draft: text,
        notice: buildGenericNotice(
          body.type === "message_in_progress" ? turn.messageInProgressTitle : turn.messageConflictTitle,
          turn.messageRetryPreservedBody,
        ),
      });
      return;
    }

    if (body.type === "missing_or_unauthorized") {
      const redirectHref = getSessionAccessRedirectHref(body.code);

      if (redirectHref) {
        transport.navigate(redirectHref);
        return;
      }
    }

    if (body.type === "hard_stop") {
      dispatch({
        type: "hard_stopped",
        notice: {
          variant: "hard_stop",
          copy: body.copy,
          crisisResources: body.crisisResources,
        },
      });
      return;
    }

    if (body.type === "expired") {
      dispatch({ type: "session_expired", session: body.session, notice: buildExpiredNotice(input.locale) });
      return;
    }

    if (body.type === "ai_retry") {
      dispatch({
        type: "message_failed",
        draft: text,
        notice: {
          variant: "retry",
          copy: body.copy,
        },
      });
      return;
    }

    dispatch({
      type: "message_failed",
      draft: text,
      notice: buildGenericNotice(turn.sendFailedTitle, turn.sendRetryBody),
    });
  } finally {
    clearTimeout(slowTimeoutId);
    dispatch({ type: "message_settled" });
  }
}

export async function endTimedSession(
  input: { sessionId: string; locale: Locale },
  dispatch: TimedSessionDispatch,
  transport: TimedSessionTransport = defaultTransport,
) {
  const { turn } = getSessionCopy(input.locale);
  dispatch({ type: "end_requested" });

  try {
    const result = await transport.request("/api/session/end", {
      method: "POST",
      body: JSON.stringify({
        sessionId: input.sessionId,
      }),
    });

    if (result.kind === "network_error") {
      dispatch({
        type: "end_failed",
        notice: buildGenericNotice(turn.endFailedTitle, turn.connectionUnavailableBody),
      });
      return;
    }

    if (isRateLimitedApiResult(result)) {
      dispatch({
        type: "end_failed",
        notice: buildGenericNotice(turn.endRateLimitedTitle, turn.endRateLimitedBody),
      });
      return;
    }

    const body = result.body;

    if (!isCompleteSessionResponse(body)) {
      dispatch({
        type: "end_failed",
        notice: buildGenericNotice(turn.endFailedTitle, turn.endRetryBody),
      });
      return;
    }

    if (body.ok) {
      dispatch({ type: "end_succeeded", session: body.session });
      return;
    }

    if (body.type === "expired") {
      dispatch({ type: "session_expired", session: body.session, notice: buildExpiredNotice(input.locale) });
      return;
    }

    const redirectHref = getSessionAccessRedirectHref(body.code);

    if (redirectHref) {
      transport.navigate(redirectHref);
      return;
    }

    dispatch({
      type: "end_failed",
      notice: buildGenericNotice(
        body.code === "session_not_active" ? turn.sessionNotActiveTitle : turn.endFailedTitle,
        body.code === "session_not_active" ? turn.sessionNotActiveBody : turn.endRetryBody,
      ),
    });
  } finally {
    dispatch({ type: "end_settled" });
  }
}

export interface UseTimedSessionOptions {
  locale: Locale;
  /** Zdanie z karty osoby wstawione do pola przed pierwszą wiadomością. */
  initialDraft?: string | null;
}

export function useTimedSession(initialState: SessionStartPageState, options: UseTimedSessionOptions) {
  const { locale } = options;
  const [state, dispatch] = useReducer(
    timedSessionReducer,
    { initialState, initialDraft: options.initialDraft ?? null },
    (init) => getInitialTimedSessionState(init.initialState, init.initialDraft),
  );
  const retryIdentity = useRef<MessageRetryIdentity | null>(null);
  const sending = useRef(false);

  // Tura w locie nie zamyka pola — jest wtedy tylko do odczytu (patrz
  // `SessionComposer`), więc `isMessagePending` nie jest częścią dostępności.
  const composerAvailable =
    !state.isEnding &&
    isComposerAvailable({
      session: state.session,
      isHardStopped: state.isHardStopped,
      isClientExpired: state.isClientExpired,
    });

  const handleExpired = useCallback(() => {
    dispatch({ type: "client_expired" });
  }, []);

  const setDraft = useCallback((draft: string) => {
    dispatch({ type: "draft_changed", draft });
  }, []);

  async function sendMessage() {
    const trimmedDraft = state.draft.trim();

    if (!state.session || !trimmedDraft || !composerAvailable || state.isMessagePending || sending.current) {
      return;
    }

    // Keep the id through a network failure, but never reuse it for edited text.
    // The ref also closes the double-submit gap before React's next render.
    retryIdentity.current = resolveMessageRetryIdentity(retryIdentity.current, state.session.id, trimmedDraft);
    sending.current = true;
    try {
      if (await sendTimedSessionMessage({ ...retryIdentity.current, locale }, dispatch)) retryIdentity.current = null;
    } finally {
      sending.current = false;
    }
  }

  async function endSession() {
    // Tura w locie nie blokuje zakończenia: serwer sprawdza status sesji,
    // zanim zapisze odpowiedź, więc użytkownik nie musi czekać na model,
    // żeby wyjść z rozmowy.
    if (!state.session || state.kind !== "active" || state.session.status !== "active" || state.isEnding) {
      return;
    }

    await endTimedSession({ sessionId: state.session.id, locale }, dispatch);
  }

  return {
    state,
    composerAvailable,
    handleExpired,
    setDraft,
    sendMessage,
    endSession,
  };
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
