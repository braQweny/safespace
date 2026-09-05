import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiJsonResult } from "@/lib/api-client";
import { getSessionCopy } from "@/lib/session-copy";
import type { SessionView } from "@/lib/session-flow/session-state";
import {
  endTimedSession,
  getSessionAccessRedirectHref,
  SESSION_MESSAGE_TIMEOUT_MS,
  sendTimedSessionMessage,
  resolveMessageRetryIdentity,
  SLOW_RESPONSE_THRESHOLD_MS,
  timedSessionReducer,
  type SafetyNoticeState,
  type TimedSessionAction,
  type TimedSessionTransport,
  type TimedSessionUiState,
} from "../useTimedSession";

const SESSION_TURN_COPY = getSessionCopy("pl").turn;

const activeSession: SessionView = {
  id: "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a",
  status: "active",
  startedAt: "2026-06-12T10:00:00.000Z",
  endedAt: null,
  expiresAt: "2026-06-12T10:15:00.000Z",
  remainingSeconds: 600,
  isTrial: true,
  durationBucketSeconds: null,
};

const completedSession: SessionView = {
  ...activeSession,
  status: "completed",
  endedAt: "2026-06-12T10:05:00.000Z",
};

const infoNotice: SafetyNoticeState = {
  variant: "info",
  copy: {
    title: "Tytuł",
    body: "Treść",
    nextSteps: [],
  },
};

const baseState: TimedSessionUiState = {
  kind: "ready",
  session: null,
  messages: [],
  draft: "",
  isEnding: false,
  isMessagePending: false,
  isResponseSlow: false,
  isClientExpired: false,
  isHardStopped: false,
  pendingUserText: null,
  unsentText: null,
  notice: null,
};

const turn = {
  user: {
    id: "m2",
    role: "user" as const,
    sequenceIndex: 2,
    content: "pytanie",
    createdAt: "2026-06-12T10:02:00.000Z",
  },
  assistant: {
    id: "m3",
    role: "assistant" as const,
    sequenceIndex: 3,
    content: "odpowiedź",
    createdAt: "2026-06-12T10:02:05.000Z",
  },
};

describe("timedSessionReducer", () => {
  it("marks client expiry together with the expired kind", () => {
    const state = timedSessionReducer(
      { ...baseState, kind: "active", session: activeSession },
      { type: "client_expired" },
    );

    expect(state.kind).toBe("expired");
    expect(state.isClientExpired).toBe(true);
  });

  it("appends a successful turn in sequence order and clears the draft", () => {
    const state = timedSessionReducer(
      {
        ...baseState,
        kind: "active",
        session: activeSession,
        draft: "pytanie",
        notice: infoNotice,
        messages: [
          {
            id: "m1",
            role: "assistant",
            sequenceIndex: 1,
            content: "powitanie",
            createdAt: "2026-06-12T10:00:30.000Z",
          },
        ],
      },
      { type: "turn_succeeded", turn, session: activeSession },
    );

    expect(state.messages.map((message) => message.sequenceIndex)).toEqual([1, 2, 3]);
    expect(state.draft).toBe("");
    expect(state.notice).toBeNull();
  });

  it("interrupts the session on hard stop and keeps it interrupted", () => {
    const state = timedSessionReducer(
      { ...baseState, kind: "active", session: activeSession },
      { type: "hard_stopped", notice: { ...infoNotice, variant: "hard_stop" } },
    );

    expect(state.kind).toBe("interrupted");
    expect(state.isHardStopped).toBe(true);
    expect(state.notice?.variant).toBe("hard_stop");
  });

  it("marks an explicitly ended session as completed and clears the draft", () => {
    const state = timedSessionReducer(
      {
        ...baseState,
        kind: "active",
        session: activeSession,
        draft: "niewysłana wiadomość",
        isClientExpired: true,
        isHardStopped: true,
        notice: infoNotice,
      },
      { type: "end_succeeded", session: completedSession },
    );

    expect(state.kind).toBe("completed");
    expect(state.session).toEqual(completedSession);
    expect(state.draft).toBe("");
    expect(state.isClientExpired).toBe(false);
    expect(state.isHardStopped).toBe(false);
    expect(state.notice).toBeNull();
  });

  it("shows the sent text optimistically while the message is pending and clears it after the turn", () => {
    const pending = timedSessionReducer(
      { ...baseState, kind: "active", session: activeSession, draft: "wysyłana wiadomość" },
      { type: "message_requested", text: "wysyłana wiadomość" },
    );

    expect(pending.isMessagePending).toBe(true);
    expect(pending.draft).toBe("");
    expect(pending.pendingUserText).toBe("wysyłana wiadomość");

    const settled = timedSessionReducer(pending, { type: "message_settled" });

    expect(settled.isMessagePending).toBe(false);
    expect(settled.pendingUserText).toBeNull();
  });

  it("restores the draft and drops the optimistic text when a message fails", () => {
    const failed = timedSessionReducer(
      {
        ...baseState,
        kind: "active",
        session: activeSession,
        isMessagePending: true,
        pendingUserText: "utracona wiadomość",
      },
      { type: "message_failed", draft: "utracona wiadomość", notice: infoNotice },
    );

    expect(failed.draft).toBe("utracona wiadomość");
    expect(failed.pendingUserText).toBeNull();
  });

  it("keeps the failure notice attached to the message that failed", () => {
    const failed = timedSessionReducer(
      { ...baseState, kind: "active", session: activeSession, isMessagePending: true },
      { type: "message_failed", draft: "utracona wiadomość", notice: infoNotice },
    );

    expect(failed.draft).toBe("utracona wiadomość");
    expect(failed.notice).toEqual(infoNotice);
  });

  it("settles pending flags via dedicated actions", () => {
    expect(timedSessionReducer({ ...baseState, isEnding: true }, { type: "end_settled" }).isEnding).toBe(false);
    expect(
      timedSessionReducer({ ...baseState, isMessagePending: true }, { type: "message_settled" }).isMessagePending,
    ).toBe(false);
  });

  it("flags a slow response only while a turn is pending and clears it when it settles", () => {
    const idle = timedSessionReducer(
      { ...baseState, kind: "active", session: activeSession },
      { type: "message_slow" },
    );
    expect(idle.isResponseSlow).toBe(false);

    const pending = timedSessionReducer(
      { ...baseState, kind: "active", session: activeSession, isMessagePending: true },
      { type: "message_slow" },
    );
    expect(pending.isResponseSlow).toBe(true);

    expect(timedSessionReducer(pending, { type: "message_settled" }).isResponseSlow).toBe(false);
    expect(timedSessionReducer(pending, { type: "message_requested", text: "następna" }).isResponseSlow).toBe(false);
  });
});

/*
 * Słowa, które nie zdążyły dojść przed końcem czasu, nie mogą zniknąć razem z
 * polem pisania: wracają jako `unsentText` na karcie zamknięcia. Po
 * zatrzymaniu bezpieczeństwa — nigdy.
 */
describe("timedSessionReducer unsent text", () => {
  it("keeps the draft caught by the client timer", () => {
    const state = timedSessionReducer(
      { ...baseState, kind: "active", session: activeSession, draft: "  zdanie w połowie  " },
      { type: "client_expired" },
    );

    expect(state.unsentText).toBe("zdanie w połowie");
    expect(state.draft).toBe("");
  });

  it("keeps nothing when the client timer catches an empty draft", () => {
    const state = timedSessionReducer(
      { ...baseState, kind: "active", session: activeSession, draft: "   " },
      { type: "client_expired" },
    );

    expect(state.unsentText).toBeNull();
  });

  it("keeps the message the server rejected as expired", () => {
    const state = timedSessionReducer(
      {
        ...baseState,
        kind: "active",
        session: activeSession,
        isMessagePending: true,
        pendingUserText: "odrzucona wiadomość",
      },
      { type: "session_expired", session: { ...activeSession, status: "expired" }, notice: infoNotice },
    );

    expect(state.unsentText).toBe("odrzucona wiadomość");
    expect(state.pendingUserText).toBeNull();
    expect(state.kind).toBe("expired");
  });

  it("never keeps text after a safety hard stop", () => {
    const state = timedSessionReducer(
      {
        ...baseState,
        kind: "active",
        session: activeSession,
        isMessagePending: true,
        pendingUserText: "treść, która zatrzymała rozmowę",
        unsentText: "wcześniejszy szkic",
      },
      { type: "hard_stopped", notice: { ...infoNotice, variant: "hard_stop" } },
    );

    expect(state.unsentText).toBeNull();
    expect(state.pendingUserText).toBeNull();
    expect(state.draft).toBe("");

    const failedAfterStop = timedSessionReducer(state, {
      type: "message_failed",
      draft: "treść, która zatrzymała rozmowę",
      notice: infoNotice,
    });

    expect(failedAfterStop.unsentText).toBeNull();
    expect(failedAfterStop.draft).toBe("");
  });

  it("routes a message that failed after the session ended to unsent text, not the draft", () => {
    const ended = timedSessionReducer(
      { ...baseState, kind: "active", session: activeSession, isMessagePending: true, pendingUserText: "w locie" },
      { type: "end_succeeded", session: completedSession },
    );
    const failed = timedSessionReducer(ended, { type: "message_failed", draft: "w locie", notice: infoNotice });

    expect(failed.kind).toBe("completed");
    expect(failed.draft).toBe("");
    expect(failed.unsentText).toBe("w locie");
    expect(failed.pendingUserText).toBeNull();
  });

  it("keeps a draft caught by an explicit end", () => {
    const state = timedSessionReducer(
      { ...baseState, kind: "active", session: activeSession, draft: "jeszcze jedno" },
      { type: "end_succeeded", session: completedSession },
    );

    expect(state.unsentText).toBe("jeszcze jedno");
  });

  it("does not reopen a finished conversation when a late reply arrives", () => {
    const ended = timedSessionReducer(
      { ...baseState, kind: "active", session: activeSession, isMessagePending: true, pendingUserText: "w locie" },
      { type: "end_succeeded", session: completedSession },
    );
    const late = timedSessionReducer(ended, { type: "turn_succeeded", turn, session: activeSession });

    expect(late.kind).toBe("completed");
    expect(late.session).toEqual(completedSession);
    expect(late.messages.map((message) => message.id)).toEqual(["m2", "m3"]);
    expect(late.pendingUserText).toBeNull();
  });
});

describe("getSessionAccessRedirectHref", () => {
  it("sends an expired login to sign-in and a blocked account to its page", () => {
    expect(getSessionAccessRedirectHref("missing_auth")).toBe("/auth/signin");
    expect(getSessionAccessRedirectHref("account_blocked")).toBe("/account/blocked");
  });

  it("leaves every other failure to the in-session notice", () => {
    expect(getSessionAccessRedirectHref("session_not_found")).toBeNull();
    expect(getSessionAccessRedirectHref("account_access_unavailable")).toBeNull();
    expect(getSessionAccessRedirectHref("validation_failed")).toBeNull();
  });
});

function jsonResult(body: unknown, status = 200): ApiJsonResult {
  return { kind: "json", status, body };
}

function createTransport(result: ApiJsonResult | (() => Promise<ApiJsonResult>)) {
  const request = vi.fn<TimedSessionTransport["request"]>(() =>
    typeof result === "function" ? result() : Promise.resolve(result),
  );
  const navigate = vi.fn<TimedSessionTransport["navigate"]>();
  const dispatched: TimedSessionAction[] = [];
  const dispatch = (action: TimedSessionAction) => {
    dispatched.push(action);
  };

  return { transport: { request, navigate }, request, navigate, dispatch, dispatched };
}

function actionTypes(actions: readonly TimedSessionAction[]) {
  return actions.map((action) => action.type);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("sendTimedSessionMessage", () => {
  it("reuses the same receipt through a lost response, but changes it for edited text or another session", async () => {
    const first = resolveMessageRetryIdentity(null, activeSession.id, "pytanie");
    const { transport, request, dispatch } = createTransport({ kind: "network_error", reason: "timeout" });
    await sendTimedSessionMessage({ ...first, locale: "pl" }, dispatch, transport);
    const retry = resolveMessageRetryIdentity(first, activeSession.id, " pytanie ");
    await sendTimedSessionMessage({ ...retry, locale: "pl" }, dispatch, transport);
    const bodies = request.mock.calls.map((call) => JSON.parse(call[1]?.body as string) as { clientMessageId: string });
    expect(bodies.map((body) => body.clientMessageId)).toEqual([first.clientMessageId, first.clientMessageId]);
    expect(resolveMessageRetryIdentity(first, activeSession.id, "zmienione pytanie").clientMessageId).not.toBe(
      first.clientMessageId,
    );
    expect(resolveMessageRetryIdentity(first, "another-session", "pytanie").clientMessageId).not.toBe(
      first.clientMessageId,
    );
  });

  it("keeps a retried receipt from duplicating a turn already present in the view", () => {
    const state = {
      ...baseState,
      kind: "active" as const,
      session: activeSession,
      messages: [turn.user, turn.assistant],
    };
    const replay = timedSessionReducer(state, { type: "turn_succeeded", turn, session: activeSession });
    expect(replay.messages).toEqual(state.messages);
  });

  it("preserves the draft while another request still owns the generation", async () => {
    const { transport, dispatch, dispatched } = createTransport(
      jsonResult({ ok: false, type: "message_in_progress", code: "message_in_progress" }, 409),
    );
    await sendTimedSessionMessage({ sessionId: activeSession.id, text: "pytanie", locale: "pl" }, dispatch, transport);
    const failure = dispatched.find((action) => action.type === "message_failed");
    expect(failure).toMatchObject({ type: "message_failed", draft: "pytanie" });
    expect(failure?.notice.copy.title).toBe("Poprzednia wiadomość jest jeszcze przetwarzana");
  });
  it("sends with the client-side deadline", async () => {
    const { transport, request, dispatch } = createTransport(
      jsonResult({ ok: true, type: "success", messages: turn, session: activeSession }),
    );

    await sendTimedSessionMessage({ sessionId: activeSession.id, text: "pytanie", locale: "pl" }, dispatch, transport);

    expect(request).toHaveBeenCalledWith(
      "/api/session/message",
      expect.objectContaining({ method: "POST", timeoutMs: SESSION_MESSAGE_TIMEOUT_MS }),
    );
  });

  it("restores the draft with a dedicated notice when the response does not arrive in time", async () => {
    const { transport, dispatch, dispatched } = createTransport({ kind: "network_error", reason: "timeout" });

    await sendTimedSessionMessage({ sessionId: activeSession.id, text: "pytanie", locale: "pl" }, dispatch, transport);

    expect(actionTypes(dispatched)).toEqual(["message_requested", "message_failed", "message_settled"]);
    const failed = dispatched[1];
    expect(failed.type === "message_failed" && failed.draft).toBe("pytanie");
    expect(failed.type === "message_failed" && failed.notice.copy.title).toBe(SESSION_TURN_COPY.timeoutTitle);
    expect(failed.type === "message_failed" && failed.notice.copy.body).toBe(SESSION_TURN_COPY.timeoutBody);
  });

  it("keeps the generic connectivity notice for a plain network failure", async () => {
    const { transport, dispatch, dispatched } = createTransport({ kind: "network_error" });

    await sendTimedSessionMessage({ sessionId: activeSession.id, text: "pytanie", locale: "pl" }, dispatch, transport);

    const failed = dispatched[1];
    expect(failed.type === "message_failed" && failed.notice.copy.title).toBe("Nie udało się wysłać wiadomości");
  });

  it("flags a slow response after the threshold and not before", async () => {
    vi.useFakeTimers();
    const { transport, dispatch, dispatched } = createTransport(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(jsonResult({ ok: true, type: "success", messages: turn, session: activeSession }));
          }, SLOW_RESPONSE_THRESHOLD_MS + 8_000);
        }),
    );

    const pending = sendTimedSessionMessage(
      { sessionId: activeSession.id, text: "pytanie", locale: "pl" },
      dispatch,
      transport,
    );

    await vi.advanceTimersByTimeAsync(SLOW_RESPONSE_THRESHOLD_MS - 1);
    expect(actionTypes(dispatched)).toEqual(["message_requested"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(actionTypes(dispatched)).toEqual(["message_requested", "message_slow"]);

    await vi.advanceTimersByTimeAsync(8_000);
    await pending;
    expect(actionTypes(dispatched)).toEqual(["message_requested", "message_slow", "turn_succeeded", "message_settled"]);
  });

  it("cancels the slow-response flag when the reply arrives first", async () => {
    vi.useFakeTimers();
    const { transport, dispatch, dispatched } = createTransport(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(jsonResult({ ok: true, type: "success", messages: turn, session: activeSession }));
          }, 2_000);
        }),
    );

    const pending = sendTimedSessionMessage(
      { sessionId: activeSession.id, text: "pytanie", locale: "pl" },
      dispatch,
      transport,
    );
    await vi.advanceTimersByTimeAsync(2_000);
    await pending;
    await vi.advanceTimersByTimeAsync(SLOW_RESPONSE_THRESHOLD_MS * 2);

    expect(actionTypes(dispatched)).toEqual(["message_requested", "turn_succeeded", "message_settled"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("redirects an expired login to sign-in instead of asking to retry", async () => {
    const { transport, navigate, dispatch, dispatched } = createTransport(
      jsonResult({ ok: false, type: "missing_or_unauthorized", code: "missing_auth" }, 401),
    );

    await sendTimedSessionMessage({ sessionId: activeSession.id, text: "pytanie", locale: "pl" }, dispatch, transport);

    expect(navigate).toHaveBeenCalledWith("/auth/signin");
    expect(actionTypes(dispatched)).toEqual(["message_requested", "message_settled"]);
  });

  it("redirects a blocked account to its page", async () => {
    const { transport, navigate, dispatch, dispatched } = createTransport(
      jsonResult({ ok: false, type: "missing_or_unauthorized", code: "account_blocked" }, 403),
    );

    await sendTimedSessionMessage({ sessionId: activeSession.id, text: "pytanie", locale: "pl" }, dispatch, transport);

    expect(navigate).toHaveBeenCalledWith("/account/blocked");
    expect(actionTypes(dispatched)).not.toContain("message_failed");
  });

  it("still surfaces other unauthorized failures as a notice", async () => {
    const { transport, navigate, dispatch, dispatched } = createTransport(
      jsonResult({ ok: false, type: "missing_or_unauthorized", code: "session_not_found" }, 404),
    );

    await sendTimedSessionMessage({ sessionId: activeSession.id, text: "pytanie", locale: "pl" }, dispatch, transport);

    expect(navigate).not.toHaveBeenCalled();
    expect(actionTypes(dispatched)).toEqual(["message_requested", "message_failed", "message_settled"]);
  });

  it("navigates through window.location by default", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: false, type: "missing_or_unauthorized", code: "missing_auth" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    const dispatched: TimedSessionAction[] = [];

    await sendTimedSessionMessage({ sessionId: activeSession.id, text: "pytanie", locale: "pl" }, (action) => {
      dispatched.push(action);
    });

    expect(assign).toHaveBeenCalledWith("/auth/signin");
    expect(actionTypes(dispatched)).toEqual(["message_requested", "message_settled"]);
  });
});

describe("endTimedSession", () => {
  it("completes the session on success", async () => {
    const { transport, dispatch, dispatched } = createTransport(
      jsonResult({ ok: true, type: "session_completed", session: completedSession }),
    );

    await endTimedSession({ sessionId: activeSession.id, locale: "pl" }, dispatch, transport);

    expect(actionTypes(dispatched)).toEqual(["end_requested", "end_succeeded", "end_settled"]);
  });

  it("redirects an expired login instead of showing a retry notice", async () => {
    const { transport, navigate, dispatch, dispatched } = createTransport(
      jsonResult({ ok: false, type: "session_completion_error", code: "missing_auth" }, 401),
    );

    await endTimedSession({ sessionId: activeSession.id, locale: "pl" }, dispatch, transport);

    expect(navigate).toHaveBeenCalledWith("/auth/signin");
    expect(actionTypes(dispatched)).toEqual(["end_requested", "end_settled"]);
  });

  it("explains a session that is no longer active", async () => {
    const { transport, dispatch, dispatched } = createTransport(
      jsonResult({ ok: false, type: "session_completion_error", code: "session_not_active" }, 409),
    );

    await endTimedSession({ sessionId: activeSession.id, locale: "pl" }, dispatch, transport);

    const failed = dispatched[1];
    expect(failed.type === "end_failed" && failed.notice.copy.title).toBe(SESSION_TURN_COPY.sessionNotActiveTitle);
  });
});
