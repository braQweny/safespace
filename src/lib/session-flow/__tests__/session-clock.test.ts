import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isPastDeadline, parseTimestampMs, remainingMs, remainingSeconds } from "../session-clock";

const DEADLINE = "2026-06-07T10:15:00.000Z";
const DEADLINE_MS = Date.parse(DEADLINE);

describe("session clock", () => {
  it("parses only readable timestamps", () => {
    expect(parseTimestampMs(DEADLINE)).toBe(DEADLINE_MS);
    expect(parseTimestampMs(null)).toBeNull();
    expect(parseTimestampMs(undefined)).toBeNull();
    expect(parseTimestampMs("")).toBeNull();
    expect(parseTimestampMs("not a date")).toBeNull();
  });

  it("counts exact milliseconds and ceiling seconds, never below zero", () => {
    expect(remainingMs(DEADLINE, DEADLINE_MS - 1_500)).toBe(1_500);
    expect(remainingMs(DEADLINE, DEADLINE_MS + 5_000)).toBe(0);
    expect(remainingSeconds(DEADLINE, DEADLINE_MS - 1_001)).toBe(2);
    expect(remainingSeconds(DEADLINE, DEADLINE_MS - 1_000)).toBe(1);
    expect(remainingSeconds(DEADLINE, DEADLINE_MS - 1)).toBe(1);
    expect(remainingSeconds(DEADLINE, DEADLINE_MS + 5_000)).toBe(0);
    expect(remainingMs(null, DEADLINE_MS)).toBeNull();
    expect(remainingSeconds("", DEADLINE_MS)).toBeNull();
  });

  it("treats the deadline instant itself as past, and an unreadable deadline as never past", () => {
    expect(isPastDeadline(DEADLINE, DEADLINE_MS - 1)).toBe(false);
    expect(isPastDeadline(DEADLINE, DEADLINE_MS)).toBe(true);
    expect(isPastDeadline(DEADLINE, DEADLINE_MS + 1)).toBe(true);
    expect(isPastDeadline(null, DEADLINE_MS)).toBe(false);
    expect(isPastDeadline("garbage", DEADLINE_MS)).toBe(false);
  });

  // Dawne kopie pytały o termin na trzy sposoby: `ms <= 0` (time-limit),
  // „sekundy w górę <= 0” (session-state) i `expiresAt <= now` (historia,
  // podsumowania, głos). Wszystkie to ten sam predykat.
  it("keeps every former expiry formulation equivalent", () => {
    for (const offsetMs of [-60_000, -1_001, -1_000, -999, -1, 0, 1, 999, 1_000, 60_000]) {
      const nowMs = DEADLINE_MS + offsetMs;
      const past = isPastDeadline(DEADLINE, nowMs);

      expect(remainingMs(DEADLINE, nowMs) === 0, `ms, offset ${offsetMs}`).toBe(past);
      expect(remainingSeconds(DEADLINE, nowMs) === 0, `seconds, offset ${offsetMs}`).toBe(past);
    }
  });

  it("stays a leaf module so the client timer and voice reconcile can share it", () => {
    const source = readFileSync(resolve(__dirname, "../session-clock.ts"), "utf8");

    expect(source).not.toMatch(/^\s*import\s/m);
  });
});
