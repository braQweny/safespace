import { useEffect, useRef } from "react";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { useIsHydrated } from "@/components/hooks/useIsHydrated";
import { useSessionStart } from "@/components/hooks/useSessionStart";
import { LocaleProvider } from "@/components/LocaleProvider";
import type { Locale } from "@/lib/i18n/locale";
import { getBillingCopy } from "@/lib/billing/copy";
import type { SessionQuota, VoiceQuota } from "@/lib/session-data/types";
import { formatRemainingFreeSessions, getPlanCopy, getPremiumSupportMailtoHref } from "@/lib/session-flow/plan-copy";
import { formatSessionBudgetMinutes, resolveSessionDurationSeconds } from "@/lib/session-flow/session-budget";
import { parseSessionIdParam } from "@/lib/session-flow/session-id";
import type { SessionStartPageState } from "@/lib/session-flow/session-state";
import { cn } from "@/lib/utils";
import { getSessionStartCardCopy } from "./session-start-card-copy";

export { formatRemainingFreeSessions };

interface SessionStartCardProps {
  locale: Locale;
  initialState: SessionStartPageState;
  /** Kontakt jest drogą do ręcznego premium, gdy zakup jest wyłączony. */
  supportEmail?: string | null;
  billingEnabled?: boolean;
  /**
   * Pula rozmów głosowych z panelu (`null` = funkcja wyłączona albo odczyt
   * padł). Przycisk głosowy karty renderuje etap klienta planu rozmowy
   * głosowej; do tego czasu prop jest tylko przyjmowany.
   */
  voiceQuota?: VoiceQuota | null;
}

export interface SessionAboutOptions {
  aboutPersonId?: string | null;
  aboutDifficultyId?: string | null;
}

/** Karta osoby (`about`) i trudność (`topic`) jadą dalej samym id, nigdy imieniem ani etykietą. */
export function buildSessionHref(sessionId: string, options: SessionAboutOptions = {}) {
  let href = `/dashboard/session?sessionId=${encodeURIComponent(sessionId)}`;
  if (options.aboutPersonId) href += `&about=${encodeURIComponent(options.aboutPersonId)}`;
  if (options.aboutDifficultyId) href += `&topic=${encodeURIComponent(options.aboutDifficultyId)}`;
  return href;
}

/**
 * Decyzja o starcie po „Zapisz i zacznij rozmowę” z ekranu wyboru perspektywy,
 * po „Porozmawiaj o tej osobie” z karty osoby i po „Porozmawiaj o tym” z mapy
 * tematów: wszystkie wracają na panel z `?start=now`, bo kliknięcie padło już
 * gdzie indziej. Karta dokłada `about=<id>`, mapa `topic=<id>`.
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

export default function SessionStartCard({
  locale,
  initialState,
  supportEmail = null,
  billingEnabled = false,
}: SessionStartCardProps) {
  return (
    <LocaleProvider locale={locale}>
      <SessionStartCardView
        locale={locale}
        initialState={initialState}
        supportEmail={supportEmail}
        billingEnabled={billingEnabled}
      />
    </LocaleProvider>
  );
}

function SessionStartCardView({
  locale,
  initialState,
  supportEmail = null,
  billingEnabled = false,
}: SessionStartCardProps) {
  const copy = getSessionStartCardCopy(locale);
  const billingCopy = getBillingCopy(locale);
  // Wyspa hydratuje się z opóźnieniem, a kliknięcia sprzed hydratacji ginęły bez
  // żadnej reakcji — do tego czasu przycisk startu pozostaje wyłączony.
  const isHydrated = useIsHydrated();
  // Karta osoby z „Porozmawiaj o tej osobie” albo trudność z „Porozmawiaj o tym”
  // — przekazane do startu i do adresu rozmowy, żeby prefill wjechał razem z
  // pierwszym ekranem.
  const aboutRef = useRef<SessionAboutOptions>({});
  const { kind, isStarting, isPreparingMemory, notice, startSession } = useSessionStart({
    initialState,
    locale,
    onStarted: (session) => {
      window.location.assign(buildSessionHref(session.id, aboutRef.current));
    },
  });

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

  if (kind === "session_limit_reached") {
    // Koniec puli prowadzi do zakupu albo kontaktu, zależnie od konfiguracji.
    return (
      <div className="bg-surface-soft text-ink-muted mt-6 rounded-2xl p-5 text-sm leading-6" data-session-limit-reached>
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
      <div>
        <p className="text-ink text-base font-medium">{copy.budget(sessionBudgetMinutes)}</p>
        {remainingCopy ? (
          <div className="mt-2 flex items-center gap-3">
            <AllowanceMeter quota={initialState.sessionQuota} />
            <p className="text-ink-muted text-sm" data-session-quota>
              {remainingCopy}
            </p>
          </div>
        ) : null}
      </div>

      {notice ? (
        <div
          role="alert"
          className="border-danger-line bg-danger-soft text-danger rounded-2xl border p-4 text-sm leading-6"
        >
          <p className="font-semibold">{notice.title}</p>
          <p className="mt-1">{notice.body}</p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          void startSession();
        }}
        disabled={!isHydrated || isStarting}
        className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring disabled:border-brand-disabled disabled:bg-brand-soft disabled:text-brand-deep inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-[14px] border border-transparent px-5 py-3 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed"
      >
        {/* Ruch w przycisku: start z pamięcią trwa do kilkudziesięciu sekund i bez
            niego nieruchomy napis wyglądał jak zawieszenie. */}
        {isStarting ? <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" /> : null}
        {isStarting ? copy.preparing : copy.start}
        {isStarting ? null : <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />}
      </button>
      <p className={cn("text-ink-muted text-sm leading-6", !isStarting && "sr-only")} role="status" aria-live="polite">
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
    </div>
  );
}
