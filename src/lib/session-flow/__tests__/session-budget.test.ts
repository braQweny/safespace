import { describe, expect, it } from "vitest";
import { FREE_TRIAL_DURATION_SECONDS as REEXPORTED } from "../session-state";
import {
  formatSessionBudgetCopy,
  formatSessionBudgetMinutes,
  FREE_TRIAL_DURATION_SECONDS,
  PREMIUM_SESSION_DURATION_SECONDS,
  resolveSessionDurationSeconds,
} from "../session-budget";

describe("session budget copy", () => {
  it("stays the single source for the session duration", () => {
    expect(REEXPORTED).toBe(FREE_TRIAL_DURATION_SECONDS);
    expect(FREE_TRIAL_DURATION_SECONDS).toBe(900);
    expect(PREMIUM_SESSION_DURATION_SECONDS).toBe(3600);
  });

  it("formats the budget in minutes without hard-coding fifteen", () => {
    expect(formatSessionBudgetMinutes()).toBe("15 min");
    expect(formatSessionBudgetMinutes(1800)).toBe("30 min");
    expect(formatSessionBudgetMinutes(30)).toBe("1 min");
    expect(formatSessionBudgetMinutes(PREMIUM_SESSION_DURATION_SECONDS)).toBe("60 min");
  });

  it("phrases the pre-start sentence with the right inflection", () => {
    expect(formatSessionBudgetCopy()).toBe("Każda rozmowa trwa do 15 minut — czas widzisz przez cały czas na ekranie.");
    expect(formatSessionBudgetCopy(60)).toContain("do 1 minuty");
    expect(formatSessionBudgetCopy(PREMIUM_SESSION_DURATION_SECONDS)).toContain("do 60 minut");
  });
});

describe("session budget per account plan", () => {
  it("gives premium accounts the longer conversation", () => {
    expect(resolveSessionDurationSeconds("premium")).toBe(PREMIUM_SESSION_DURATION_SECONDS);
    expect(resolveSessionDurationSeconds("free")).toBe(FREE_TRIAL_DURATION_SECONDS);
  });

  it("falls back to the free budget when the plan is unknown", () => {
    // Czytanie planu może paść (503 na trasie startu nie zawsze wyprzedza
    // copy). Krótsza rozmowa jest bezpieczniejszym domyślnym wyborem niż
    // obietnica godziny, do której konto nie ma prawa.
    expect(resolveSessionDurationSeconds(null)).toBe(FREE_TRIAL_DURATION_SECONDS);
    expect(resolveSessionDurationSeconds(undefined)).toBe(FREE_TRIAL_DURATION_SECONDS);
  });
});
