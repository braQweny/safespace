import { describe, expect, it } from "vitest";
import type { SessionView } from "../session-state";
import {
  getSessionAccessRedirectHref,
  timedSessionReducer,
  type SafetyNoticeState,
  type TimedSessionUiState,
} from "../timed-session-state";

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
