import { describe, expect, it } from "vitest";
import {
  appendSuccessfulTurn,
  computeClientRemainingSeconds,
  formatRemainingTime,
  isComposerAvailable,
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

  it("disables the composer when pending, expired, hard-stopped, or not active", () => {
    expect(
      isComposerAvailable({
        session: activeSession,
        isPending: false,
        isHardStopped: false,
        isClientExpired: false,
      }),
    ).toBe(true);
    expect(
      isComposerAvailable({
        session: activeSession,
        isPending: true,
        isHardStopped: false,
        isClientExpired: false,
      }),
    ).toBe(false);
    expect(
      isComposerAvailable({
        session: { ...activeSession, remainingSeconds: 0 },
        isPending: false,
        isHardStopped: false,
        isClientExpired: false,
      }),
    ).toBe(false);
    expect(
      isComposerAvailable({
        session: { ...activeSession, status: "expired" },
        isPending: false,
        isHardStopped: false,
        isClientExpired: false,
      }),
    ).toBe(false);
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
