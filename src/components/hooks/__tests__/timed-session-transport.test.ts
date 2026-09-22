import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiJsonResult } from "@/lib/api-client";
import { getSessionCopy } from "@/lib/session-copy";
import type { SessionView } from "@/lib/session-flow/session-state";
import {
  resolveMessageRetryIdentity,
  timedSessionReducer,
  type TimedSessionAction,
  type TimedSessionUiState,
} from "@/lib/session-flow/timed-session-state";
import {
  endTimedSession,
  SESSION_MESSAGE_TIMEOUT_MS,
  sendTimedSessionMessage,
  SLOW_RESPONSE_THRESHOLD_MS,
  type TimedSessionTransport,
} from "../timed-session-transport";

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
