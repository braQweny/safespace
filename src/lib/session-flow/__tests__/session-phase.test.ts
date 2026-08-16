import { describe, expect, it } from "vitest";
import type { SessionMetadata } from "@/lib/session-data/types";
import { resolveSessionPhase } from "../session-phase";

const startedAtMs = Date.parse("2026-06-07T10:00:00.000Z");

function buildSession(overrides: Partial<SessionMetadata> = {}) {
  return {
    startedAt: new Date(startedAtMs).toISOString(),
    expiresAt: new Date(startedAtMs + 15 * 60_000).toISOString(),
    durationBucketSeconds: 900,
    createdAt: new Date(startedAtMs).toISOString(),
    ...overrides,
  } as Pick<SessionMetadata, "startedAt" | "expiresAt" | "durationBucketSeconds" | "createdAt">;
}

function at(minutesFromStart: number) {
  return new Date(startedAtMs + minutesFromStart * 60_000);
}

describe("resolveSessionPhase", () => {
  it("walks a 15-minute trial session through opening, middle, and closing", () => {
    const session = buildSession();

    expect(resolveSessionPhase(session, { now: at(1), priorMessageCount: 4 })).toBe("opening");
    expect(resolveSessionPhase(session, { now: at(7), priorMessageCount: 10 })).toBe("middle");
    expect(resolveSessionPhase(session, { now: at(13), priorMessageCount: 20 })).toBe("closing");
  });

  it("scales the same arc to a longer session instead of using fixed minute marks", () => {
    const session = buildSession({
      expiresAt: new Date(startedAtMs + 30 * 60_000).toISOString(),
      durationBucketSeconds: 1_800,
    });

    // 13 minutes in is the closing stretch of a 15-minute session but still the
    // working middle of a 30-minute one.
    expect(resolveSessionPhase(session, { now: at(2), priorMessageCount: 4 })).toBe("opening");
    expect(resolveSessionPhase(session, { now: at(7), priorMessageCount: 8 })).toBe("middle");
    expect(resolveSessionPhase(session, { now: at(13), priorMessageCount: 20 })).toBe("middle");
    expect(resolveSessionPhase(session, { now: at(26), priorMessageCount: 40 })).toBe("closing");
  });

  it("caps the closing stretch in absolute time so a long session does not wind down for a quarter of its length", () => {
    const session = buildSession({
      expiresAt: new Date(startedAtMs + 60 * 60_000).toISOString(),
      durationBucketSeconds: 3_600,
    });

    // A fraction-only rule would start closing 12 minutes out; the cap holds it to 5.
    expect(resolveSessionPhase(session, { now: at(50), priorMessageCount: 40 })).toBe("middle");
    expect(resolveSessionPhase(session, { now: at(56), priorMessageCount: 40 })).toBe("closing");
  });

  it("treats the very first exchange as the opening even when the clock has already moved on", () => {
    const session = buildSession();

    expect(resolveSessionPhase(session, { now: at(6), priorMessageCount: 0 })).toBe("opening");
  });

  it("still closes a nearly finished session even on the first exchange", () => {
    const session = buildSession();

    expect(resolveSessionPhase(session, { now: at(14), priorMessageCount: 0 })).toBe("closing");
  });

  it("derives the start from the deadline and budget when the session carries no start timestamp", () => {
    const session = buildSession({ startedAt: null });

    expect(resolveSessionPhase(session, { now: at(1), priorMessageCount: 4 })).toBe("opening");
    expect(resolveSessionPhase(session, { now: at(8), priorMessageCount: 10 })).toBe("middle");
    expect(resolveSessionPhase(session, { now: at(14), priorMessageCount: 20 })).toBe("closing");
  });

  it("returns null instead of guessing when the session has no usable time budget", () => {
    const session = buildSession({ startedAt: null, expiresAt: null, durationBucketSeconds: null });

    expect(resolveSessionPhase(session, { now: at(5), priorMessageCount: 6 })).toBeNull();
    expect(resolveSessionPhase(session, { now: at(5), priorMessageCount: 0 })).toBe("opening");
  });

  it("ignores an unparseable or inverted time budget", () => {
    expect(
      resolveSessionPhase(buildSession({ expiresAt: "not-a-timestamp" }), { now: at(5), priorMessageCount: 6 }),
    ).toBeNull();
    expect(
      resolveSessionPhase(buildSession({ expiresAt: new Date(startedAtMs - 60_000).toISOString() }), {
        now: at(5),
        priorMessageCount: 6,
      }),
    ).toBeNull();
  });

  it("keeps an overdue session in the closing phase rather than falling through to middle", () => {
    const session = buildSession();

    expect(resolveSessionPhase(session, { now: at(20), priorMessageCount: 20 })).toBe("closing");
  });
});
