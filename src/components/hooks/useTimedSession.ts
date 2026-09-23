import { useCallback, useReducer, useRef } from "react";
import type { Locale } from "@/lib/i18n/locale";
import { isComposerAvailable } from "@/lib/session-flow/message-state";
import type { SessionStartPageState } from "@/lib/session-flow/session-state";
import {
  getInitialTimedSessionState,
  resolveMessageRetryIdentity,
  timedSessionReducer,
  type MessageRetryIdentity,
} from "@/lib/session-flow/timed-session-state";
import { endTimedSession, sendTimedSessionMessage } from "./timed-session-transport";

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
