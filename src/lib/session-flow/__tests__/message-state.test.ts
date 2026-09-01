import { describe, expect, it } from "vitest";
import {
  appendSuccessfulTurn,
  computeClientRemainingSeconds,
  computeServerClockOffsetMs,
  formatRemainingTime,
  isComposerAvailable,
  isTerminalSessionKind,
} from "../message-state";
import type { SessionView } from "../session-state";

const activeSession = {
  id: "session-1",
  status: "active",
  startedAt: "2026-06-07T10:00:00.000Z",
  endedAt: null,
  expiresAt: "2026-06-07T10:15:00.000Z",
  remainingSeconds: 120,
  isTrial: true,
  durationBucketSeconds: 900,
} satisfies SessionView;

describe("message-state timer helpers", () => {
  it("computes and formats remaining time from server timestamps", () => {
    expect(computeClientRemainingSeconds("2026-06-07T10:02:30.000Z", Date.parse("2026-06-07T10:01:00.000Z"))).toBe(90);
    expect(computeClientRemainingSeconds("2026-06-07T10:00:00.000Z", Date.parse("2026-06-07T10:01:00.000Z"))).toBe(0);
    expect(formatRemainingTime(900)).toBe("15:00");
    expect(formatRemainingTime(65)).toBe("01:05");
    expect(formatRemainingTime(null)).toBe("--:--");
  });

  /*
   * Serwer powiedział „zostało 600 s”, ale zegar klienta jest przestawiony o
   * pięć minut do przodu. Bez korekty odliczanie startowałoby od 300 s i
   * kończyło rozmowę w połowie; z korektą klient liczy tak jak serwer.
   */
  it("corrects a client clock that runs ahead of the server", () => {
    const expiresAt = "2026-06-07T10:15:00.000Z";
    const serverNowMs = Date.parse("2026-06-07T10:05:00.000Z");
    const clientNowMs = serverNowMs + 5 * 60 * 1000;

    const offsetMs = computeServerClockOffsetMs(expiresAt, 600, clientNowMs);

    expect(offsetMs).toBe(-5 * 60 * 1000);
    expect(computeClientRemainingSeconds(expiresAt, clientNowMs)).toBe(300);
    expect(computeClientRemainingSeconds(expiresAt, clientNowMs + offsetMs)).toBe(600);
    // Minutę później klient nadal liczy zegarem serwera.
    expect(computeClientRemainingSeconds(expiresAt, clientNowMs + 60_000 + offsetMs)).toBe(540);
  });

  it("corrects a client clock that runs behind the server", () => {
    const expiresAt = "2026-06-07T10:15:00.000Z";
    const serverNowMs = Date.parse("2026-06-07T10:14:00.000Z");
    const clientNowMs = serverNowMs - 10 * 60 * 1000;

    const offsetMs = computeServerClockOffsetMs(expiresAt, 60, clientNowMs);

    expect(computeClientRemainingSeconds(expiresAt, clientNowMs + offsetMs)).toBe(60);
  });

  it("falls back to no offset without server data", () => {
    expect(computeServerClockOffsetMs(null, 600, 0)).toBe(0);
    expect(computeServerClockOffsetMs("2026-06-07T10:15:00.000Z", null, 0)).toBe(0);
    expect(computeServerClockOffsetMs("not-a-date", 600, 0)).toBe(0);
  });

  it("keeps the composer open during a pending turn and closes it when the session is over", () => {
    expect(
      isComposerAvailable({
        session: activeSession,
        isHardStopped: false,
        isClientExpired: false,
      }),
    ).toBe(true);
    expect(
      isComposerAvailable({
        session: { ...activeSession, remainingSeconds: 0 },
        isHardStopped: false,
        isClientExpired: false,
      }),
    ).toBe(false);
    expect(
      isComposerAvailable({
        session: { ...activeSession, status: "expired" },
        isHardStopped: false,
        isClientExpired: false,
      }),
    ).toBe(false);
    expect(
      isComposerAvailable({
        session: activeSession,
        isHardStopped: true,
        isClientExpired: false,
      }),
    ).toBe(false);
    expect(
      isComposerAvailable({
        session: activeSession,
        isHardStopped: false,
        isClientExpired: true,
      }),
    ).toBe(false);
    expect(
      isComposerAvailable({
        session: null,
        isHardStopped: false,
        isClientExpired: false,
      }),
    ).toBe(false);
  });

  it("names the states a conversation never returns from", () => {
    expect(isTerminalSessionKind("completed")).toBe(true);
    expect(isTerminalSessionKind("expired")).toBe(true);
    expect(isTerminalSessionKind("interrupted")).toBe(true);
    expect(isTerminalSessionKind("active")).toBe(false);
    expect(isTerminalSessionKind("ready")).toBe(false);
  });

  it("keeps successful turn ordering stable", () => {
    expect(
      appendSuccessfulTurn(
        [
          {
            id: "message-0",
            role: "user",
            sequenceIndex: 0,
            content: "Pierwsza wiadomosc",
            createdAt: "2026-06-07T10:01:00.000Z",
          },
        ],
        {
          user: {
            id: "message-1",
            role: "user",
            sequenceIndex: 1,
            content: "Druga wiadomosc",
            createdAt: "2026-06-07T10:02:00.000Z",
          },
          assistant: {
            id: "message-2",
            role: "assistant",
            sequenceIndex: 2,
            content: "Odpowiedz",
            createdAt: "2026-06-07T10:02:01.000Z",
          },
        },
      ).map((message) => message.id),
    ).toEqual(["message-0", "message-1", "message-2"]);
  });
});
