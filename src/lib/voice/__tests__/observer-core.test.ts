import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

vi.mock("astro:env/server", () => ({}));

import type { LiveSideband, LiveSidebandCommand } from "@/lib/openai/live";
import { ProviderSafetyError, type ProviderSafetyDecision } from "@/lib/session-safety/provider";
import type { SessionSafetyInput } from "@/lib/session-safety/types";
import {
  VOICE_DEADLINE_RESERVE_MS,
  VOICE_HANDOFF_GRACE_MS,
  VOICE_HEARTBEAT_GRACE_MS,
  VOICE_SIDEBAND_ROTATION_MS,
} from "../constants";
import { VoiceObserverCore, type VoiceObserverDeps } from "../observer-core";
import { createMemoryVoiceObserverStore } from "../observer-store";

const NOW = 1_800_000_000_000;
const LIVE_ID = "live_u2_secret";

interface FakeSideband extends LiveSideband {
  sent: LiveSidebandCommand[];
  emit(event: Record<string, unknown>): void;
  closed: boolean;
}

function createFakeSideband(): FakeSideband {
  const eventListeners: ((raw: string) => void)[] = [];
  const closeListeners: (() => void)[] = [];
  const sideband: FakeSideband = {
    sent: [],
    closed: false,
    get open() {
      return !sideband.closed;
    },
    send: (command) => {
      sideband.sent.push(command);
      return Promise.resolve("acknowledged" as const);
    },
    onEvent: (listener) => {
      eventListeners.push(listener);
    },
    onClose: (listener) => {
      closeListeners.push(listener);
    },
    close: () => {
      if (!sideband.closed) {
        sideband.closed = true;
        for (const listener of closeListeners) listener();
      }
    },
    emit: (event) => {
      for (const listener of eventListeners) listener(JSON.stringify(event));
    },
  };
  return sideband;
}

function commandContent(command: LiveSidebandCommand | undefined) {
  return command && "content" in command ? command.content : "";
}

function createHarness() {
  let clock = NOW;
  const timers: { id: number; at: number; callback: () => void }[] = [];
  let timerId = 0;
  let uuid = 0;
  const sidebands: FakeSideband[] = [];
  const decisions: (ProviderSafetyDecision | Error)[] = [];
  const store = createMemoryVoiceObserverStore();
  const openSideband = vi.fn((_liveSessionId: string) => {
    const sideband = createFakeSideband();
    sidebands.push(sideband);
    return Promise.resolve<LiveSideband>(sideband);
  });
  const hangup = vi.fn((_liveSessionId: string) => Promise.resolve("closed" as const));
  const classify = vi.fn((_input: SessionSafetyInput) => {
    const next = decisions.shift() ?? { risk: "normal", action: "allow", reasonCode: "none_detected" };
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const scheduleAlarm = vi.fn((_atMs: number | null) => Promise.resolve());
  const deps: VoiceObserverDeps = {
    openSideband,
    hangup,
    safetyProvider: { classify },
    scheduleAlarm,
    now: () => clock,
    randomUUID: () => {
      uuid += 1;
      return `00000000-0000-4000-8000-${String(uuid).padStart(12, "0")}`;
    },
    setTimer: (callback, delayMs) => {
      timerId += 1;
      timers.push({ id: timerId, at: clock + delayMs, callback });
      return timerId;
    },
    clearTimer: (handle) => {
      const index = timers.findIndex((timer) => timer.id === handle);
      if (index >= 0) timers.splice(index, 1);
    },
  };
  const core = new VoiceObserverCore(store, deps);
  const flush = async () => {
    for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const advance = async (ms: number) => {
    clock += ms;
    for (const timer of [...timers].sort((a, b) => a.at - b.at)) {
      if (timer.at <= clock) {
        timers.splice(timers.indexOf(timer), 1);
        timer.callback();
      }
    }
    await flush();
  };
  const lastAlarm = () => scheduleAlarm.mock.calls.at(-1)?.[0];
  const arm = (liveSessionId = LIVE_ID) =>
    core.arm({ liveSessionId, startedAtMs: NOW, expiresAtMs: NOW + 600_000, locale: "pl", avatarName: "Lena" });
  const speak = (speaker: "user" | "assistant", text: string, startMs: number) => {
    sidebands[sidebands.length - 1].emit({
      type: speaker === "user" ? "session.input_transcript.delta" : "session.output_transcript.delta",
      delta: text,
      start_ms: startMs,
      end_ms: startMs + 200,
    });
  };
  return {
    core,
    store,
    mocks: { openSideband, hangup, classify, scheduleAlarm },
    sidebands,
    decisions,
    flush,
    advance,
    lastAlarm,
    arm,
    speak,
    clock: () => clock,
  };
}

describe("VoiceObserverCore", () => {
  let logSpy: MockInstance<typeof console.log>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("arms a new epoch, attaches the sideband and schedules the first alarm at the heartbeat grace", async () => {
    const harness = createHarness();
    const result = await harness.arm();

    expect(result).toEqual({ epoch: 1, deadlineAtMs: NOW + 600_000 - VOICE_DEADLINE_RESERVE_MS, observing: true });
    expect(harness.mocks.openSideband).toHaveBeenCalledWith(LIVE_ID);
    expect(harness.lastAlarm()).toBe(NOW + VOICE_HEARTBEAT_GRACE_MS);
    await expect(harness.core.getState()).resolves.toMatchObject({
      epoch: 1,
      live: true,
      closeReason: null,
      observing: true,
    });
  });

  it("buffers grouped utterances before classifying them and drains them to the owner in order", async () => {
    const harness = createHarness();
    await harness.arm();
    harness.speak("user", " Cześć", 1400);
    harness.speak("user", ". Źle sypiam", 2600);
    harness.speak("assistant", "Mhm", 3000);
    await harness.advance(1300);

    const drained = await harness.core.drain();
    expect(drained.utterances.map((row) => [row.role, row.content])).toEqual([
      ["user", "Cześć"],
      ["user", ". Źle sypiam"],
      ["assistant", "Mhm"],
    ]);
    expect(harness.mocks.classify).toHaveBeenCalledTimes(2);
    expect(harness.mocks.classify.mock.calls.at(-1)?.[0]).toMatchObject({
      currentUserMessage: ". Źle sypiam",
      recentUserMessages: ["Cześć"],
    });

    await harness.core.ack(drained.utterances.map((row) => row.ordinal));
    expect((await harness.core.drain()).utterances).toEqual([]);
    expect(harness.store.rows).toHaveLength(3);
  });

  it("appends the phase once and rate-limits caution constraints", async () => {
    const harness = createHarness();
    harness.decisions.push({ risk: "caution", action: "allow_with_constraints", reasonCode: "ambiguous_distress" });
    harness.decisions.push({ risk: "caution", action: "allow_with_constraints", reasonCode: "ambiguous_distress" });
    await harness.arm();
    harness.speak("user", "Boję się", 1000);
    await harness.advance(1300);
    harness.speak("user", "Nadal się boję", 4000);
    await harness.advance(1300);

    const sent = harness.sidebands[0].sent;
    const appends = sent.filter((command) => command.type === "session.instructions.append");
    expect(appends).toHaveLength(2);
    expect(commandContent(appends[0])).toContain("Rozmowa dopiero się zaczyna");
    expect(commandContent(appends[1])).toContain("Do końca tej rozmowy");
    expect(sent.some((command) => command.type === "session.input_audio.mute")).toBe(false);
  });

  it("hands the user over on a crisis: spoken handoff, muted input and a hangup after the grace", async () => {
    const harness = createHarness();
    harness.decisions.push({ risk: "crisis", action: "hard_stop", reasonCode: "self_harm_signal" });
    await harness.arm();
    harness.speak("user", "Nie chcę już żyć", 1000);
    await harness.advance(1300);

    expect(harness.sidebands[0].sent.map((command) => command.type)).toEqual([
      "session.commentary.append",
      "session.input_audio.mute",
    ]);
    expect(harness.lastAlarm()).toBe(harness.clock() + VOICE_HANDOFF_GRACE_MS);
    await expect(harness.core.getState()).resolves.toMatchObject({ live: false, closeReason: "interrupted" });
    expect(harness.mocks.hangup).not.toHaveBeenCalled();

    await harness.advance(VOICE_HANDOFF_GRACE_MS);
    await harness.core.alarm();
    expect(harness.mocks.hangup).toHaveBeenCalledWith(LIVE_ID);
    expect((await harness.core.drain()).closeReason).toBe("interrupted");
  });

  it("pauses the model when the classifier fails and closes the live session as retryable on the third failure", async () => {
    const harness = createHarness();
    harness.decisions.push(
      new ProviderSafetyError("provider_unavailable"),
      new ProviderSafetyError("provider_timeout"),
      new ProviderSafetyError("provider_unavailable"),
    );
    await harness.arm();
    harness.speak("user", "raz", 1000);
    await harness.advance(1300);
    expect(harness.sidebands[0].sent.map((command) => command.type)).toEqual([
      "session.input_audio.mute",
      "session.commentary.append",
    ]);
    await expect(harness.core.getState()).resolves.toMatchObject({ live: true, closeReason: null });

    harness.speak("user", "dwa", 4000);
    await harness.advance(1300);
    harness.speak("user", "trzy", 7000);
    await harness.advance(1300);
    expect(harness.sidebands[0].sent.at(-1)).toEqual({ type: "session.close" });
    expect(harness.mocks.hangup).toHaveBeenCalledWith(LIVE_ID);
    await expect(harness.core.getState()).resolves.toMatchObject({ live: false, closeReason: "safety_unavailable" });
  });

  it("resumes after a successful classification following a pause", async () => {
    const harness = createHarness();
    harness.decisions.push(new ProviderSafetyError("provider_unavailable"));
    await harness.arm();
    harness.speak("user", "raz", 1000);
    await harness.advance(1300);
    harness.speak("user", "dwa", 4000);
    await harness.advance(1300);

    const types = harness.sidebands[0].sent.map((command) => command.type);
    expect(types.slice(0, 2)).toEqual(["session.input_audio.mute", "session.commentary.append"]);
    expect(types.slice(2, 4)).toEqual(["session.input_audio.unmute", "session.commentary.append"]);
  });

  it("ignores a classification that resolves after a reconnect replaced the epoch", async () => {
    const harness = createHarness();
    const pendingDecision: { resolve: ((decision: ProviderSafetyDecision) => void) | null } = { resolve: null };
    harness.mocks.classify.mockImplementationOnce(
      () =>
        new Promise<ProviderSafetyDecision>((resolve) => {
          pendingDecision.resolve = resolve;
        }),
    );
    await harness.arm();
    harness.speak("user", "stara epoka", 1000);
    await harness.advance(1300);

    await harness.arm("live_next");
    expect(harness.mocks.hangup).toHaveBeenCalledWith(LIVE_ID);
    pendingDecision.resolve?.({ risk: "crisis", action: "hard_stop", reasonCode: "self_harm_signal" });
    await harness.flush();

    expect(harness.sidebands[1].sent).toEqual([]);
    await expect(harness.core.getState()).resolves.toMatchObject({ epoch: 2, live: true, closeReason: null });
  });

  it("hangs up on heartbeat loss and refreshes the grace on every beat", async () => {
    const harness = createHarness();
    await harness.arm();
    await harness.advance(VOICE_HEARTBEAT_GRACE_MS - 1000);
    await harness.core.beat();
    expect(harness.lastAlarm()).toBe(harness.clock() + VOICE_HEARTBEAT_GRACE_MS);

    await harness.advance(VOICE_HEARTBEAT_GRACE_MS);
    await harness.core.alarm();
    expect(harness.mocks.hangup).toHaveBeenCalledWith(LIVE_ID);
    await expect(harness.core.getState()).resolves.toMatchObject({ live: false, closeReason: "heartbeat_lost" });
    // A late beat after the close changes nothing.
    await expect(harness.core.beat()).resolves.toMatchObject({ closeReason: "heartbeat_lost" });
  });

  it("rotates the sideband at the rotation interval without losing the epoch", async () => {
    const harness = createHarness();
    await harness.core.arm({
      liveSessionId: LIVE_ID,
      startedAtMs: NOW,
      expiresAtMs: NOW + 3_600_000,
      locale: "pl",
      avatarName: "Lena",
    });
    await harness.advance(VOICE_SIDEBAND_ROTATION_MS - 1000);
    await harness.core.beat();
    await harness.advance(1000);
    await harness.core.alarm();

    expect(harness.mocks.openSideband).toHaveBeenCalledTimes(2);
    expect(harness.sidebands[0].closed).toBe(true);
    expect(harness.sidebands[1].closed).toBe(false);
    harness.speak("user", "po rotacji", 5000);
    await harness.advance(1300);
    expect((await harness.core.drain()).utterances.map((row) => row.content)).toEqual(["po rotacji"]);
  });

  it("records a provider-side close and flushes open utterances on our own hangup", async () => {
    const harness = createHarness();
    await harness.arm();
    harness.speak("assistant", "Do zobaczenia", 1000);
    harness.sidebands[0].emit({ type: "session.closed", reason: "close_requested", usage: { seconds: 31 } });
    await harness.flush();
    await expect(harness.core.getState()).resolves.toMatchObject({ live: false, closeReason: "provider_closed" });
    expect((await harness.core.drain()).utterances.map((row) => row.content)).toEqual(["Do zobaczenia"]);
    expect(harness.mocks.hangup).not.toHaveBeenCalled();

    const second = createHarness();
    await second.arm();
    second.speak("user", "ostatnie słowa", 1000);
    await second.core.hangupNow("completed");
    expect(second.mocks.hangup).toHaveBeenCalledWith(LIVE_ID);
    expect((await second.core.drain()).utterances.map((row) => row.content)).toEqual(["ostatnie słowa"]);
    expect(second.mocks.classify).not.toHaveBeenCalled();
  });

  it("never logs transcript text or the live session id", async () => {
    const harness = createHarness();
    harness.decisions.push({ risk: "crisis", action: "hard_stop", reasonCode: "self_harm_signal" });
    await harness.arm();
    harness.speak("user", "tajna treść", 1000);
    await harness.advance(1300);
    await harness.advance(VOICE_HANDOFF_GRACE_MS);
    await harness.core.alarm();

    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logged).toContain("session.voice_observer");
    expect(logged).toContain("session.safety_evaluated");
    expect(logged).toContain("session.voice_closed");
    expect(logged).toContain('"reasonCode":"interrupted"');
    expect(logged).not.toContain("tajna treść");
    expect(logged).not.toContain(LIVE_ID);
  });
});
