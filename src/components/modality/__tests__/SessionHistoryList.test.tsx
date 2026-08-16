import { describe, expect, it } from "vitest";
import type { SessionHistoryListItem } from "@/lib/session-data/types";
import { formatDateTime, getDurationLabel } from "../SessionHistoryList";

function createItem(overrides: Partial<SessionHistoryListItem> = {}): SessionHistoryListItem {
  return {
    id: "session-1",
    status: "completed",
    startedAt: "2026-06-07T08:00:00.000Z",
    endedAt: "2026-06-07T08:12:00.000Z",
    expiresAt: "2026-06-07T08:15:00.000Z",
    durationBucketSeconds: 900,
    isTrial: true,
    createdAt: "2026-06-07T08:00:00.000Z",
    updatedAt: "2026-06-07T08:12:00.000Z",
    ...overrides,
  };
}

describe("getDurationLabel", () => {
  it("reports the real span instead of the privacy bucket", () => {
    // The bucket is always 900 for trials, so a two-minute conversation used to
    // be labelled "15 min".
    expect(getDurationLabel(createItem({ endedAt: "2026-06-07T08:02:00.000Z" }))).toBe("2 min rozmowy");
  });

  it("does not round a very short conversation up to a minute", () => {
    expect(getDurationLabel(createItem({ endedAt: "2026-06-07T08:00:20.000Z" }))).toBe("krócej niż minutę");
  });

  it("marks a bucket-only duration as an upper bound", () => {
    expect(getDurationLabel(createItem({ startedAt: null, endedAt: null }))).toBe("do 15 min");
  });

  it("falls back when neither a span nor a bucket is available", () => {
    expect(getDurationLabel(createItem({ startedAt: null, endedAt: null, durationBucketSeconds: null }))).toBe(
      "Czas nieustalony",
    );
  });
});

describe("formatDateTime", () => {
  const now = new Date("2026-06-07T20:00:00.000Z");

  it("labels same-day sessions as today", () => {
    expect(formatDateTime("2026-06-07T08:00:00.000Z", now)).toMatch(/^Dzisiaj, /);
  });

  it("labels the previous day as yesterday", () => {
    expect(formatDateTime("2026-06-06T08:00:00.000Z", now)).toMatch(/^Wczoraj, /);
  });

  it("keeps a full date for older sessions", () => {
    const label = formatDateTime("2026-05-30T08:00:00.000Z", now);

    expect(label).not.toMatch(/Dzisiaj|Wczoraj/);
    expect(label).toContain("2026");
  });

  it("stays safe on missing and unparsable timestamps", () => {
    expect(formatDateTime(null, now)).toBe("Brak daty");
    expect(formatDateTime("not-a-date", now)).toBe("Brak daty");
  });
});
