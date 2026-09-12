import { describe, expect, it } from "vitest";
import {
  VOICE_UTTERANCE_GAP_MS,
  VOICE_UTTERANCE_IDLE_MS,
  VOICE_UTTERANCE_MAX_CHARS,
  createVoiceTranscriptState,
  flushAllVoiceUtterances,
  flushIdleVoiceUtterances,
  nextIdleFlushAt,
  pushVoiceFragment,
  type VoiceTranscriptFragment,
  type VoiceTranscriptState,
} from "../voice-transcript";

function fragment(overrides: Partial<VoiceTranscriptFragment>): VoiceTranscriptFragment {
  return { speaker: "user", text: "", startMs: 0, endMs: 200, epoch: 1, ...overrides };
}

function feed(state: VoiceTranscriptState, fragments: readonly VoiceTranscriptFragment[], nowMs = 1000) {
  const closed = [];
  let next = state;

  for (const item of fragments) {
    const result = pushVoiceFragment(next, item, nowMs);
    next = result.state;
    closed.push(...result.closed);
  }

  return { state: next, closed };
}

describe("voice transcript grouping", () => {
  it("joins 200 ms fragments of one speaker without adding spaces (deltas carry their own)", () => {
    const { state, closed } = feed(createVoiceTranscriptState(), [
      fragment({ text: " Cześć", startMs: 1400, endMs: 1600 }),
      fragment({ text: ". Ź", startMs: 2600, endMs: 2800 }),
      fragment({ text: "le s", startMs: 2800, endMs: 3000 }),
      fragment({ text: "ypiam", startMs: 3000, endMs: 3200 }),
    ]);

    // The pause after "Cześć" (1000 ms) closes the first utterance.
    expect(closed).toEqual([{ speaker: "user", text: "Cześć", startMs: 1400, endMs: 1600, epoch: 1 }]);
    expect(flushAllVoiceUtterances(state).closed).toEqual([
      { speaker: "user", text: ". Źle sypiam", startMs: 2600, endMs: 3200, epoch: 1 },
    ]);
  });

  it("keeps the speakers' streams independent so an acknowledgement never cuts the user's sentence", () => {
    const { state, closed } = feed(createVoiceTranscriptState(), [
      fragment({ text: "Wczoraj", startMs: 1000, endMs: 1200 }),
      fragment({ speaker: "assistant", text: "Mhm", startMs: 1200, endMs: 1400 }),
      fragment({ text: " wieczorem", startMs: 1400, endMs: 1600 }),
      fragment({ speaker: "assistant", text: ", słucham", startMs: 1400, endMs: 1600 }),
    ]);

    expect(closed).toEqual([]);
    expect(flushAllVoiceUtterances(state).closed).toEqual([
      { speaker: "user", text: "Wczoraj wieczorem", startMs: 1000, endMs: 1600, epoch: 1 },
      { speaker: "assistant", text: "Mhm, słucham", startMs: 1200, endMs: 1600, epoch: 1 },
    ]);
  });

  it("drops duplicate fragments by (epoch, speaker, start) and starts a new stream after a reconnect", () => {
    const first = fragment({ text: "raz", startMs: 100, endMs: 300 });
    const { state, closed } = feed(createVoiceTranscriptState(), [
      first,
      first,
      fragment({ text: "dwa", startMs: 300, endMs: 500 }),
      // Reconnect: same timeline offsets, new epoch — never merged with the old stream.
      fragment({ text: "raz", startMs: 100, endMs: 300, epoch: 2 }),
    ]);

    expect(closed).toEqual([{ speaker: "user", text: "razdwa", startMs: 100, endMs: 500, epoch: 1 }]);
    expect(flushAllVoiceUtterances(state).closed).toEqual([
      { speaker: "user", text: "raz", startMs: 100, endMs: 300, epoch: 2 },
    ]);
  });

  it("closes an utterance at the gap threshold, the character cap and the idle flush", () => {
    const gap = feed(createVoiceTranscriptState(), [
      fragment({ text: "a", startMs: 0, endMs: 200 }),
      fragment({ text: "b", startMs: 200 + VOICE_UTTERANCE_GAP_MS, endMs: 1100 }),
    ]);
    expect(gap.closed.map((utterance) => utterance.text)).toEqual(["a"]);

    const long = feed(createVoiceTranscriptState(), [
      fragment({ text: "x".repeat(VOICE_UTTERANCE_MAX_CHARS), startMs: 0, endMs: 200 }),
      fragment({ text: "y", startMs: 200, endMs: 400 }),
    ]);
    expect(long.closed.map((utterance) => utterance.text.length)).toEqual([VOICE_UTTERANCE_MAX_CHARS]);

    const open = feed(createVoiceTranscriptState(), [fragment({ text: "cisza", startMs: 0, endMs: 200 })], 5000);
    expect(nextIdleFlushAt(open.state)).toBe(5000 + VOICE_UTTERANCE_IDLE_MS);
    expect(flushIdleVoiceUtterances(open.state, 5000 + VOICE_UTTERANCE_IDLE_MS - 1).closed).toEqual([]);
    const flushed = flushIdleVoiceUtterances(open.state, 5000 + VOICE_UTTERANCE_IDLE_MS);
    expect(flushed.closed.map((utterance) => utterance.text)).toEqual(["cisza"]);
    expect(nextIdleFlushAt(flushed.state)).toBeNull();
  });

  it("never emits an empty utterance and sorts a full flush by timeline", () => {
    const { state } = feed(createVoiceTranscriptState(), [
      fragment({ speaker: "assistant", text: "  ", startMs: 0, endMs: 200 }),
      fragment({ text: "późniejszy", startMs: 5000, endMs: 5200 }),
      fragment({ speaker: "assistant", text: "wcześniejszy", startMs: 4000, endMs: 4200 }),
    ]);

    expect(flushAllVoiceUtterances(state).closed.map((utterance) => utterance.text)).toEqual([
      "wcześniejszy",
      "późniejszy",
    ]);
  });
});
