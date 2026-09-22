import { isRateLimitedApiResult, isTimedOutApiResult, requestApiJson } from "@/lib/api-client";
import type { Locale } from "@/lib/i18n/locale";
import { getSessionCopy } from "@/lib/session-copy";
import { isSendSessionMessageResponse } from "@/lib/session-flow/message-contract";
import { isCompleteSessionResponse } from "@/lib/session-flow/session-completion-contract";
import { buildInfoNotice } from "@/lib/session-flow/session-notice";
import {
  getSessionAccessRedirectHref,
  type EndSessionDispatch,
  type TimedSessionDispatch,
} from "@/lib/session-flow/timed-session-state";

/**
 * Transport rozmowy pisanej bez Reacta (jak `voice-peer.ts` dla głosu): tura i
 * zakończenie jako sekwencje akcji dla reduktora z `timed-session-state.ts`.
 * Rozmowa głosowa używa `endTimedSession` i `TimedSessionTransport` z tego
 * samego modułu.
 */

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

const buildGenericNotice = buildInfoNotice;

function buildExpiredNotice(locale: Locale) {
  const { turn } = getSessionCopy(locale);

  return buildGenericNotice(turn.expiredTitle, turn.expiredBody);
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
  dispatch: EndSessionDispatch,
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
