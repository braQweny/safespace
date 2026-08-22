import { useCallback, useMemo, useReducer } from "react";
import { isRateLimitedApiResult, requestApiJson } from "@/lib/api-client";
import type { SessionAiFailureCopy } from "@/lib/session-ai/types";
import type { CrisisResourceRegion, SessionSafetyCopy } from "@/lib/session-safety/types";
import {
  isSendSessionMessageResponse,
  type SendSessionMessageSuccessResponse,
} from "@/lib/session-flow/message-contract";
import { appendSuccessfulTurn, isComposerAvailable, type UiSessionMessage } from "@/lib/session-flow/message-state";
import { isCompleteSessionResponse } from "@/lib/session-flow/session-completion-contract";
import {
  toSessionStartPageStateKind,
  type SessionStartPageState,
  type SessionStartPageStateKind,
  type SessionView,
} from "@/lib/session-flow/session-state";

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
  isClientExpired: boolean;
  isHardStopped: boolean;
  pendingUserText: string | null;
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
  | { type: "turn_succeeded"; turn: SendSessionMessageSuccessResponse["messages"]; session: SessionView }
  | { type: "hard_stopped"; notice: SafetyNoticeState }
  | { type: "session_expired"; session: SessionView; notice: SafetyNoticeState }
  | { type: "message_failed"; draft: string; notice: SafetyNoticeState }
  | { type: "message_settled" };

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

export function getInitialTimedSessionState(initialState: SessionStartPageState): TimedSessionUiState {
  return {
    kind: initialState.kind,
    session: initialState.session,
    messages: initialState.messages,
    draft: "",
    isEnding: false,
    isMessagePending: false,
    isClientExpired: initialState.session?.remainingSeconds === 0,
    isHardStopped: initialState.kind === "interrupted",
    pendingUserText: null,
    notice: null,
  };
}

export function timedSessionReducer(state: TimedSessionUiState, action: TimedSessionAction): TimedSessionUiState {
  switch (action.type) {
    case "draft_changed":
      return { ...state, draft: action.draft };
    case "client_expired":
      return { ...state, kind: "expired", isClientExpired: true };
    case "end_requested":
      return { ...state, isEnding: true, notice: null };
    case "end_succeeded":
      return {
        ...state,
        session: action.session,
        kind: "completed",
        draft: "",
        isClientExpired: false,
        isHardStopped: false,
        notice: null,
      };
    case "end_failed":
      return { ...state, notice: action.notice };
    case "end_settled":
      return { ...state, isEnding: false };
    case "message_requested":
      return { ...state, isMessagePending: true, draft: "", pendingUserText: action.text, notice: null };
    case "turn_succeeded":
      return {
        ...state,
        messages: appendSuccessfulTurn(state.messages, action.turn),
        session: action.session,
        kind: toSessionStartPageStateKind(action.session.status),
        draft: "",
        pendingUserText: null,
        notice: null,
      };
    case "hard_stopped":
      return { ...state, kind: "interrupted", isHardStopped: true, pendingUserText: null, notice: action.notice };
    case "session_expired":
      return {
        ...state,
        kind: "expired",
        session: action.session,
        isClientExpired: true,
        pendingUserText: null,
        notice: action.notice,
      };
    case "message_failed":
      return { ...state, draft: action.draft, pendingUserText: null, notice: action.notice };
    case "message_settled":
      return { ...state, isMessagePending: false, pendingUserText: null };
  }
}

export function useTimedSession(initialState: SessionStartPageState) {
  const [state, dispatch] = useReducer(timedSessionReducer, initialState, getInitialTimedSessionState);

  const composerAvailable = useMemo(
    () =>
      !state.isEnding &&
      isComposerAvailable({
        session: state.session,
        isPending: state.isMessagePending,
        isHardStopped: state.isHardStopped,
        isClientExpired: state.isClientExpired,
      }),
    [state.isClientExpired, state.isEnding, state.isHardStopped, state.isMessagePending, state.session],
  );

  const handleExpired = useCallback(() => {
    dispatch({ type: "client_expired" });
  }, []);

  const setDraft = useCallback((draft: string) => {
    dispatch({ type: "draft_changed", draft });
  }, []);

  async function sendMessage() {
    const trimmedDraft = state.draft.trim();

    if (!state.session || !trimmedDraft || !composerAvailable) {
      return;
    }

    dispatch({ type: "message_requested", text: trimmedDraft });

    try {
      const result = await requestApiJson("/api/session/message", {
        method: "POST",
        body: JSON.stringify({
          sessionId: state.session.id,
          message: trimmedDraft,
        }),
      });

      if (result.kind === "network_error") {
        dispatch({
          type: "message_failed",
          draft: trimmedDraft,
          notice: buildGenericNotice(
            "Nie udało się wysłać wiadomości",
            "Połączenie z serwerem jest chwilowo niedostępne.",
          ),
        });
        return;
      }

      if (isRateLimitedApiResult(result)) {
        dispatch({
          type: "message_failed",
          draft: trimmedDraft,
          notice: buildGenericNotice(
            "Zwolnij na chwilę",
            "Wysyłasz wiadomości zbyt szybko. Odczekaj około minuty i spróbuj ponownie — treść wiadomości została zachowana.",
          ),
        });
        return;
      }

      const body = result.body;

      if (!isSendSessionMessageResponse(body)) {
        dispatch({
          type: "message_failed",
          draft: trimmedDraft,
          notice: buildGenericNotice("Nie udało się wysłać wiadomości", "Spróbuj ponownie, jeśli sesja nadal trwa."),
        });
        return;
      }

      if (body.ok) {
        dispatch({ type: "turn_succeeded", turn: body.messages, session: body.session });
        return;
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
        dispatch({
          type: "session_expired",
          session: body.session,
          notice: buildGenericNotice("Limit czasu został osiągnięty", "Nowe wiadomości są już blokowane w tej sesji."),
        });
        return;
      }

      if (body.type === "ai_retry") {
        dispatch({
          type: "message_failed",
          draft: trimmedDraft,
          notice: {
            variant: "retry",
            copy: body.copy,
          },
        });
        return;
      }

      dispatch({
        type: "message_failed",
        draft: trimmedDraft,
        notice: buildGenericNotice("Nie udało się wysłać wiadomości", "Spróbuj ponownie, jeśli sesja nadal trwa."),
      });
    } finally {
      dispatch({ type: "message_settled" });
    }
  }

  async function endSession() {
    if (
      !state.session ||
      state.kind !== "active" ||
      state.session.status !== "active" ||
      state.isEnding ||
      state.isMessagePending
    ) {
      return;
    }

    dispatch({ type: "end_requested" });

    try {
      const result = await requestApiJson("/api/session/end", {
        method: "POST",
        body: JSON.stringify({
          sessionId: state.session.id,
        }),
      });

      if (result.kind === "network_error") {
        dispatch({
          type: "end_failed",
          notice: buildGenericNotice(
            "Nie udało się zakończyć sesji",
            "Połączenie z serwerem jest chwilowo niedostępne.",
          ),
        });
        return;
      }

      if (isRateLimitedApiResult(result)) {
        dispatch({
          type: "end_failed",
          notice: buildGenericNotice(
            "Za dużo prób w krótkim czasie",
            "Odczekaj około minuty i spróbuj ponownie zakończyć sesję.",
          ),
        });
        return;
      }

      const body = result.body;

      if (!isCompleteSessionResponse(body)) {
        dispatch({
          type: "end_failed",
          notice: buildGenericNotice("Nie udało się zakończyć sesji", "Spróbuj ponownie za chwilę."),
        });
        return;
      }

      if (body.ok) {
        dispatch({ type: "end_succeeded", session: body.session });
        return;
      }

      if (body.type === "expired") {
        dispatch({
          type: "session_expired",
          session: body.session,
          notice: buildGenericNotice("Limit czasu został osiągnięty", "Nowe wiadomości są już blokowane w tej sesji."),
        });
        return;
      }

      dispatch({
        type: "end_failed",
        notice: buildGenericNotice(
          body.code === "session_not_active" ? "Sesja nie jest już aktywna" : "Nie udało się zakończyć sesji",
          body.code === "session_not_active"
            ? "Odśwież widok historii, żeby zobaczyć aktualny status rozmowy."
            : "Spróbuj ponownie za chwilę.",
        ),
      });
    } finally {
      dispatch({ type: "end_settled" });
    }
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
