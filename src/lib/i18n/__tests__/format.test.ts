import { describe, expect, it } from "vitest";
import { formatDateTime, formatDay, formatTimeOfDay, getDayKey } from "../format";

const WARSAW = "Europe/Warsaw";
const NEW_YORK = "America/New_York";

// 2026-09-05T22:30Z = 2026-09-06 00:30 in Warsaw (CEST) and 2026-09-05 18:30
// in New York (EDT): the day key must follow the given zone, not UTC.
const LATE_EVENING = new Date("2026-09-05T22:30:00Z");

describe("format", () => {
  it("keys days in the given time zone regardless of locale", () => {
    expect(getDayKey(WARSAW, LATE_EVENING)).toBe("2026-09-06");
    expect(getDayKey(NEW_YORK, LATE_EVENING)).toBe("2026-09-05");
    expect(getDayKey(WARSAW, new Date("2026-01-10T12:00:00Z"))).toBe("2026-01-10");
  });

  it("formats days and times per locale in the given zone", () => {
    expect(formatDay("pl", WARSAW, LATE_EVENING)).toBe("6 wrz 2026");
    expect(formatDay("en", WARSAW, LATE_EVENING)).toBe("Sep 6, 2026");
    expect(formatTimeOfDay("pl", WARSAW, LATE_EVENING)).toBe("00:30");
    expect(formatTimeOfDay("en", WARSAW, LATE_EVENING)).toMatch(/^12:30\s?AM$/);
    // Ta sama chwila dla osoby w Nowym Jorku to jeszcze poprzedni wieczór.
    expect(formatDay("en", NEW_YORK, LATE_EVENING)).toBe("Sep 5, 2026");
    expect(formatTimeOfDay("en", NEW_YORK, LATE_EVENING)).toMatch(/^6:30\s?PM$/);
  });

  it("formats a full date-time per locale", () => {
    expect(formatDateTime("pl", WARSAW, LATE_EVENING)).toContain("6 wrz 2026");
    expect(formatDateTime("pl", WARSAW, LATE_EVENING)).toContain("00:30");
    expect(formatDateTime("en", WARSAW, LATE_EVENING)).toContain("Sep 6, 2026");
    expect(formatDateTime("en", WARSAW, LATE_EVENING)).toMatch(/12:30\s?AM/);
    expect(formatDateTime("en", NEW_YORK, LATE_EVENING)).toMatch(/Sep 5, 2026.*6:30\s?PM/);
  });
});
