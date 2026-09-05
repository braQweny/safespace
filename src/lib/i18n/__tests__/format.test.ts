import { describe, expect, it } from "vitest";
import { formatDateTime, formatDay, formatTimeOfDay, getDayKey } from "../format";

// 2026-09-05T22:30Z = 2026-09-06 00:30 in Warsaw (CEST): the day key must
// follow the session time zone, not UTC.
const LATE_EVENING = new Date("2026-09-05T22:30:00Z");

describe("format", () => {
  it("keys days in the session time zone regardless of locale", () => {
    expect(getDayKey(LATE_EVENING)).toBe("2026-09-06");
    expect(getDayKey(new Date("2026-01-10T12:00:00Z"))).toBe("2026-01-10");
  });

  it("formats days and times per locale", () => {
    expect(formatDay("pl", LATE_EVENING)).toBe("6 wrz 2026");
    expect(formatDay("en", LATE_EVENING)).toBe("Sep 6, 2026");
    expect(formatTimeOfDay("pl", LATE_EVENING)).toBe("00:30");
    expect(formatTimeOfDay("en", LATE_EVENING)).toMatch(/^12:30\s?AM$/);
  });

  it("formats a full date-time per locale", () => {
    expect(formatDateTime("pl", LATE_EVENING)).toContain("6 wrz 2026");
    expect(formatDateTime("pl", LATE_EVENING)).toContain("00:30");
    expect(formatDateTime("en", LATE_EVENING)).toContain("Sep 6, 2026");
    expect(formatDateTime("en", LATE_EVENING)).toMatch(/12:30\s?AM/);
  });
});
