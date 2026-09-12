import { describe, expect, it } from "vitest";
import {
  VOICE_BUFFER_RETENTION_MS,
  VOICE_CONSTRAINTS_APPEND_INTERVAL_MS,
  VOICE_DEADLINE_RESERVE_MS,
  VOICE_HEARTBEAT_GRACE_MS,
  VOICE_SAFETY_FAILURES_BEFORE_CLOSE,
  VOICE_SIDEBAND_ROTATION_MS,
} from "../constants";
import {
  acceptsEpoch,
  applySafetyOutcome,
  armObserverState,
  closeObserverState,
  createInitialObserverState,
  decideAlarm,
  nextAlarmAt,
  resolveVoiceDeadlineAtMs,
  scheduleCrisisHangup,
  shouldAppendConstraints,
  shouldAppendPhase,
} from "../observer-state";

const NOW = 1_800_000_000_000;

function armed(overrides: Partial<Parameters<typeof armObserverState>[1]> = {}) {
  return armObserverState(createInitialObserverState(), {
    liveSessionId: "live_1",
    startedAtMs: NOW,
    expiresAtMs: NOW + 600_000,
    locale: "pl",
    avatarName: "Lena",
    nowMs: NOW,
    ...overrides,
  });
}

describe("observer state", () => {
  it("bumps the epoch on every arm and only accepts results from the current, open epoch", () => {
    const first = armed();
    const second = armObserverState(first, {
      liveSessionId: "live_2",
      startedAtMs: NOW,
      expiresAtMs: NOW + 600_000,
      locale: "pl",
      avatarName: "Lena",
      nowMs: NOW + 1000,
    });

    expect(first.epoch).toBe(1);
    expect(second.epoch).toBe(2);
    expect(second.safetyFailures).toBe(0);
    expect(acceptsEpoch(second, 2)).toBe(true);
    expect(acceptsEpoch(second, 1)).toBe(false);
    expect(acceptsEpoch(closeObserverState(second, "completed", NOW + 2000), 2)).toBe(false);
  });

  it("schedules the earliest of deadline, heartbeat grace, rotation and pending hangup", () => {
    // An hour-long premium conversation: the deadline lies beyond one rotation.
    const state = { ...armed({ expiresAtMs: NOW + 3_600_000 }), sidebandOpenedAtMs: NOW };

    expect(resolveVoiceDeadlineAtMs(NOW + 600_000)).toBe(NOW + 600_000 - VOICE_DEADLINE_RESERVE_MS);
    expect(nextAlarmAt(state)).toBe(NOW + VOICE_HEARTBEAT_GRACE_MS);
    expect(nextAlarmAt({ ...state, lastBeatAtMs: NOW + VOICE_SIDEBAND_ROTATION_MS })).toBe(
      NOW + VOICE_SIDEBAND_ROTATION_MS,
    );
    expect(nextAlarmAt({ ...state, pendingHangupAtMs: NOW + 8000 })).toBe(NOW + 8000);
    expect(nextAlarmAt(closeObserverState(state, "completed", NOW))).toBe(NOW + VOICE_BUFFER_RETENTION_MS);
    // Crisis grace: the close reason is set but the provider hangup is still pending.
    expect(nextAlarmAt(scheduleCrisisHangup(state, NOW, 8000))).toBe(NOW + 8000);
    expect(nextAlarmAt(createInitialObserverState())).toBeNull();
  });

  it("decides the alarm in priority order: hangup before rotation, purge only after retention", () => {
    const state = { ...armed({ expiresAtMs: NOW + 3_600_000 }), sidebandOpenedAtMs: NOW };

    expect(decideAlarm(state, NOW + 1000, true)).toEqual({ action: "idle" });
    expect(decideAlarm(state, NOW + 1000, false)).toEqual({ action: "reattach" });
    // Rotation only matters while the heartbeat is alive.
    expect(
      decideAlarm({ ...state, lastBeatAtMs: NOW + VOICE_SIDEBAND_ROTATION_MS }, NOW + VOICE_SIDEBAND_ROTATION_MS, true),
    ).toEqual({ action: "rotate" });
    expect(decideAlarm({ ...state, lastBeatAtMs: NOW - VOICE_HEARTBEAT_GRACE_MS }, NOW, true)).toEqual({
      action: "hangup",
      reason: "heartbeat_lost",
    });
    expect(decideAlarm(state, NOW + 3_600_000 - VOICE_DEADLINE_RESERVE_MS, true)).toEqual({
      action: "hangup",
      reason: "time_limit_reached",
    });
    expect(decideAlarm({ ...state, pendingHangupAtMs: NOW + 8000 }, NOW + 8000, true)).toEqual({
      action: "hangup",
      reason: "interrupted",
    });
    const closing = scheduleCrisisHangup(state, NOW, 8000);
    expect(decideAlarm(closing, NOW + 1000, false)).toEqual({ action: "idle" });
    expect(decideAlarm(closing, NOW + 8000, true)).toEqual({ action: "hangup", reason: "interrupted" });
    const closed = closeObserverState(state, "completed", NOW);
    expect(decideAlarm(closed, NOW + 1000, false)).toEqual({ action: "idle" });
    expect(decideAlarm(closed, NOW + VOICE_BUFFER_RETENTION_MS, false)).toEqual({ action: "purge" });
  });

  it("pauses on a classifier failure, closes as retryable on the third and resumes after a success", () => {
    let state = armed();
    const outcomes = [];

    for (let index = 0; index < VOICE_SAFETY_FAILURES_BEFORE_CLOSE; index += 1) {
      const result = applySafetyOutcome(state, "fail_closed");
      state = result.state;
      outcomes.push(result.action);
    }

    expect(outcomes).toEqual(["paused", "paused", "closed_retryable"]);
    expect(state.closeReason).toBe("safety_unavailable");
    expect(state.muted).toBe(true);

    const paused = applySafetyOutcome(armed(), "fail_closed").state;
    const resumed = applySafetyOutcome(paused, "ok");
    expect(resumed.action).toBe("resumed");
    expect(resumed.state.muted).toBe(false);
    expect(resumed.state.safetyFailures).toBe(0);
    expect(applySafetyOutcome(resumed.state, "ok").action).toBe("none");
  });

  it("rate-limits constraint appends and appends the phase only when it changes", () => {
    const state = armed();

    expect(shouldAppendConstraints(state, NOW)).toBe(true);
    expect(shouldAppendConstraints({ ...state, constraintsAppendedAtMs: NOW }, NOW + 1000)).toBe(false);
    expect(
      shouldAppendConstraints({ ...state, constraintsAppendedAtMs: NOW }, NOW + VOICE_CONSTRAINTS_APPEND_INTERVAL_MS),
    ).toBe(true);
    expect(shouldAppendPhase(state, "opening")).toBe(true);
    expect(shouldAppendPhase({ ...state, lastPhase: "opening" }, "opening")).toBe(false);
    expect(shouldAppendPhase({ ...state, lastPhase: "opening" }, "closing")).toBe(true);
    expect(shouldAppendPhase(state, null)).toBe(false);
  });

  it("schedules the crisis hangup with the handoff grace and keeps the first close reason", () => {
    const crisis = scheduleCrisisHangup(armed(), NOW, 8000);

    expect(crisis).toMatchObject({ muted: true, pendingHangupAtMs: NOW + 8000, closeReason: "interrupted" });
    const closed = closeObserverState(crisis, "heartbeat_lost", NOW + 9000);
    expect(closed.closeReason).toBe("interrupted");
    expect(closed.closedAtMs).toBe(NOW + 9000);
    expect(closed.pendingHangupAtMs).toBeNull();
  });
});
