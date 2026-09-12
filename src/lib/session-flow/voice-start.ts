import { getAiProviderName } from "@/lib/ai-provider/env";
import type { SessionDataResult } from "@/lib/session-data/errors";
import type { AccountPlan, SessionDataContext, VoiceQuota } from "@/lib/session-data/types";
import { readVoiceQuota } from "@/lib/session-data/voice-quota";
import { PREMIUM_SESSION_DURATION_SECONDS, resolveVoiceSessionDurationSeconds } from "./session-budget";
import { getVoiceMonthlyMinutes, isVoiceSessionEnabled } from "./voice-session-mode";

/**
 * Bramka startu rozmowy głosowej (pre-flight w `start-next`): flaga i
 * dostawca (tylko bezpośrednie OpenAI ma GPT-Live), potem pula — jedna próba
 * konta free albo miesięczna pula minut premium. Trigger `P0016` w bazie jest
 * prawdziwą bramką próby; pula premium jest egzekwowana tylko tutaj i przez
 * termin obserwatora, bo bez Workera nikt nie utworzy płatnej sesji live.
 */
export type VoiceStartFailureCode =
  "voice_unavailable" | "voice_trial_used" | "voice_minutes_exhausted" | "session_quota_unavailable";

export type VoiceStartResolution =
  | {
      ok: true;
      durationBucketSeconds: 600 | 3600;
      /** Faktyczny czas rozmowy: premium może dostać mniej niż bucket, gdy w puli zostało mniej. */
      durationSeconds: number;
      expiresAt: Date;
      quota: VoiceQuota;
    }
  | { ok: false; code: VoiceStartFailureCode; status: 403 | 503 };

export interface VoiceStartDependencies {
  isVoiceSessionEnabled: () => boolean;
  getAiProviderName: () => string;
  getVoiceMonthlyMinutes: () => number;
  readVoiceQuota: (
    context: SessionDataContext,
    options: { limitMinutes: number; now: Date },
  ) => Promise<SessionDataResult<VoiceQuota>>;
}

const defaultDependencies: VoiceStartDependencies = {
  isVoiceSessionEnabled,
  getAiProviderName,
  getVoiceMonthlyMinutes,
  readVoiceQuota: (context, options) => readVoiceQuota(context, options),
};

/** Flaga włączona i dostawca bezpośredni; błędna konfiguracja dostawcy = wyłączone. */
export function isVoiceStartAvailable(dependencies: VoiceStartDependencies = defaultDependencies) {
  if (!dependencies.isVoiceSessionEnabled()) {
    return false;
  }

  try {
    return dependencies.getAiProviderName() === "openai";
  } catch {
    return false;
  }
}

export interface ResolveVoiceStartOptions {
  plan: AccountPlan;
  now?: Date;
}

export async function resolveVoiceStart(
  context: SessionDataContext,
  options: ResolveVoiceStartOptions,
  dependencies: VoiceStartDependencies = defaultDependencies,
): Promise<VoiceStartResolution> {
  if (!isVoiceStartAvailable(dependencies)) {
    return { ok: false, code: "voice_unavailable", status: 403 };
  }

  const now = options.now ?? new Date();
  const quota = await dependencies.readVoiceQuota(context, {
    limitMinutes: dependencies.getVoiceMonthlyMinutes(),
    now,
  });

  if (!quota.ok) {
    return { ok: false, code: "session_quota_unavailable", status: 503 };
  }

  const durationBucketSeconds = resolveVoiceSessionDurationSeconds(options.plan);

  if (quota.data.kind === "trial") {
    if (!quota.data.available) {
      return { ok: false, code: "voice_trial_used", status: 403 };
    }

    return {
      ok: true,
      durationBucketSeconds,
      durationSeconds: quota.data.durationSeconds,
      expiresAt: new Date(now.getTime() + quota.data.durationSeconds * 1000),
      quota: quota.data,
    };
  }

  if (!quota.data.canStartVoice) {
    return { ok: false, code: "voice_minutes_exhausted", status: 403 };
  }

  // Bucket zostaje pełny (baza pilnuje `expires_at <= started_at + bucket`),
  // a termin jest przycięty do reszty puli — łuk rozmowy liczy się z terminu.
  const durationSeconds = Math.min(PREMIUM_SESSION_DURATION_SECONDS, quota.data.remainingSeconds);

  return {
    ok: true,
    durationBucketSeconds,
    durationSeconds,
    expiresAt: new Date(now.getTime() + durationSeconds * 1000),
    quota: quota.data,
  };
}
