import { describe, expect, it } from "vitest";
import type { SessionStartPageState, SessionView } from "../session-state";
import { buildInfoNotice } from "../session-notice";
import type { VoiceHeartbeatSuccessResponse } from "../voice-contract";
import {
  getInitialVoiceSessionState,
  isVoiceConnected,
  selectLiveFragments,
  shouldHeartbeat,
  voiceSessionReducer,
  type VoiceHeartbeatNotices,
  type VoiceSessionAction,
  type VoiceSessionUiState,
} from "../voice-session-state";
import { MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";

const cbt = MVP_MODALITIES.find((modality) => modality.modalityId === "cbt") ?? MVP_MODALITIES[1];
const avatar: SessionStartPageState["avatar"] = { modality: cbt, selected: toSelectedModalityAvatar(cbt) };

const activeSession: SessionView = {
  id: "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f",
  status: "active",
  startedAt: "2026-09-12T10:00:00.000Z",
  endedAt: null,
  expiresAt: "2026-09-12T10:10:00.000Z",
  remainingSeconds: 540,
  isTrial: false,
  durationBucketSeconds: 600,
  mode: "voice",
};

const activeState: SessionStartPageState = {
  kind: "active",
  trialAvailable: false,
  avatar,
  session: activeSession,
  messages: [
    { id: "m1", role: "assistant", sequenceIndex: 0, content: "Cześć.", createdAt: "2026-09-12T10:00:05.000Z" },
  ],
  messageFetchFailed: false,
  approvedSummaries: [],
  canStartWithoutContext: false,
  sessionQuota: null,
};

const notices: VoiceHeartbeatNotices = {
  expired: buildInfoNotice("Czas minął", "Koniec."),
  disabled: buildInfoNotice("Wyłączone", "Koniec."),
  superseded: buildInfoNotice("Inna karta", "Koniec."),
  connectionLost: buildInfoNotice("Zerwane", "Łączymy."),
};

function heartbeat(overrides: Partial<VoiceHeartbeatSuccessResponse> = {}): VoiceHeartbeatSuccessResponse {
  return {
    ok: true,
    type: "voice_heartbeat",
    live: true,
    closeReason: null,
    epoch: 1,
    remainingSeconds: 500,
    serverNow: "2026-09-12T10:01:40.000Z",
    session: activeSession,
    messages: [],
    ...overrides,
  };
}

function reduce(state: VoiceSessionUiState, ...actions: VoiceSessionAction[]) {
  return actions.reduce(voiceSessionReducer, state);
}

function connected() {
  return reduce(
    getInitialVoiceSessionState(activeState, { voiceAvailable: true }),
    { type: "mic_requested" },
    { type: "connecting" },
    { type: "connected", epoch: 1, session: activeSession },
  );
}

describe("getInitialVoiceSessionState", () => {
  it("starts idle for an active conversation, unavailable without the feature, ended otherwise", () => {
    expect(getInitialVoiceSessionState(activeState, { voiceAvailable: true })).toMatchObject({
      kind: "active",
      status: "idle",
      epoch: 0,
      persistedMessages: activeState.messages,
      pendingUtterances: [],
    });
    expect(getInitialVoiceSessionState(activeState, { voiceAvailable: false }).status).toBe("unavailable");
    expect(
      getInitialVoiceSessionState(
        { ...activeState, kind: "completed", session: { ...activeSession, status: "completed" } },
        { voiceAvailable: true },
      ).status,
    ).toBe("ended");
    expect(
      getInitialVoiceSessionState(
        { ...activeState, kind: "interrupted", session: { ...activeSession, status: "interrupted" } },
        { voiceAvailable: true },
      ).status,
    ).toBe("hard_stop");
  });
});

describe("connecting", () => {
  it("walks mic → connecting → live and resets the transcript on a new epoch", () => {
    const initial = getInitialVoiceSessionState(activeState, { voiceAvailable: true });
    const requesting = reduce(initial, { type: "mic_requested" });
    expect(requesting.status).toBe("requesting_mic");
    const live = reduce(requesting, { type: "connecting" }, { type: "connected", epoch: 3, session: activeSession });
    expect(live).toMatchObject({ status: "live", epoch: 3, isMuted: false, reconnectAttempt: 0, notice: null });
    expect(isVoiceConnected(live.status)).toBe(true);
    expect(shouldHeartbeat(live)).toBe(true);
    expect(shouldHeartbeat(initial)).toBe(false);
  });

  it("returns to idle with the notice when the microphone fails, and offers a retry on a retryable failure", () => {
    const initial = getInitialVoiceSessionState(activeState, { voiceAvailable: true });
    const denied = reduce(initial, { type: "mic_requested" }, { type: "mic_failed", notice: notices.connectionLost });
    expect(denied).toMatchObject({ status: "idle", notice: notices.connectionLost });

    const retryable = reduce(
      initial,
      { type: "mic_requested" },
      { type: "connecting" },
      { type: "connect_failed", notice: notices.connectionLost, retryable: true },
    );
    expect(retryable).toMatchObject({ status: "reconnecting", reconnectAttempt: 1 });
    expect(shouldHeartbeat(retryable)).toBe(true);
    const final = reduce(initial, { type: "connect_failed", notice: null, retryable: false });
    expect(final).toMatchObject({ status: "idle", reconnectAttempt: 0 });
  });

  it("marks the browser as unsupported only while the conversation is active", () => {
    expect(
      reduce(getInitialVoiceSessionState(activeState, { voiceAvailable: true }), { type: "unsupported" }).status,
    ).toBe("unsupported");
    const ended = getInitialVoiceSessionState(
      { ...activeState, kind: "completed", session: { ...activeSession, status: "completed" } },
      { voiceAvailable: true },
    );
    expect(reduce(ended, { type: "unsupported" }).status).toBe("ended");
  });
});

describe("transcript preview", () => {
  it("groups fragments into open utterances, closes them on idle and marks the avatar as speaking", () => {
    let state = connected();
    state = reduce(
      state,
      {
        type: "fragment",
        fragment: { speaker: "user", text: "Dzień ", startMs: 0, endMs: 200, epoch: 1 },
        nowMs: 1_000,
      },
      {
        type: "fragment",
        fragment: { speaker: "user", text: "dobry", startMs: 200, endMs: 400, epoch: 1 },
        nowMs: 1_200,
      },
      {
        type: "fragment",
        fragment: { speaker: "assistant", text: "Cześć, ", startMs: 1_500, endMs: 1_700, epoch: 1 },
        nowMs: 2_500,
      },
    );
    expect(state.isAvatarSpeaking).toBe(true);
    expect(selectLiveFragments(state)).toEqual([
      { id: "live-1-user-0", role: "user", text: "Dzień dobry" },
      { id: "live-1-assistant-1500", role: "assistant", text: "Cześć," },
    ]);

    const flushed = reduce(state, { type: "idle_flush", nowMs: 4_000 });
    expect(flushed.pendingUtterances.map((utterance) => utterance.text)).toEqual(["Dzień dobry", "Cześć,"]);
    expect(flushed.isAvatarSpeaking).toBe(false);
    expect(reduce(flushed, { type: "idle_flush", nowMs: 5_000 })).toBe(flushed);
  });

  it("replaces the preview with the persisted rows a heartbeat brings, by content and then by role", () => {
    let state = reduce(
      connected(),
      { type: "fragment", fragment: { speaker: "user", text: "Pierwsze", startMs: 0, endMs: 200, epoch: 1 }, nowMs: 0 },
      { type: "idle_flush", nowMs: 5_000 },
      {
        type: "fragment",
        fragment: { speaker: "user", text: "Drugie", startMs: 3_000, endMs: 3_200, epoch: 1 },
        nowMs: 6_000,
      },
      { type: "idle_flush", nowMs: 9_000 },
    );
    expect(selectLiveFragments(state)).toHaveLength(2);

    state = reduce(state, {
      type: "heartbeat",
      response: heartbeat({
        messages: [
          { id: "m2", role: "user", sequenceIndex: 1, content: "Drugie", createdAt: "2026-09-12T10:01:00.000Z" },
          {
            id: "m3",
            role: "user",
            sequenceIndex: 2,
            content: "(inaczej pogrupowane)",
            createdAt: "2026-09-12T10:01:10.000Z",
          },
        ],
      }),
      notices,
    });

    expect(state.persistedMessages.map((message) => message.id)).toEqual(["m1", "m2", "m3"]);
    expect(selectLiveFragments(state)).toEqual([]);
    expect(state.session).toEqual(activeSession);
  });
});

describe("heartbeat outcomes", () => {
  it("keeps a live conversation live and ignores nothing new", () => {
    const state = reduce(connected(), { type: "heartbeat", response: heartbeat(), notices });
    expect(state).toMatchObject({ status: "live", kind: "active", closeReason: null });
  });

  it("turns a crisis close into a hard stop with the server's notice and an interrupted row", () => {
    const crisis = {
      variant: "hard_stop" as const,
      copy: { title: "Stop", body: "…", nextSteps: [] },
      crisisResources: [],
    };
    const state = reduce(connected(), {
      type: "heartbeat",
      response: heartbeat({
        live: false,
        closeReason: "interrupted",
        session: { ...activeSession, status: "interrupted" },
        notice: crisis,
      }),
      notices,
    });
    expect(state).toMatchObject({ status: "hard_stop", kind: "interrupted", notice: crisis, isMuted: false });
    expect(shouldHeartbeat(state)).toBe(false);
  });

  it("expires, completes after a switch-off, and tells a superseded tab it was replaced", () => {
    const expired = reduce(connected(), {
      type: "heartbeat",
      response: heartbeat({
        live: false,
        closeReason: "time_limit_reached",
        session: { ...activeSession, status: "expired", remainingSeconds: 0 },
      }),
      notices,
    });
    expect(expired).toMatchObject({ status: "ended", kind: "expired", isClientExpired: true, notice: notices.expired });

    const disabled = reduce(connected(), {
      type: "heartbeat",
      response: heartbeat({
        live: false,
        closeReason: "voice_disabled",
        session: { ...activeSession, status: "completed" },
      }),
      notices,
    });
    expect(disabled).toMatchObject({ status: "ended", kind: "completed", notice: notices.disabled });

    const superseded = reduce(connected(), {
      type: "heartbeat",
      response: heartbeat({ live: false, closeReason: "reconnected", epoch: 2 }),
      notices,
    });
    expect(superseded).toMatchObject({ status: "ended", kind: "active", notice: notices.superseded });
    expect(shouldHeartbeat(superseded)).toBe(false);
  });

  it("asks for a reconnect after a lost heartbeat, a provider close or a classifier outage", () => {
    for (const closeReason of ["heartbeat_lost", "provider_closed", null] as const) {
      const state = reduce(connected(), {
        type: "heartbeat",
        response: heartbeat({ live: false, closeReason }),
        notices,
      });
      expect(state).toMatchObject({ status: "reconnecting", kind: "active", notice: notices.connectionLost });
    }

    const retry = { variant: "retry" as const, copy: { title: "Spróbuj", body: "…", nextSteps: [] } };
    const outage = reduce(connected(), {
      type: "heartbeat",
      response: heartbeat({ live: false, closeReason: "safety_unavailable", notice: retry }),
      notices,
    });
    expect(outage).toMatchObject({ status: "reconnecting", notice: retry });
  });

  it("never reopens a conversation the client already ended", () => {
    const ended = reduce(
      connected(),
      { type: "end_requested" },
      { type: "end_succeeded", session: { ...activeSession, status: "completed" } },
    );
    expect(ended).toMatchObject({ status: "ended", kind: "completed", isEnding: true });
    const settled = reduce(ended, { type: "end_settled" });
    expect(settled.isEnding).toBe(false);

    const after = reduce(settled, {
      type: "heartbeat",
      response: heartbeat({
        live: false,
        closeReason: "completed",
        session: { ...activeSession, status: "completed" },
        messages: [
          {
            id: "m9",
            role: "assistant",
            sequenceIndex: 9,
            content: "Do zobaczenia.",
            createdAt: "2026-09-12T10:05:00.000Z",
          },
        ],
      }),
      notices,
    });
    expect(after).toMatchObject({ status: "ended", kind: "completed" });
    expect(after.persistedMessages.at(-1)?.id).toBe("m9");
  });
});

describe("connection and lifecycle transitions", () => {
  it("moves to reconnecting once on connection loss, flushing the open preview", () => {
    const state = reduce(
      connected(),
      {
        type: "fragment",
        fragment: { speaker: "assistant", text: "Trwa", startMs: 0, endMs: 200, epoch: 1 },
        nowMs: 0,
      },
      { type: "connection_lost", notice: notices.connectionLost },
    );
    expect(state).toMatchObject({ status: "reconnecting", reconnectAttempt: 1, isAvatarSpeaking: false });
    expect(state.pendingUtterances.map((utterance) => utterance.text)).toEqual(["Trwa"]);
    expect(reduce(state, { type: "connection_lost", notice: null })).toBe(state);
  });

  it("mutes only while connected and clears the mute when the conversation ends", () => {
    const muted = reduce(connected(), { type: "mute_set", muted: true });
    expect(muted.isMuted).toBe(true);
    expect(
      reduce(getInitialVoiceSessionState(activeState, { voiceAvailable: true }), { type: "mute_set", muted: true })
        .isMuted,
    ).toBe(false);
    expect(reduce(muted, { type: "client_expired" })).toMatchObject({
      status: "ended",
      kind: "expired",
      isMuted: false,
    });
  });

  it("handles blocked audio, expiry from the end route, a hard stop and a vanished row", () => {
    const live = connected();
    expect(reduce(live, { type: "audio_blocked" }).status).toBe("audio_blocked");
    expect(reduce(live, { type: "audio_blocked" }, { type: "audio_unblocked" }).status).toBe("live");
    expect(
      reduce(live, {
        type: "session_expired",
        session: { ...activeSession, status: "expired", remainingSeconds: 0 },
        notice: notices.expired,
      }),
    ).toMatchObject({ status: "ended", kind: "expired", isClientExpired: true, notice: notices.expired });
    expect(reduce(live, { type: "hard_stopped", notice: notices.expired })).toMatchObject({
      status: "hard_stop",
      kind: "interrupted",
    });
    expect(reduce(live, { type: "session_unavailable", notice: notices.disabled })).toMatchObject({
      status: "ended",
      kind: "completed",
      notice: notices.disabled,
    });
    expect(reduce(live, { type: "end_failed", notice: notices.disabled })).toMatchObject({
      status: "live",
      notice: notices.disabled,
    });
    expect(reduce(live, { type: "heartbeat_failed", notice: notices.connectionLost }).notice).toEqual(
      notices.connectionLost,
    );
    expect(reduce(live, { type: "heartbeat_failed", notice: null })).toBe(live);
  });
});
