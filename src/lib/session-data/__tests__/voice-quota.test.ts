import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "../errors";
import {
  DEFAULT_VOICE_MONTHLY_MINUTES,
  VOICE_MIN_START_SECONDS,
  computeVoiceUsageSeconds,
  getUtcMonthStart,
  readVoiceQuota,
  toVoiceQuota,
  type VoiceQuotaRepository,
} from "../voice-quota";
import type { SessionDataContext, VoiceSessionTiming } from "../types";
import { VOICE_TRIAL_DURATION_SECONDS } from "@/lib/session-flow/session-budget";

const context = {} as SessionDataContext;
const now = new Date("2026-09-12T18:00:00.000Z");

function timing(overrides: Partial<VoiceSessionTiming> = {}): VoiceSessionTiming {
  return {
    voiceConnectedAt: "2026-09-12T17:00:00.000Z",
    endedAt: "2026-09-12T17:10:00.000Z",
    expiresAt: "2026-09-12T18:00:00.000Z",
    durationBucketSeconds: 3600,
    status: "completed",
    ...overrides,
  };
}

function createRepository(overrides: Partial<VoiceQuotaRepository> = {}): VoiceQuotaRepository {
  return {
    getOwnedAccountPlan: vi.fn(() => Promise.resolve(ok({ plan: "premium" as const, premiumGrantedAt: null }))),
    countOwnedVoiceSessions: vi.fn(() => Promise.resolve(ok(0))),
    listOwnedVoiceSessionTimings: vi.fn(() => Promise.resolve(ok([] as VoiceSessionTiming[]))),
    ...overrides,
  };
}

describe("getUtcMonthStart", () => {
  it("returns the first day of the month in UTC regardless of the local zone", () => {
    expect(getUtcMonthStart(new Date("2026-09-30T23:59:59.000Z")).toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(getUtcMonthStart(new Date("2026-10-01T00:00:00.000Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("computeVoiceUsageSeconds", () => {
  it("counts a finished conversation from the audio connection to its end", () => {
    expect(computeVoiceUsageSeconds([timing()], now)).toBe(600);
  });

  it("counts a conversation still under way up to now, and an abandoned one up to its expiry", () => {
    const underWay = timing({ endedAt: null, expiresAt: "2026-09-12T19:00:00.000Z", status: "active" });
    expect(computeVoiceUsageSeconds([underWay], now)).toBe(3600);
    const abandoned = timing({ endedAt: null, expiresAt: "2026-09-12T17:30:00.000Z", status: "active" });
    expect(computeVoiceUsageSeconds([abandoned], now)).toBe(1800);
  });

  it("never exceeds the bucket and ignores rows without a usable connection time", () => {
    const stretched = timing({ endedAt: "2026-09-12T19:30:00.000Z", durationBucketSeconds: 600 });
    expect(computeVoiceUsageSeconds([stretched], now)).toBe(600);
    expect(computeVoiceUsageSeconds([timing({ voiceConnectedAt: "not-a-date" })], now)).toBe(0);
    expect(computeVoiceUsageSeconds([timing(), timing()], now)).toBe(1200);
  });
});

describe("toVoiceQuota", () => {
  it("gives a free account exactly one trial that any owned voice row consumes", () => {
    const monthStart = getUtcMonthStart(now);
    expect(toVoiceQuota("free", { voiceSessionsOwned: 0, usedSeconds: 0, limitMinutes: 120, monthStart })).toEqual({
      kind: "trial",
      plan: "free",
      available: true,
      durationSeconds: VOICE_TRIAL_DURATION_SECONDS,
    });
    expect(
      toVoiceQuota("free", { voiceSessionsOwned: 1, usedSeconds: 0, limitMinutes: 120, monthStart }).kind === "trial" &&
        toVoiceQuota("free", { voiceSessionsOwned: 1, usedSeconds: 0, limitMinutes: 120, monthStart }),
    ).toMatchObject({ available: false });
  });

  it("gives a premium account a monthly pool that needs the minimum to start", () => {
    const monthStart = getUtcMonthStart(now);
    const pool = toVoiceQuota("premium", { voiceSessionsOwned: 3, usedSeconds: 6900, limitMinutes: 120, monthStart });

    expect(pool).toEqual({
      kind: "pool",
      plan: "premium",
      limitSeconds: 7200,
      usedSeconds: 6900,
      remainingSeconds: 300,
      canStartVoice: true,
      monthStartIso: "2026-09-01T00:00:00.000Z",
    });
    expect(VOICE_MIN_START_SECONDS).toBe(300);
    expect(
      toVoiceQuota("premium", { voiceSessionsOwned: 3, usedSeconds: 6901, limitMinutes: 120, monthStart }),
    ).toMatchObject({ remainingSeconds: 299, canStartVoice: false });
    expect(
      toVoiceQuota("premium", { voiceSessionsOwned: 0, usedSeconds: 99_999, limitMinutes: 120, monthStart }),
    ).toMatchObject({ remainingSeconds: 0, canStartVoice: false });
  });
});

describe("readVoiceQuota", () => {
  it("reads only the voice row count for a free account", async () => {
    const repository = createRepository({
      getOwnedAccountPlan: vi.fn(() => Promise.resolve(ok({ plan: "free" as const, premiumGrantedAt: null }))),
      countOwnedVoiceSessions: vi.fn(() => Promise.resolve(ok(1))),
    });

    await expect(readVoiceQuota(context, { limitMinutes: 120, now }, repository)).resolves.toEqual({
      ok: true,
      data: { kind: "trial", plan: "free", available: false, durationSeconds: VOICE_TRIAL_DURATION_SECONDS },
    });
    expect(repository.listOwnedVoiceSessionTimings).not.toHaveBeenCalled();
  });

  it("reads this month's timings for a premium account and sums them", async () => {
    const repository = createRepository({
      listOwnedVoiceSessionTimings: vi.fn(() => Promise.resolve(ok([timing(), timing()]))),
    });

    const result = await readVoiceQuota(context, { limitMinutes: DEFAULT_VOICE_MONTHLY_MINUTES, now }, repository);

    expect(result).toEqual({
      ok: true,
      data: {
        kind: "pool",
        plan: "premium",
        limitSeconds: 7200,
        usedSeconds: 1200,
        remainingSeconds: 6000,
        canStartVoice: true,
        monthStartIso: "2026-09-01T00:00:00.000Z",
      },
    });
    expect(repository.listOwnedVoiceSessionTimings).toHaveBeenCalledWith(context, "2026-09-01T00:00:00.000Z");
    expect(repository.countOwnedVoiceSessions).not.toHaveBeenCalled();
  });

  it("passes read failures through as stable codes", async () => {
    const repository = createRepository({
      getOwnedAccountPlan: vi.fn(() => Promise.resolve(sessionDataError("read_failed"))),
    });

    await expect(readVoiceQuota(context, { limitMinutes: 120, now }, repository)).resolves.toEqual({
      ok: false,
      error: { code: "read_failed" },
    });
  });
});
