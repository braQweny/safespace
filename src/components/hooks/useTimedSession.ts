import { useCallback, useMemo, useReducer } from "react";
import { isRateLimitedApiResult, requestApiJson } from "@/lib/api-client";
import type { SessionAiFailureCopy } from "@/lib/session-ai/types";
import type { CrisisResourceRegion, SessionSafetyCopy } from "@/lib/session-safety/types";
import {
  isSendSessionMessageResponse,
  type SendSessionMessageSuccessResponse,
} from "@/lib/session-flow/message-contract";
import { appendSuccessfulTurn, isComposerAvailable, type UiSessionMessage } from "@/lib/session-flow/message-state";
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
  isStarting: boolean;
  isMessagePending: boolean;
  isClientExpired: boolean;
  isHardStopped: boolean;
  notice: SafetyNoticeState | null;
}

export type TimedSessionAction =
  | { type: "draft_changed"; draft: string }
  | { type: "client_expired" }
  | { type: "start_requested" }
  | { type: "start_succeeded"; session: SessionView }
  | { type: "start_failed"; kind?: SessionStartPageStateKind; notice: SafetyNoticeState }
  | { type: "start_settled" }
  | { type: "message_requested" }
  | { type: "turn_succeeded"; turn: SendSessionMessageSuccessResponse["messages"]; session: SessionView }
  | { type: "hard_stopped"; notice: SafetyNoticeState }
  | { type: "session_expired"; session: SessionView; notice: SafetyNoticeState }
  | { type: "message_failed"; draft: string; notice: SafetyNoticeState }
  | { type: "message_settled" };

interface StartSessionSuccessResponse {
  ok: true;
  session: SessionView;
}

interface StartSessionFailureResponse {
  ok: false;
  code: string;
  redirectTo?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStartSessionSuccess(body: unknown): body is StartSessionSuccessResponse {
  return isRecord(body) && body.ok === true && isRecord(body.session);
}

function isStartSessionFailure(body: unknown): body is StartSessionFailureResponse {
  return isRecord(body) && body.ok === false && typeof body.code === "string";
}

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
    isStarting: false,
    isMessagePending: false,
    isClientExpired: initialState.session?.remainingSeconds === 0,
    isHardStopped: initialState.kind === "interrupted",
    notice: null,
  };
}

export function timedSessionReducer(state: TimedSessionUiState, action: TimedSessionAction): TimedSessionUiState {
  switch (action.type) {
    case "draft_changed":
      return { ...state, draft: action.draft };
    case "client_expired":
      return { ...state, kind: "expired", isClientExpired: true };
    case "start_requested":
      return { ...state, isStarting: true, notice: null };
    case "start_succeeded":
      return {
        ...state,
        session: action.session,
        messages: [],
        kind: toSessionStartPageStateKind(action.session.status),
        isClientExpired: action.session.remainingSeconds === 0,
        isHardStopped: false,
      };
    case "start_failed":
      return { ...state, kind: action.kind ?? state.kind, notice: action.notice };
    case "start_settled":
      return { ...state, isStarting: false };
    case "message_requested":
      return { ...state, isMessagePending: true, notice: null };
    case "turn_succeeded":
      return {
        ...state,
        messages: appendSuccessfulTurn(state.messages, action.turn),
        session: action.session,
        kind: toSessionStartPageStateKind(action.session.status),
        draft: "",
        notice: null,
      };
    case "hard_stopped":
      return { ...state, kind: "interrupted", isHardStopped: true, notice: action.notice };
    case "session_expired":
      return { ...state, kind: "expired", session: action.session, isClientExpired: true, notice: action.notice };
    case "message_failed":
      return { ...state, draft: action.draft, notice: action.notice };
    case "message_settled":
      return { ...state, isMessagePending: false };
  }
}

export function useTimedSession(initialState: SessionStartPageState) {
  const [state, dispatch] = useReducer(timedSessionReducer, initialState, getInitialTimedSessionState);

  const composerAvailable = useMemo(
    () =>
      isComposerAvailable({
        session: state.session,
        isPending: state.isMessagePending,
        isHardStopped: state.isHardStopped,
        isClientExpired: state.isClientExpired,
      }),
    [state.isClientExpired, state.isHardStopped, state.isMessagePending, state.session],
  );

  const handleExpired = useCallback(() => {
    dispatch({ type: "client_expired" });
  }, []);

  const setDraft = useCallback((draft: string) => {
    dispatch({ type: "draft_changed", draft });
  }, []);

  async function startSession() {
    if (state.isStarting) {
      return;
    }

    dispatch({ type: "start_requested" });

    try {
      const isFollowupStart = state.kind === "followup_ready";
      const startWithoutContext = isFollowupStart && initialState.canStartWithoutContext;
      const result = await requestApiJson(isFollowupStart ? "/api/session/start-next" : "/api/session/start", {
        method: "POST",
        ...(startWithoutContext
          ? {
              body: JSON.stringify({
                startWithoutContext: true,
              }),
            }
          : {}),
      });

      if (result.kind === "network_error") {
        dispatch({
          type: "start_failed",
          notice: buildGenericNotice(
            "Nie udało się rozpocząć sesji",
            "Połączenie z serwerem jest chwilowo niedostępne.",
          ),
        });
        return;
      }

      if (isRateLimitedApiResult(result)) {
        dispatch({
          type: "start_failed",
          notice: buildGenericNotice(
            "Za dużo prób w krótkim czasie",
            "Odczekaj około minuty i spróbuj ponownie rozpocząć sesję.",
          ),
        });
        return;
      }

      const body = result.body;

      if (isStartSessionSuccess(body)) {
        dispatch({ type: "start_succeeded", session: body.session });
        return;
      }

      if (isStartSessionFailure(body) && body.redirectTo) {
        window.location.assign(body.redirectTo);
        return;
      }

      const failureCode = isStartSessionFailure(body) ? body.code : null;

      dispatch({
        type: "start_failed",
        kind:
          failureCode === "trial_already_claimed" || failureCode === "no_context_not_confirmed"
            ? "followup_ready"
            : "unavailable",
        notice: buildGenericNotice("Nie udało się rozpocząć sesji", "Spróbuj ponownie za chwilę albo wróć do panelu."),
      });
    } finally {
      dispatch({ type: "start_settled" });
    }
  }

  async function sendMessage() {
    const trimmedDraft = state.draft.trim();

    if (!state.session || !trimmedDraft || !composerAvailable) {
      return;
    }

    dispatch({ type: "message_requested" });

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

  return {
    state,
    composerAvailable,
    handleExpired,
    setDraft,
    startSession,
    sendMessage,
  };
}
