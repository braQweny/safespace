import { describe, expect, it } from "vitest";
import type { SessionQuota } from "@/lib/session-data/types";
import {
  formatPlanName,
  formatRemainingFreeSessions,
  formatSessionAllowance,
  getPlanCopy,
  getPremiumSupportMailtoHref,
} from "../plan-copy";

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

describe("plan copy (pl)", () => {
  it("names the plan in user language", () => {
    expect(formatPlanName("pl", "free")).toBe("Plan bezpłatny");
    expect(formatPlanName("pl", "premium")).toBe("Plan premium");
  });

  it("describes the allowance for free and premium accounts", () => {
    expect(formatSessionAllowance("pl", freeQuota)).toBe("Wykorzystano 1 z 3 bezpłatnych rozmów.");
    expect(
      formatSessionAllowance("pl", { ...freeQuota, usedSessions: 3, remainingSessions: 0, canStartSession: false }),
    ).toBe("Wykorzystano 3 z 3 bezpłatnych rozmów.");
    expect(
      formatSessionAllowance("pl", { ...freeQuota, usedSessions: 19, remainingSessions: 0, canStartSession: false }),
    ).toBe("Wykorzystano 3 z 3 bezpłatnych rozmów.");
    expect(formatSessionAllowance("pl", premiumQuota)).toBe("Bez limitu liczby rozmów.");
  });

  it("keeps the remaining-sessions line for free accounts only", () => {
    expect(formatRemainingFreeSessions("pl", null)).toBeNull();
    expect(formatRemainingFreeSessions("pl", premiumQuota)).toBeNull();
    expect(
      formatRemainingFreeSessions("pl", { ...freeQuota, remainingSessions: 0, canStartSession: false }),
    ).toBeNull();
    expect(formatRemainingFreeSessions("pl", { ...freeQuota, usedSessions: 2, remainingSessions: 1 })).toBe(
      "To ostatnia z 3 bezpłatnych rozmów.",
    );
    expect(formatRemainingFreeSessions("pl", freeQuota)).toBe("Zostały 2 z 3 bezpłatnych rozmów.");
  });

  it("tells the user premium is granted by hand, not bought in-app", () => {
    expect(getPlanCopy("pl").premiumHowTo).toContain("przyznaje go ręcznie zespół SafeSpace");
  });
});

describe("plan copy (en)", () => {
  it("phrases the plan, allowance and remaining line in English", () => {
    expect(formatPlanName("en", "free")).toBe("Free plan");
    expect(formatPlanName("en", "premium")).toBe("Premium plan");
    expect(formatSessionAllowance("en", freeQuota)).toBe("Used 1 of 3 free conversations.");
    expect(formatSessionAllowance("en", premiumQuota)).toBe("No limit on the number of conversations.");
    expect(formatRemainingFreeSessions("en", { ...freeQuota, usedSessions: 2, remainingSessions: 1 })).toBe(
      "This is the last of 3 free conversations.",
    );
    expect(formatRemainingFreeSessions("en", freeQuota)).toBe("2 of 3 free conversations left.");
    expect(getPlanCopy("en").premiumHowTo).toContain("grants it by hand");
  });

  it("builds the premium mailto with a localized subject", () => {
    expect(getPremiumSupportMailtoHref("pl", "mailto:pomoc@example.org")).toBe(
      `mailto:pomoc@example.org?subject=${encodeURIComponent("SafeSpace — dostęp do planu premium")}`,
    );
    expect(getPremiumSupportMailtoHref("en", "mailto:pomoc@example.org")).toBe(
      `mailto:pomoc@example.org?subject=${encodeURIComponent("SafeSpace — premium plan access")}`,
    );
  });
});
