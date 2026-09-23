import { Loader2, Mic } from "lucide-react";
import { useClientCapability } from "@/components/hooks/useClientCapability";
import type { VoiceStartFailureCode } from "@/components/hooks/useSessionStart";
import type { Locale } from "@/lib/i18n/locale";
import type { VoiceQuota } from "@/lib/session-data/types";
import { formatVoiceMinutesRemaining, getPlanCopy } from "@/lib/session-flow/plan-copy";
import { formatSessionBudgetMinutes, PREMIUM_SESSION_DURATION_SECONDS } from "@/lib/session-flow/session-budget";
import { readClientVoiceSupport } from "@/lib/session-flow/voice-support";
import { getSessionStartCardCopy } from "./session-start-card-copy";
import { PRIMARY_BUTTON } from "./start-card-styles";

/**
 * Pula minut premium jako cienki pasek: wypełnione to minuty, które jeszcze
 * zostały. Zdanie obok mówi to samo słowami — pasek jest tylko dla oka.
 */
export function VoiceMinutesMeter({ quota }: { quota: VoiceQuota }) {
  if (quota.kind !== "pool" || quota.limitSeconds <= 0) {
    return null;
  }

  const ratio = Math.max(0, Math.min(1, quota.remainingSeconds / quota.limitSeconds));

  return (
    <div aria-hidden="true" className="bg-line-accent h-1.5 w-full max-w-[220px] overflow-hidden rounded-full">
      <div className="bg-brand h-full rounded-full" style={{ width: `${Math.round(ratio * 100)}%` }} />
    </div>
  );
}

interface VoiceStartSectionProps {
  locale: Locale;
  quota: VoiceQuota;
  avatarFirstName: string;
  isHydrated: boolean;
  isStarting: boolean;
  isVoiceStarting: boolean;
  failureCode: VoiceStartFailureCode | null;
  onStart: () => void;
}

/**
 * Treść trybu „Głosowa”: rozmowa głosowa ma osobną pulę, więc stoi także
 * przy wyczerpanym limicie pisanym. Pięć stanów: próba dostępna, próba
 * zużyta, pula z minutami, pula wyczerpana, funkcja chwilowo niedostępna; do
 * tego przeglądarka bez WebRTC.
 */
export function VoiceStartSection({
  locale,
  quota,
  avatarFirstName,
  isHydrated,
  isStarting,
  isVoiceStarting,
  failureCode,
  onStart,
}: VoiceStartSectionProps) {
  const copy = getSessionStartCardCopy(locale);
  const planCopy = getPlanCopy(locale);
  // Wsparcie WebRTC: `true` w SSR (przycisk i tak czeka na hydratację),
  // prawdziwa odpowiedź od pierwszego renderu klienta.
  const isSupported = useClientCapability(readClientVoiceSupport, true);

  if (failureCode === "voice_unavailable") {
    return (
      <p className="text-ink-muted text-sm leading-6" data-voice-start="unavailable">
        {copy.voiceUnavailable}
      </p>
    );
  }

  if ((quota.kind === "trial" && !quota.available) || failureCode === "voice_trial_used") {
    return (
      <p className="text-ink-muted text-sm leading-6" data-voice-start="trial_used">
        {planCopy.voiceTrialUsed}{" "}
        <a
          href="/account/security"
          className="text-brand hover:text-brand-deep focus-visible:ring-brand-ring rounded font-medium underline underline-offset-4 focus:outline-none focus-visible:ring-2"
        >
          {copy.voiceTrialUsedLink}
        </a>
      </p>
    );
  }

  if ((quota.kind === "pool" && !quota.canStartVoice) || failureCode === "voice_minutes_exhausted") {
    return (
      <p className="text-ink-muted text-sm leading-6" data-voice-start="exhausted">
        {planCopy.voiceMinutesExhausted}
      </p>
    );
  }

  if (isHydrated && !isSupported) {
    return (
      <p className="text-ink-muted text-sm leading-6" data-voice-start="unsupported">
        {copy.voiceUnsupported}
      </p>
    );
  }

  const remainingCopy = quota.kind === "pool" ? formatVoiceMinutesRemaining(locale, quota) : null;
  // Rozmowa głosowa premium ma godzinny kubełek przycięty do reszty puli, więc
  // obietnica czasu idzie za tym, co naprawdę zostało w tym miesiącu.
  const voiceBudgetSeconds =
    quota.kind === "trial" ? quota.durationSeconds : Math.min(PREMIUM_SESSION_DURATION_SECONDS, quota.remainingSeconds);
  const voiceBudgetMinutes = formatSessionBudgetMinutes(locale, voiceBudgetSeconds);

  return (
    <div className="flex flex-col gap-4" data-voice-start={quota.kind}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-ink text-base font-medium">
          {quota.kind === "trial" ? copy.voiceTrialBudget(voiceBudgetMinutes) : copy.budget(voiceBudgetMinutes)}
        </p>
        {quota.kind === "trial" ? (
          <span className="text-ink-muted text-sm">{copy.voiceTrialNote}</span>
        ) : (
          <span className="flex flex-wrap items-center gap-3">
            <VoiceMinutesMeter quota={quota} />
            {remainingCopy ? (
              <span className="text-ink-muted text-sm" data-voice-quota>
                {remainingCopy}
              </span>
            ) : null}
          </span>
        )}
      </div>

      <button type="button" onClick={onStart} disabled={!isHydrated || isStarting} className={PRIMARY_BUTTON}>
        {isVoiceStarting ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <Mic aria-hidden="true" className="h-4 w-4 shrink-0" />
        )}
        {isVoiceStarting ? copy.preparingVoice : quota.kind === "trial" ? copy.startVoiceTrial : copy.startVoice}
      </button>

      <p className="text-ink-muted text-sm leading-6">
        {copy.voiceIntro(avatarFirstName)}{" "}
        <a
          href="/privacy#voice"
          className="text-brand hover:text-brand-deep focus-visible:ring-brand-ring rounded font-medium underline underline-offset-4 focus:outline-none focus-visible:ring-2"
        >
          {copy.howVoiceWorks}
        </a>
      </p>
    </div>
  );
}
