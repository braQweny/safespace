import { describe, expect, it } from "vitest";
import type { SessionQuota } from "@/lib/session-data/types";
import {
  formatPlanName,
  formatRemainingFreeSessions,
  formatSessionAllowance,
  formatVoiceAllowance,
  formatVoiceMinutesRemaining,
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

describe("voice allowance copy", () => {
  const trial = { kind: "trial" as const, plan: "free" as const, available: true, durationSeconds: 600 as const };

  function pool(remainingSeconds: number, limitSeconds = 7200) {
    return {
      kind: "pool" as const,
      plan: "premium" as const,
      limitSeconds,
      usedSeconds: limitSeconds - remainingSeconds,
      remainingSeconds,
      canStartVoice: remainingSeconds >= 300,
      monthStartIso: "2026-09-01T00:00:00.000Z",
    };
  }

  it("describes the free trial before and after use, in both languages", () => {
    expect(formatVoiceAllowance("pl", trial)).toBe("W planie bezpłatnym jest jedna rozmowa głosowa do 10 minut.");
    expect(formatVoiceAllowance("pl", { ...trial, available: false })).toBe(
      "Bezpłatna rozmowa głosowa została wykorzystana. Plan premium ma miesięczną pulę minut głosowych.",
    );
    expect(formatVoiceAllowance("en", trial)).toBe(
      "One voice conversation of up to 10 minutes is included in the free plan.",
    );
    expect(formatVoiceMinutesRemaining("pl", trial)).toBeNull();
    expect(formatVoiceMinutesRemaining("pl", null)).toBeNull();
  });

  it("counts whole minutes of the premium pool with Polish plural forms", () => {
    expect(formatVoiceAllowance("pl", pool(4500))).toBe("Wykorzystano 45 minut z 120 minut głosowych w tym miesiącu.");
    expect(formatVoiceAllowance("en", pool(4500))).toBe("Used 45 minutes of 120 voice minutes this month.");
    expect(formatVoiceMinutesRemaining("pl", pool(4500))).toBe(
      "Zostało 75 minut z 120 minut głosowych w tym miesiącu.",
    );
    expect(formatVoiceMinutesRemaining("pl", pool(1320))).toBe(
      "Zostały 22 minuty z 120 minut głosowych w tym miesiącu.",
    );
    expect(formatVoiceMinutesRemaining("pl", pool(300))).toBe("Zostało 5 minut z 120 minut głosowych w tym miesiącu.");
    expect(formatVoiceMinutesRemaining("pl", pool(720))).toBe("Zostało 12 minut z 120 minut głosowych w tym miesiącu.");
    expect(formatVoiceMinutesRemaining("en", pool(360))).toBe("6 minutes of 120 voice minutes left this month.");
    expect(formatVoiceMinutesRemaining("en", pool(7200, 3600))).toBe("60 minutes of 60 voice minutes left this month.");
    // Pula poniżej progu startu nie obiecuje minut; zdanie o wyczerpaniu stoi osobno.
    expect(formatVoiceMinutesRemaining("pl", pool(120))).toBeNull();
    expect(getPlanCopy("pl").voiceMinutesExhausted).toContain("Odnowi się");
  });
});
