import { describe, expect, it } from "vitest";
import { FREE_TRIAL_DURATION_SECONDS as REEXPORTED } from "../session-state";
import { formatSessionBudgetCopy, formatSessionBudgetMinutes, FREE_TRIAL_DURATION_SECONDS } from "../session-budget";

describe("session budget copy", () => {
  it("stays the single source for the session duration", () => {
    expect(REEXPORTED).toBe(FREE_TRIAL_DURATION_SECONDS);
    expect(FREE_TRIAL_DURATION_SECONDS).toBe(900);
  });

  it("formats the budget in minutes without hard-coding fifteen", () => {
    expect(formatSessionBudgetMinutes()).toBe("15 min");
    expect(formatSessionBudgetMinutes(1800)).toBe("30 min");
    expect(formatSessionBudgetMinutes(30)).toBe("1 min");
  });

  it("phrases the pre-start sentence with the right inflection", () => {
    expect(formatSessionBudgetCopy()).toBe("Każda rozmowa trwa do 15 minut — czas widzisz przez cały czas na ekranie.");
    expect(formatSessionBudgetCopy(60)).toContain("do 1 minuty");
  });
});
