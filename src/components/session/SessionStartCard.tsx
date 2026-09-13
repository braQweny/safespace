import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, Loader2, Mail, Mic, PencilLine } from "lucide-react";
import { useIsHydrated } from "@/components/hooks/useIsHydrated";
import { useSessionStart } from "@/components/hooks/useSessionStart";
import { LocaleProvider } from "@/components/LocaleProvider";
import type { Locale } from "@/lib/i18n/locale";
import { getBillingCopy } from "@/lib/billing/copy";
import type { SessionQuota, VoiceQuota } from "@/lib/session-data/types";
import {
  formatRemainingFreeSessions,
  formatVoiceMinutesRemaining,
  getPlanCopy,
  getPremiumSupportMailtoHref,
} from "@/lib/session-flow/plan-copy";
import {
  formatSessionBudgetMinutes,
  PREMIUM_SESSION_DURATION_SECONDS,
  resolveSessionDurationSeconds,
} from "@/lib/session-flow/session-budget";
import { parseSessionIdParam } from "@/lib/session-flow/session-id";
import type { SessionStartPageState } from "@/lib/session-flow/session-state";
import { readClientVoiceSupport } from "@/lib/session-flow/voice-support";
import type { VoiceStartFailureCode } from "@/components/hooks/useSessionStart";
import { cn } from "@/lib/utils";
import { getSessionStartCardCopy } from "./session-start-card-copy";
import { getServerStartMode, readStartMode, setStartMode, subscribeStartMode, type StartMode } from "./start-mode";

export { formatRemainingFreeSessions };

interface SessionStartCardProps {
  locale: Locale;
  initialState: SessionStartPageState;
  /** Kontakt jest drogą do ręcznego premium, gdy zakup jest wyłączony. */
  supportEmail?: string | null;
  billingEnabled?: boolean;
  /**
   * Pula rozmów głosowych z panelu (`null` = funkcja wyłączona albo odczyt
   * padł): przełącznik „Pisana | Głosowa” i drugi zestaw stanów puli.
   */
  voiceQuota?: VoiceQuota | null;
  /** Tylko do testów: tryb zamiast zapamiętanego wyboru (serwer zawsze zaczyna od pisanej). */
  initialMode?: StartMode | null;
}

const subscribeNever = () => () => {
  // Wsparcie WebRTC nie zmienia się po hydratacji.
};

const readServerTrue = () => true;

/** `true` w SSR (przycisk i tak czeka na hydratację), prawdziwa odpowiedź od pierwszego renderu klienta. */
function useVoiceSupport() {
  return useSyncExternalStore(subscribeNever, readClientVoiceSupport, readServerTrue);
}

const PRIMARY_BUTTON =
  "bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring disabled:border-brand-disabled disabled:bg-brand-soft disabled:text-brand-deep inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-[14px] border border-transparent px-5 py-3 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed";

const SEGMENT =
  "text-ink hover:bg-surface-soft focus-visible:ring-brand-ring aria-pressed:bg-brand-tint aria-pressed:text-brand-deep flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50";

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
  const isSupported = useVoiceSupport();

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
        {isVoiceStarting
          ? copy.preparingVoice
          : quota.kind === "trial"
            ? copy.startVoiceTrial(voiceBudgetMinutes)
            : copy.startVoice}
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

export interface SessionAboutOptions {
  aboutPersonId?: string | null;
  aboutDifficultyId?: string | null;
}

/** Karta osoby (`about`) i temat (`topic`) jadą dalej samym id, nigdy imieniem ani etykietą. */
export function buildSessionHref(sessionId: string, options: SessionAboutOptions = {}) {
  let href = `/dashboard/session?sessionId=${encodeURIComponent(sessionId)}`;
  if (options.aboutPersonId) href += `&about=${encodeURIComponent(options.aboutPersonId)}`;
  if (options.aboutDifficultyId) href += `&topic=${encodeURIComponent(options.aboutDifficultyId)}`;
  return href;
}

/**
 * Decyzja o starcie po „Zapisz i zacznij rozmowę” z ekranu wyboru perspektywy,
 * po „Porozmawiaj o tej osobie” z karty osoby i po „Porozmawiaj o tym” z karty
 * tematu: wszystkie wracają na panel z `?start=now`, bo kliknięcie padło już
 * gdzie indziej. Karta osoby dokłada `about=<id>`, temat `topic=<id>`.
 *
 * `nextSearch` to adres bez tych parametrów i musi zostać zapisany ZANIM poleci
 * żądanie startu — inaczej odświeżenie panelu zużyłoby kolejną rozmowę z puli.
 * Przy wyczerpanej puli żądanie zostaje rozpoznane (`isRequested`), ale start
 * nie następuje: panel ma wtedy pokazać stan limitu, a nie startować mimo woli.
 */
export function resolveAutoStartRequest(search: string, canStart: boolean) {
  const params = new URLSearchParams(search);

  if (params.get("start") !== "now") {
    return {
      isRequested: false,
      shouldStart: false,
      nextSearch: search,
      aboutPersonId: null,
      aboutDifficultyId: null,
    };
  }

  params.delete("start");
  const aboutPersonId = parseSessionIdParam(params.get("about") ?? undefined);
  params.delete("about");
  const aboutDifficultyId = parseSessionIdParam(params.get("topic") ?? undefined);
  params.delete("topic");

  const remaining = params.toString();

  return {
    isRequested: true,
    shouldStart: canStart,
    nextSearch: remaining.length > 0 ? `?${remaining}` : "",
    aboutPersonId,
    aboutDifficultyId,
  };
}

/**
 * Pula bezpłatnych rozmów jako kilka kresek: wypełnione to te, które jeszcze
 * zostały. Zdanie obok mówi to samo słowami — kreski są tylko dla oka. Karta
 * pierwszych kroków w panelu renderuje ten sam miernik statycznie, żeby pula
 * wyglądała tak samo przed wyborem perspektywy i po nim.
 */
export function AllowanceMeter({ quota }: { quota: SessionQuota | null }) {
  if (quota?.plan !== "free" || quota.sessionLimit === null || quota.remainingSessions === null) {
    return null;
  }

  const remaining = Math.max(0, Math.min(quota.sessionLimit, quota.remainingSessions));
  const slots = Array.from({ length: quota.sessionLimit }, (_, index) => ({
    id: `allowance-slot-${index}`,
    isRemaining: index < remaining,
  }));

  return (
    <div aria-hidden="true" className="flex shrink-0 gap-1">
      {slots.map((slot) => (
        <span
          key={slot.id}
          className={cn("h-1.5 w-7 rounded-full", slot.isRemaining ? "bg-brand" : "bg-line-accent")}
        />
      ))}
    </div>
  );
}

interface StartModeSwitchProps {
  locale: Locale;
  mode: StartMode;
  isHydrated: boolean;
}

/**
 * „Pisana | Głosowa”: tryb jest cechą rozmowy, nie osobną funkcją, więc dwa
 * przyciski startu tej samej wagi zastąpił jeden przełącznik nad jednym
 * startem. Ostatni wybór zostaje w przeglądarce.
 */
function StartModeSwitch({ locale, mode, isHydrated }: StartModeSwitchProps) {
  const copy = getSessionStartCardCopy(locale);

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0" data-start-mode={mode}>
      <legend className="sr-only">{copy.modeLegend}</legend>
      <div className="border-line-strong flex gap-0.5 rounded-xl border p-0.5">
        <button
          type="button"
          aria-pressed={mode === "text"}
          disabled={!isHydrated}
          onClick={() => {
            setStartMode("text");
          }}
          className={SEGMENT}
        >
          <PencilLine aria-hidden="true" className="h-4 w-4 shrink-0" />
          {copy.modeText}
        </button>
        <button
          type="button"
          aria-pressed={mode === "voice"}
          disabled={!isHydrated}
          onClick={() => {
            setStartMode("voice");
          }}
          className={SEGMENT}
        >
          <Mic aria-hidden="true" className="h-4 w-4 shrink-0" />
          {copy.modeVoice}
        </button>
      </div>
    </fieldset>
  );
}

export default function SessionStartCard({
  locale,
  initialState,
  supportEmail = null,
  billingEnabled = false,
  voiceQuota = null,
  initialMode = null,
}: SessionStartCardProps) {
  return (
    <LocaleProvider locale={locale}>
      <SessionStartCardView
        locale={locale}
        initialState={initialState}
        supportEmail={supportEmail}
        billingEnabled={billingEnabled}
        voiceQuota={voiceQuota}
        initialMode={initialMode}
      />
    </LocaleProvider>
  );
}

function SessionStartCardView({
  locale,
  initialState,
  supportEmail = null,
  billingEnabled = false,
  voiceQuota = null,
  initialMode = null,
}: SessionStartCardProps) {
  const copy = getSessionStartCardCopy(locale);
  const billingCopy = getBillingCopy(locale);
  // Wyspa hydratuje się z opóźnieniem, a kliknięcia sprzed hydratacji ginęły bez
  // żadnej reakcji — do tego czasu przycisk startu pozostaje wyłączony.
  const isHydrated = useIsHydrated();
  // Serwer i hydratacja pokazują tryb pisany; zapamiętany wybór wchodzi dopiero
  // po hydratacji, bez rozjazdu znaczników. Bez puli głosowej nie ma wyboru.
  const storedMode = useSyncExternalStore(subscribeStartMode, readStartMode, getServerStartMode);
  const hasVoice = voiceQuota !== null;
  const mode: StartMode = hasVoice ? (initialMode ?? storedMode) : "text";
  // Karta osoby z „Porozmawiaj o tej osobie” albo temat z „Porozmawiaj o tym”
  // — przekazane do startu i do adresu rozmowy, żeby prefill wjechał razem z
  // pierwszym ekranem.
  const aboutRef = useRef<SessionAboutOptions>({});
  const { kind, isStarting, isPreparingMemory, notice, voiceFailureCode, startSession } = useSessionStart({
    initialState,
    locale,
    onStarted: (session) => {
      window.location.assign(buildSessionHref(session.id, aboutRef.current));
    },
  });
  // Który start się kręci: w trakcie oba tryby są wyłączone.
  const [startingMode, setStartingMode] = useState<"text" | "voice" | null>(null);

  function startVoiceSession() {
    setStartingMode("voice");
    void startSession({ mode: "voice" }).finally(() => {
      setStartingMode(null);
    });
  }

  const canStart = kind === "ready" || kind === "followup_ready";
  const remainingCopy = formatRemainingFreeSessions(locale, initialState.sessionQuota);

  // Bez JS `?start=now` nic nie robi i zostaje zwykły przycisk startu — czyli
  // dokładnie dotychczasowe zachowanie panelu.
  const autoStartHandledRef = useRef(false);

  useEffect(() => {
    if (autoStartHandledRef.current || !isHydrated || isStarting || typeof window === "undefined") {
      return;
    }

    const autoStart = resolveAutoStartRequest(window.location.search, canStart);

    if (!autoStart.isRequested) {
      return;
    }

    autoStartHandledRef.current = true;
    window.history.replaceState({}, "", `${window.location.pathname}${autoStart.nextSearch}${window.location.hash}`);

    if (!autoStart.shouldStart) {
      return;
    }

    aboutRef.current = { aboutPersonId: autoStart.aboutPersonId, aboutDifficultyId: autoStart.aboutDifficultyId };
    void startSession(aboutRef.current);
  }, [canStart, isHydrated, isStarting, startSession]);
  // Rozmowa premium trwa dłużej, więc obietnica czasu musi iść za planem —
  // to samo źródło, z którego trasa startu liczy `expires_at`.
  const sessionDurationSeconds = resolveSessionDurationSeconds(initialState.sessionQuota?.plan);
  const sessionBudgetMinutes = formatSessionBudgetMinutes(locale, sessionDurationSeconds);
  // Imię zamiast „awatara”: „Lena uwzględni…” czyta się jak zdanie o osobie,
  // „pamięć awatara” jak zdanie o systemie.
  const avatarFirstName = initialState.avatar.selected.avatarFirstName;

  const modeSwitch = hasVoice ? <StartModeSwitch locale={locale} mode={mode} isHydrated={isHydrated} /> : null;
  const noticeBlock = notice ? (
    <div
      role="alert"
      className="border-danger-line bg-danger-soft text-danger rounded-2xl border p-4 text-sm leading-6"
    >
      <p className="font-semibold">{notice.title}</p>
      <p className="mt-1">{notice.body}</p>
    </div>
  ) : null;
  const voiceBlock =
    voiceQuota !== null ? (
      <VoiceStartSection
        locale={locale}
        quota={voiceQuota}
        avatarFirstName={avatarFirstName}
        isHydrated={isHydrated}
        isStarting={isStarting}
        isVoiceStarting={isStarting && startingMode === "voice"}
        failureCode={voiceFailureCode}
        onStart={startVoiceSession}
      />
    ) : null;

  if (kind === "session_limit_reached") {
    // Koniec puli pisanej prowadzi do zakupu albo kontaktu, zależnie od
    // konfiguracji; rozmowa głosowa ma osobną pulę, więc jej tryb zostaje.
    return (
      <div className="mt-4 flex flex-col gap-4" data-session-limit-reached>
        {modeSwitch}
        {mode === "voice" ? (
          <>
            {noticeBlock}
            {voiceBlock}
          </>
        ) : (
          <>
            <div className="bg-surface-soft text-ink-muted rounded-2xl p-5 text-sm leading-6">
              <p className="text-ink font-serif text-xl leading-snug font-medium">{copy.limitReachedTitle}</p>
              <p className="mt-2">{copy.limitReachedBody}</p>
              <p className="mt-3">{billingEnabled ? billingCopy.benefits : getPlanCopy(locale).premiumHowTo}</p>
              {billingEnabled ? (
                <a
                  href="/account/billing"
                  className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring mt-4 inline-flex min-h-12 items-center justify-center rounded-[14px] px-5 py-3 text-sm font-medium focus:outline-none focus-visible:ring-2"
                >
                  {billingCopy.discover}
                </a>
              ) : supportEmail ? (
                <a
                  href={getPremiumSupportMailtoHref(locale, `mailto:${supportEmail}`)}
                  className="border-line-accent bg-surface text-ink hover:bg-surface-hover focus-visible:ring-brand-ring mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
                >
                  <Mail aria-hidden="true" className="text-brand h-4 w-4" />
                  {copy.writeAboutPremium}
                </a>
              ) : null}
            </div>
            {hasVoice ? <p className="text-ink-muted text-sm leading-6">{copy.voiceLimitHint}</p> : null}
          </>
        )}
      </div>
    );
  }

  if (!canStart) {
    return (
      <div className="bg-surface-soft text-ink-muted mt-6 rounded-2xl p-5 text-sm leading-6">
        {kind === "trial_already_claimed" ? copy.trialAlreadyClaimed : copy.unavailable}
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {modeSwitch}

      {mode === "voice" ? (
        <>
          {noticeBlock}
          {voiceBlock}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-ink text-base font-medium">{copy.budget(sessionBudgetMinutes)}</p>
            {remainingCopy ? (
              <span className="flex items-center gap-3">
                <AllowanceMeter quota={initialState.sessionQuota} />
                <span className="text-ink-muted text-sm" data-session-quota>
                  {remainingCopy}
                </span>
              </span>
            ) : null}
          </div>

          {noticeBlock}

          <button
            type="button"
            onClick={() => {
              setStartingMode("text");
              void startSession().finally(() => {
                setStartingMode(null);
              });
            }}
            disabled={!isHydrated || isStarting}
            className={PRIMARY_BUTTON}
          >
            {/* Ruch w przycisku: start z pamięcią trwa do kilkudziesięciu sekund i bez
                niego nieruchomy napis wyglądał jak zawieszenie. */}
            {isStarting && startingMode !== "voice" ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
            ) : null}
            {isStarting && startingMode !== "voice" ? copy.preparing : copy.start}
            {isStarting && startingMode !== "voice" ? null : (
              <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
            )}
          </button>
          <p
            className={cn("text-ink-muted text-sm leading-6", !isStarting && "sr-only")}
            role="status"
            aria-live="polite"
          >
            {isPreparingMemory ? copy.readingHistory(avatarFirstName) : isStarting ? copy.redirecting : ""}
          </p>

          {/* Jedna linijka zamiast zwijanego wyjaśnienia; pełny opis stoi w „Prywatność i zasady”. */}
          <p className="text-ink-muted text-sm leading-6">
            {kind === "followup_ready" ? copy.followupIntro(avatarFirstName) : copy.firstIntro}{" "}
            <a
              href="/privacy#ai"
              className="text-brand hover:text-brand-deep focus-visible:ring-brand-ring rounded font-medium underline underline-offset-4 focus:outline-none focus-visible:ring-2"
            >
              {copy.howItWorks}
            </a>
          </p>
        </>
      )}
    </div>
  );
}
