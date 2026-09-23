import { describe, expect, it } from "vitest";
import type { AccountPlan, SessionQuota, VoiceQuota } from "@/lib/session-data/types";
import { VOICE_TRIAL_DURATION_SECONDS } from "@/lib/session-flow/session-budget";
import { formatAccountPlanRows, formatVoicePlanRow, formatWrittenPlanRow } from "../account-plan-summary";

/** Kształt z `readSessionQuota` (pula free: 3 rozmowy pisane), bez sięgania do repozytorium. */
function toSessionQuota(plan: AccountPlan, usedSessions: number): SessionQuota {
  if (plan === "premium") {
    return { plan, sessionLimit: null, usedSessions, remainingSessions: null, canStartSession: true };
  }

  const remainingSessions = Math.max(0, 3 - usedSessions);
  return { plan, sessionLimit: 3, usedSessions, remainingSessions, canStartSession: remainingSessions > 0 };
}

const freeTrial: VoiceQuota = {
  kind: "trial",
  plan: "free",
  available: true,
  durationSeconds: VOICE_TRIAL_DURATION_SECONDS,
};

function pool(overrides: Partial<Extract<VoiceQuota, { kind: "pool" }>> = {}): VoiceQuota {
  return {
    kind: "pool",
    plan: "premium",
    limitSeconds: 60 * 60,
    usedSeconds: 15 * 60,
    reservedSeconds: 0,
    remainingSeconds: 45 * 60,
    canStartVoice: true,
    monthStartIso: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("account plan rows", () => {
  it("shows what is left of the free written allowance with the plan's own conversation length", () => {
    expect(formatWrittenPlanRow("pl", toSessionQuota("free", 1))).toEqual({
      kind: "written",
      label: "Rozmowy pisane",
      value: "2 z 3 zostały · do 15 min",
    });
    expect(formatWrittenPlanRow("en", toSessionQuota("free", 1)).value).toBe("2 of 3 left · up to 15 min");
    // Czasownik zgadza się z liczbą.
    expect(formatWrittenPlanRow("pl", toSessionQuota("free", 2)).value).toBe("1 z 3 została · do 15 min");
    expect(formatWrittenPlanRow("pl", toSessionQuota("free", 0)).value).toBe("3 z 3 zostały · do 15 min");
  });

  it("says the free allowance is used up instead of counting below zero for legacy accounts", () => {
    expect(formatWrittenPlanRow("pl", toSessionQuota("free", 3)).value).toBe("wykorzystano 3 z 3 · do 15 min");
    expect(formatWrittenPlanRow("en", toSessionQuota("free", 19)).value).toBe("3 of 3 used · up to 15 min");
  });

  it("tells a premium account it has no cap and the 60-minute length, never the free 15", () => {
    const premium: SessionQuota = toSessionQuota("premium", 40);

    expect(formatWrittenPlanRow("pl", premium).value).toBe("bez limitu · do 60 min");
    expect(formatWrittenPlanRow("en", premium).value).toBe("unlimited · up to 60 min");
  });

  it("describes the free voice trial with its length from the quota, and says when it is used", () => {
    expect(formatVoicePlanRow("pl", freeTrial)).toEqual({
      kind: "voice",
      label: "Rozmowa głosowa",
      value: "1 próba · do 10 min",
    });
    expect(formatVoicePlanRow("en", freeTrial).value).toBe("1 trial · up to 10 min");
    expect(formatVoicePlanRow("pl", { ...freeTrial, available: false }).value).toBe("próba wykorzystana");
  });

  it("describes the premium monthly pool in whole minutes, with a running conversation's reservation apart", () => {
    expect(formatVoicePlanRow("pl", pool())).toEqual({
      kind: "voice",
      label: "Rozmowy głosowe",
      value: "45 z 60 min zostało w tym miesiącu",
    });
    expect(formatVoicePlanRow("en", pool()).value).toBe("45 of 60 min left this month");
    expect(formatVoicePlanRow("pl", pool({ remainingSeconds: 2 * 60 + 59 })).value).toBe(
      "2 z 60 min zostały w tym miesiącu",
    );

    const reserved = pool({ usedSeconds: 20 * 60, reservedSeconds: 10 * 60, remainingSeconds: 30 * 60 });
    expect(formatVoicePlanRow("pl", reserved).value).toBe(
      "30 z 60 min zostało w tym miesiącu · 10 min rezerwuje trwająca rozmowa",
    );
    expect(formatVoicePlanRow("en", reserved).value).toBe(
      "30 of 60 min left this month · 10 min held by a conversation in progress",
    );
  });

  it("follows the configured pool size instead of a fixed number", () => {
    const larger = pool({ limitSeconds: 120 * 60, usedSeconds: 0, remainingSeconds: 120 * 60 });

    expect(formatVoicePlanRow("en", larger).value).toBe("120 of 120 min left this month");
  });

  it("says the monthly pool is used up once nothing is left or reserved", () => {
    const empty = pool({ usedSeconds: 60 * 60, remainingSeconds: 0, canStartVoice: false });

    expect(formatVoicePlanRow("pl", empty).value).toBe("pula na ten miesiąc wykorzystana");
    expect(formatVoicePlanRow("en", empty).value).toBe("this month's minutes are used up");
  });

  it("adds the voice row only when a voice quota was read", () => {
    const quota = toSessionQuota("free", 0);

    expect(formatAccountPlanRows("pl", quota, null).map((row) => row.kind)).toEqual(["written"]);
    expect(formatAccountPlanRows("pl", quota, freeTrial).map((row) => row.kind)).toEqual(["written", "voice"]);
  });
});
