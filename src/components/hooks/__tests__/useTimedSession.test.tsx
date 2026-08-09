import { describe, expect, it } from "vitest";
import {
  resolveStartWithoutContext,
  timedSessionReducer,
  type SafetyNoticeState,
  type TimedSessionUiState,
} from "../useTimedSession";
import type { SessionView } from "@/lib/session-flow/session-state";

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
  isStarting: false,
  isEnding: false,
  isMessagePending: false,
  isClientExpired: false,
  isHardStopped: false,
  pendingUserText: null,
  notice: null,
};

describe("timedSessionReducer", () => {
  it("starts a session atomically: resets messages, derives kind, clears hard stop", () => {
    const state = timedSessionReducer(
      {
        ...baseState,
        kind: "followup_ready",
        isHardStopped: true,
        messages: [
          { id: "m1", role: "user", sequenceIndex: 1, content: "stara", createdAt: "2026-06-12T10:01:00.000Z" },
        ],
      },
      { type: "start_succeeded", session: activeSession },
    );

    expect(state.kind).toBe("active");
    expect(state.session).toEqual(activeSession);
    expect(state.messages).toEqual([]);
    expect(state.isHardStopped).toBe(false);
    expect(state.isClientExpired).toBe(false);
  });

  it("marks client expiry together with the expired kind", () => {
    const state = timedSessionReducer(
      { ...baseState, kind: "active", session: activeSession },
      { type: "client_expired" },
    );

    expect(state.kind).toBe("expired");
    expect(state.isClientExpired).toBe(true);
  });

  it("appends a successful turn in sequence order and clears the draft", () => {
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
    const completedSession: SessionView = {
      ...activeSession,
      status: "completed",
      endedAt: "2026-06-12T10:05:00.000Z",
      remainingSeconds: 600,
    };
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

  it("restores the draft when a message fails and keeps kind on start failure without kind", () => {
    const failed = timedSessionReducer(
      { ...baseState, kind: "active", session: activeSession, isMessagePending: true },
      { type: "message_failed", draft: "utracona wiadomość", notice: infoNotice },
    );

    expect(failed.draft).toBe("utracona wiadomość");
    expect(failed.notice).toEqual(infoNotice);

    const startFailed = timedSessionReducer(
      { ...baseState, kind: "followup_ready", isStarting: true },
      { type: "start_failed", notice: infoNotice },
    );

    expect(startFailed.kind).toBe("followup_ready");
  });

  it("settles pending flags via dedicated actions", () => {
    expect(timedSessionReducer({ ...baseState, isStarting: true }, { type: "start_settled" }).isStarting).toBe(false);
    expect(timedSessionReducer({ ...baseState, isEnding: true }, { type: "end_settled" }).isEnding).toBe(false);
    expect(
      timedSessionReducer({ ...baseState, isMessagePending: true }, { type: "message_settled" }).isMessagePending,
    ).toBe(false);
  });
});

describe("resolveStartWithoutContext", () => {
  const followupWithContext = {
    isFollowupStart: true,
    canStartWithoutContext: true,
    approvedSummaryCount: 2,
    requestedWithoutContext: false,
  };

  it("keeps approved context unless the user opts out", () => {
    expect(resolveStartWithoutContext(followupWithContext)).toBe(false);
    expect(resolveStartWithoutContext({ ...followupWithContext, requestedWithoutContext: true })).toBe(true);
  });

  it("confirms the context-free start implicitly when there is nothing to carry over", () => {
    expect(resolveStartWithoutContext({ ...followupWithContext, approvedSummaryCount: 0 })).toBe(true);
  });

  it("never declares a context-free start outside an offered follow-up", () => {
    expect(
      resolveStartWithoutContext({
        ...followupWithContext,
        isFollowupStart: false,
        approvedSummaryCount: 0,
        requestedWithoutContext: true,
      }),
    ).toBe(false);
    expect(
      resolveStartWithoutContext({
        ...followupWithContext,
        canStartWithoutContext: false,
        requestedWithoutContext: true,
      }),
    ).toBe(false);
  });
});
