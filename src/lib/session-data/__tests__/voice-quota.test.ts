import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "../errors";
import {
  DEFAULT_VOICE_MONTHLY_MINUTES,
  VOICE_MIN_START_SECONDS,
  getUtcMonthStart,
  readVoiceConnectAllowance,
  readVoiceQuota,
  toCommittedVoiceSeconds,
  toVoiceConnectAllowance,
  toVoiceQuota,
  type VoiceQuotaRepository,
} from "../voice-quota";
import type { SessionDataContext, VoiceUsage } from "../types";
import { VOICE_TRIAL_DURATION_SECONDS } from "@/lib/session-flow/session-budget";

const context = {} as SessionDataContext;
const now = new Date("2026-09-12T18:00:00.000Z");

function usage(usedSeconds: number, reservedSeconds = 0): VoiceUsage {
  return { usedSeconds, reservedSeconds };
}

function createRepository(overrides: Partial<VoiceQuotaRepository> = {}): VoiceQuotaRepository {
  return {
    getOwnedAccountPlan: vi.fn(() => Promise.resolve(ok({ plan: "premium" as const, premiumGrantedAt: null }))),
    countOwnedVoiceSessions: vi.fn(() => Promise.resolve(ok(0))),
    readOwnedVoiceUsage: vi.fn(() => Promise.resolve(ok(usage(0)))),
    ...overrides,
  };
}

describe("getUtcMonthStart", () => {
  it("returns the first day of the month in UTC regardless of the local zone", () => {
    expect(getUtcMonthStart(new Date("2026-09-30T23:59:59.000Z")).toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(getUtcMonthStart(new Date("2026-10-01T00:00:00.000Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("toCommittedVoiceSeconds", () => {
  it("adds what was spoken to what running conversations may still spend and ignores nonsense", () => {
    expect(toCommittedVoiceSeconds(usage(600, 1800))).toBe(2400);
    expect(toCommittedVoiceSeconds(usage(-5, 12.9))).toBe(12);
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
      reservedSeconds: 0,
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
    // A running conversation's reservation leaves the pool without counting as used.
    expect(
      toVoiceQuota("premium", {
        voiceSessionsOwned: 1,
        usedSeconds: 300,
        reservedSeconds: 3300,
        limitMinutes: 120,
        monthStart,
      }),
    ).toMatchObject({ usedSeconds: 300, reservedSeconds: 3300, remainingSeconds: 3600, canStartVoice: true });
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
    expect(repository.readOwnedVoiceUsage).not.toHaveBeenCalled();
  });

  it("reads this month's usage for a premium account, counting running conversations as reserved", async () => {
    const repository = createRepository({
      readOwnedVoiceUsage: vi.fn(() => Promise.resolve(ok(usage(1200, 600)))),
    });

    const result = await readVoiceQuota(context, { limitMinutes: DEFAULT_VOICE_MONTHLY_MINUTES, now }, repository);

    expect(result).toEqual({
      ok: true,
      data: {
        kind: "pool",
        plan: "premium",
        limitSeconds: 7200,
        usedSeconds: 1200,
        reservedSeconds: 600,
        remainingSeconds: 5400,
        canStartVoice: true,
        monthStartIso: "2026-09-01T00:00:00.000Z",
      },
    });
    // No conversation to exclude at start: every running one holds its minutes.
    expect(repository.readOwnedVoiceUsage).toHaveBeenCalledWith(context, "2026-09-01T00:00:00.000Z");
    expect(repository.countOwnedVoiceSessions).not.toHaveBeenCalled();
  });

  it("passes read failures through as stable codes", async () => {
    const planFailed = createRepository({
      getOwnedAccountPlan: vi.fn(() => Promise.resolve(sessionDataError("read_failed"))),
    });

    await expect(readVoiceQuota(context, { limitMinutes: 120, now }, planFailed)).resolves.toEqual({
      ok: false,
      error: { code: "read_failed" },
    });

    const usageFailed = createRepository({
      readOwnedVoiceUsage: vi.fn(() => Promise.resolve(sessionDataError("read_failed"))),
    });

    await expect(readVoiceQuota(context, { limitMinutes: 120, now }, usageFailed)).resolves.toEqual({
      ok: false,
      error: { code: "read_failed" },
    });
  });
});

describe("toVoiceConnectAllowance", () => {
  const nowMs = now.getTime();
  const expiresAtMs = nowMs + 30 * 60_000;

  it("keeps the conversation's own deadline while the pool covers it", () => {
    expect(
      toVoiceConnectAllowance({
        kind: "pool",
        limitSeconds: 7200,
        usage: usage(600),
        sessionExpiresAtMs: expiresAtMs,
        nowMs,
      }),
    ).toEqual({ ok: true, deadlineAtMs: expiresAtMs, remainingSeconds: 6600 });
  });

  it("cuts the observer deadline to what the pool still holds after other running conversations", () => {
    expect(
      toVoiceConnectAllowance({
        kind: "pool",
        limitSeconds: 7200,
        usage: usage(3600, 3000),
        sessionExpiresAtMs: expiresAtMs,
        nowMs,
      }),
    ).toEqual({ ok: true, deadlineAtMs: nowMs + 600_000, remainingSeconds: 600 });
  });

  it("refuses a pool that holds no more than the observer's deadline reserve, before any paid session", () => {
    const base = { kind: "pool" as const, limitSeconds: 7200, sessionExpiresAtMs: expiresAtMs, nowMs };

    expect(toVoiceConnectAllowance({ ...base, usage: usage(7200 - 15) })).toEqual({
      ok: false,
      code: "voice_minutes_exhausted",
    });
    expect(toVoiceConnectAllowance({ ...base, usage: usage(7200 - 1) })).toEqual({
      ok: false,
      code: "voice_minutes_exhausted",
    });
    expect(
      toVoiceConnectAllowance({
        ...base,
        kind: "trial",
        limitSeconds: VOICE_TRIAL_DURATION_SECONDS,
        usage: usage(590),
      }),
    ).toEqual({ ok: false, code: "voice_trial_used" });
    expect(toVoiceConnectAllowance({ ...base, usage: usage(7200 - 16) })).toEqual({
      ok: true,
      deadlineAtMs: nowMs + 16_000,
      remainingSeconds: 16,
    });
  });

  it("refuses an empty pool with the start path's code and a spent trial with the trial code", () => {
    expect(
      toVoiceConnectAllowance({
        kind: "pool",
        limitSeconds: 7200,
        usage: usage(7000, 200),
        sessionExpiresAtMs: expiresAtMs,
        nowMs,
      }),
    ).toEqual({ ok: false, code: "voice_minutes_exhausted" });
    expect(
      toVoiceConnectAllowance({
        kind: "trial",
        limitSeconds: VOICE_TRIAL_DURATION_SECONDS,
        usage: usage(9999),
        sessionExpiresAtMs: expiresAtMs,
        nowMs,
      }),
    ).toEqual({ ok: false, code: "voice_trial_used" });
  });
});

describe("readVoiceConnectAllowance", () => {
  const sessionId = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
  const expiresAtMs = now.getTime() + 50 * 60_000;
  const premiumOptions = {
    sessionId,
    sessionDurationBucketSeconds: 3600,
    sessionExpiresAtMs: expiresAtMs,
    limitMinutes: 120,
    now,
  };

  it("checks a premium account against this month's pool without reserving the conversation being connected", async () => {
    const repository = createRepository({
      readOwnedVoiceUsage: vi.fn(() => Promise.resolve(ok(usage(6000, 900)))),
    });

    await expect(readVoiceConnectAllowance(context, premiumOptions, repository)).resolves.toEqual({
      ok: true,
      data: { ok: true, deadlineAtMs: now.getTime() + 300_000, remainingSeconds: 300 },
    });
    expect(repository.readOwnedVoiceUsage).toHaveBeenCalledWith(context, "2026-09-01T00:00:00.000Z", sessionId);
  });

  it("keeps a premium-bucket conversation in the monthly pool after the plan was revoked", async () => {
    const repository = createRepository({
      getOwnedAccountPlan: vi.fn(() => Promise.resolve(ok({ plan: "free" as const, premiumGrantedAt: null }))),
      readOwnedVoiceUsage: vi.fn(() => Promise.resolve(ok(usage(7200)))),
    });

    await expect(readVoiceConnectAllowance(context, premiumOptions, repository)).resolves.toEqual({
      ok: true,
      data: { ok: false, code: "voice_minutes_exhausted" },
    });
    expect(repository.readOwnedVoiceUsage).toHaveBeenCalledWith(context, "2026-09-01T00:00:00.000Z", sessionId);
  });

  it("checks a premium account's trial-bucket conversation against the monthly pool too", async () => {
    const repository = createRepository({
      readOwnedVoiceUsage: vi.fn(() => Promise.resolve(ok(usage(7200)))),
    });

    await expect(
      readVoiceConnectAllowance(context, { ...premiumOptions, sessionDurationBucketSeconds: 600 }, repository),
    ).resolves.toEqual({ ok: true, data: { ok: false, code: "voice_minutes_exhausted" } });
  });

  it("gives a free account's trial-bucket conversation 600 seconds over the whole account history", async () => {
    const repository = createRepository({
      getOwnedAccountPlan: vi.fn(() => Promise.resolve(ok({ plan: "free" as const, premiumGrantedAt: null }))),
      readOwnedVoiceUsage: vi.fn(() => Promise.resolve(ok(usage(120)))),
    });

    await expect(
      readVoiceConnectAllowance(context, { ...premiumOptions, sessionDurationBucketSeconds: 600 }, repository),
    ).resolves.toEqual({
      ok: true,
      data: { ok: true, deadlineAtMs: now.getTime() + 480_000, remainingSeconds: 480 },
    });
    expect(repository.readOwnedVoiceUsage).toHaveBeenCalledWith(context, "1970-01-01T00:00:00.000Z", sessionId);
  });

  it("passes plan and usage read failures through instead of allowing the connection", async () => {
    const planFailed = createRepository({
      getOwnedAccountPlan: vi.fn(() => Promise.resolve(sessionDataError("read_failed"))),
    });

    await expect(readVoiceConnectAllowance(context, premiumOptions, planFailed)).resolves.toEqual({
      ok: false,
      error: { code: "read_failed" },
    });
    expect(planFailed.readOwnedVoiceUsage).not.toHaveBeenCalled();

    const usageFailed = createRepository({
      readOwnedVoiceUsage: vi.fn(() => Promise.resolve(sessionDataError("read_failed"))),
    });

    await expect(readVoiceConnectAllowance(context, premiumOptions, usageFailed)).resolves.toEqual({
      ok: false,
      error: { code: "read_failed" },
    });
  });
});
