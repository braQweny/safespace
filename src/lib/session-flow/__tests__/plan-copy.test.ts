import { describe, expect, it } from "vitest";
import type { SessionQuota } from "@/lib/session-data/types";
import { formatPlanName, formatRemainingFreeSessions, formatSessionAllowance, PREMIUM_HOW_TO_COPY } from "../plan-copy";

const freeQuota: SessionQuota = {
  plan: "free",
  sessionLimit: 3,
  usedSessions: 1,
  remainingSessions: 2,
  canStartSession: true,
};

const premiumQuota: SessionQuota = {
  plan: "premium",
  sessionLimit: null,
  usedSessions: 7,
  remainingSessions: null,
  canStartSession: true,
};

describe("plan copy", () => {
  it("names the plan in user language", () => {
    expect(formatPlanName("free")).toBe("Plan bezpłatny");
    expect(formatPlanName("premium")).toBe("Plan premium");
  });

  it("describes the allowance for free and premium accounts", () => {
    expect(formatSessionAllowance(freeQuota)).toBe("Wykorzystano 1 z 3 bezpłatnych rozmów.");
    expect(
      formatSessionAllowance({ ...freeQuota, usedSessions: 3, remainingSessions: 0, canStartSession: false }),
    ).toBe("Wykorzystano 3 z 3 bezpłatnych rozmów.");
    expect(
      formatSessionAllowance({ ...freeQuota, usedSessions: 19, remainingSessions: 0, canStartSession: false }),
    ).toBe("Wykorzystano 3 z 3 bezpłatnych rozmów.");
    expect(formatSessionAllowance(premiumQuota)).toBe("Bez limitu liczby rozmów.");
  });

  it("keeps the remaining-sessions line for free accounts only", () => {
    expect(formatRemainingFreeSessions(null)).toBeNull();
    expect(formatRemainingFreeSessions(premiumQuota)).toBeNull();
    expect(formatRemainingFreeSessions({ ...freeQuota, remainingSessions: 0, canStartSession: false })).toBeNull();
    expect(formatRemainingFreeSessions({ ...freeQuota, usedSessions: 2, remainingSessions: 1 })).toBe(
      "To ostatnia z 3 bezpłatnych rozmów.",
    );
    expect(formatRemainingFreeSessions(freeQuota)).toBe("Zostały 2 z 3 bezpłatnych rozmów.");
  });

  it("tells the user premium is granted by hand, not bought in-app", () => {
    expect(PREMIUM_HOW_TO_COPY).toContain("przyznaje go ręcznie zespół SafeSpace");
  });
});
