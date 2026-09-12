import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { SessionDataContext, VoiceQuota } from "@/lib/session-data/types";

// Domyślne zależności sięgają do `astro:env/server` (flaga, dostawca); atrapa
// pozwala sprawdzić także ścieżkę bez wstrzykiwania.
const env = vi.hoisted((): Record<string, string | undefined> => ({
  AI_PROVIDER: "openai",
  OPENAI_API_KEY: "sk-test",
  OPENROUTER_API_KEY: undefined,
  OPENROUTER_SAFETY_MODEL: undefined,
  OPENROUTER_SESSION_MODEL: undefined,
  OPENROUTER_SESSION_REASONING_EFFORT: undefined,
  OPENROUTER_SUMMARY_MODEL: undefined,
  OPENROUTER_TRANSCRIPTION_MODEL: undefined,
  VOICE_SESSION_MODE: "on",
  VOICE_MONTHLY_MINUTES: "120",
}));
vi.mock("astro:env/server", () => env);

import { isVoiceStartAvailable, resolveVoiceStart, type VoiceStartDependencies } from "../voice-start";

const context = { user: { id: "user-1" } } as SessionDataContext;
const now = new Date("2026-09-12T10:00:00.000Z");

const trialAvailable: VoiceQuota = { kind: "trial", plan: "free", available: true, durationSeconds: 600 };
const trialUsed: VoiceQuota = { kind: "trial", plan: "free", available: false, durationSeconds: 600 };

function pool(remainingSeconds: number): VoiceQuota {
  return {
    kind: "pool",
    plan: "premium",
    limitSeconds: 7200,
    usedSeconds: 7200 - remainingSeconds,
    remainingSeconds,
    canStartVoice: remainingSeconds >= 300,
    monthStartIso: "2026-09-01T00:00:00.000Z",
  };
}

function createDependencies(overrides: Partial<VoiceStartDependencies> = {}): VoiceStartDependencies {
  return {
    isVoiceSessionEnabled: () => true,
    getAiProviderName: () => "openai",
    getVoiceMonthlyMinutes: () => 120,
    readVoiceQuota: vi.fn(() => Promise.resolve(ok(trialAvailable))),
    ...overrides,
  };
}

describe("isVoiceStartAvailable", () => {
  it("needs the flag on and the direct OpenAI provider, treating a broken provider config as off", () => {
    expect(isVoiceStartAvailable(createDependencies())).toBe(true);
    expect(isVoiceStartAvailable(createDependencies({ isVoiceSessionEnabled: () => false }))).toBe(false);
    expect(isVoiceStartAvailable(createDependencies({ getAiProviderName: () => "openrouter" }))).toBe(false);
    expect(
      isVoiceStartAvailable(
        createDependencies({
          getAiProviderName: () => {
            throw new Error("invalid_ai_provider_configuration");
          },
        }),
      ),
    ).toBe(false);
  });

  it("reads the defaults from the server environment", () => {
    expect(isVoiceStartAvailable()).toBe(true);
    env.VOICE_SESSION_MODE = "off";
    expect(isVoiceStartAvailable()).toBe(false);
    env.VOICE_SESSION_MODE = "on";
    env.AI_PROVIDER = "openrouter";
    expect(isVoiceStartAvailable()).toBe(false);
    env.AI_PROVIDER = "openai";
  });
});

describe("resolveVoiceStart", () => {
  it("refuses before reading the pool when the feature is off", async () => {
    const dependencies = createDependencies({ isVoiceSessionEnabled: () => false });

    await expect(resolveVoiceStart(context, { plan: "free", now }, dependencies)).resolves.toEqual({
      ok: false,
      code: "voice_unavailable",
      status: 403,
    });
    expect(dependencies.readVoiceQuota).not.toHaveBeenCalled();
  });

  it("gives a free account its one 10-minute trial and refuses a second one", async () => {
    const dependencies = createDependencies();

    await expect(resolveVoiceStart(context, { plan: "free", now }, dependencies)).resolves.toEqual({
      ok: true,
      durationBucketSeconds: 600,
      durationSeconds: 600,
      expiresAt: new Date("2026-09-12T10:10:00.000Z"),
      quota: trialAvailable,
    });
    expect(dependencies.readVoiceQuota).toHaveBeenCalledWith(context, { limitMinutes: 120, now });

    await expect(
      resolveVoiceStart(
        context,
        { plan: "free", now },
        createDependencies({ readVoiceQuota: vi.fn(() => Promise.resolve(ok(trialUsed))) }),
      ),
    ).resolves.toEqual({ ok: false, code: "voice_trial_used", status: 403 });
  });

  it("keeps the premium bucket at an hour but trims the deadline to what is left in the pool", async () => {
    await expect(
      resolveVoiceStart(
        context,
        { plan: "premium", now },
        createDependencies({ readVoiceQuota: vi.fn(() => Promise.resolve(ok(pool(2700)))) }),
      ),
    ).resolves.toMatchObject({
      ok: true,
      durationBucketSeconds: 3600,
      durationSeconds: 2700,
      expiresAt: new Date("2026-09-12T10:45:00.000Z"),
    });
    await expect(
      resolveVoiceStart(
        context,
        { plan: "premium", now },
        createDependencies({ readVoiceQuota: vi.fn(() => Promise.resolve(ok(pool(7200)))) }),
      ),
    ).resolves.toMatchObject({ ok: true, durationSeconds: 3600 });
    await expect(
      resolveVoiceStart(
        context,
        { plan: "premium", now },
        createDependencies({ readVoiceQuota: vi.fn(() => Promise.resolve(ok(pool(240)))) }),
      ),
    ).resolves.toEqual({ ok: false, code: "voice_minutes_exhausted", status: 403 });
  });

  it("reports an unreadable pool as a retryable 503", async () => {
    await expect(
      resolveVoiceStart(
        context,
        { plan: "premium", now },
        createDependencies({ readVoiceQuota: vi.fn(() => Promise.resolve(sessionDataError("read_failed"))) }),
      ),
    ).resolves.toEqual({ ok: false, code: "session_quota_unavailable", status: 503 });
  });
});
