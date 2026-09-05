import { useEffect, useRef } from "react";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { useIsHydrated } from "@/components/hooks/useIsHydrated";
import { useSessionStart } from "@/components/hooks/useSessionStart";
import type { SessionQuota } from "@/lib/session-data/types";
import { formatRemainingFreeSessions, PREMIUM_HOW_TO_COPY } from "@/lib/session-flow/plan-copy";
import { formatSessionBudgetMinutes, resolveSessionDurationSeconds } from "@/lib/session-flow/session-budget";
import type { SessionStartPageState } from "@/lib/session-flow/session-state";
import { cn } from "@/lib/utils";

export { formatRemainingFreeSessions };

interface SessionStartCardProps {
  initialState: SessionStartPageState;
  /**
   * Adres kontaktowy z `SUPPORT_EMAIL`. Po wyczerpaniu puli jest jedyną drogą
   * do premium, więc karta dostaje go z serwera zamiast obiecywać kontakt,
   * którego w danym wdrożeniu może nie być.
   */
  supportEmail?: string | null;
}

const LIMIT_REACHED_COPY =
  "Plan bezpłatny obejmuje trzy rozmowy próbne i wszystkie zostały już wykorzystane na tym koncie. Dalsze rozmowy są dostępne w planie premium. Zapisy dotychczasowych rozmów znajdziesz w historii rozmów.";

export function buildSessionHref(sessionId: string) {
  return `/dashboard/session?sessionId=${encodeURIComponent(sessionId)}`;
}

/**
 * Decyzja o starcie po „Zapisz i zacznij rozmowę” z ekranu wyboru perspektywy:
 * zapis wraca na panel z `?start=now`, bo kliknięcie padło już przy wyborze.
 *
 * `nextSearch` to adres bez tego parametru i musi zostać zapisany ZANIM poleci
 * żądanie startu — inaczej odświeżenie panelu zużyłoby kolejną rozmowę z puli.
 * Przy wyczerpanej puli żądanie zostaje rozpoznane (`isRequested`), ale start
 * nie następuje: panel ma wtedy pokazać stan limitu, a nie startować mimo woli.
 */
export function resolveAutoStartRequest(search: string, canStart: boolean) {
  const params = new URLSearchParams(search);

  if (params.get("start") !== "now") {
    return { isRequested: false, shouldStart: false, nextSearch: search };
  }

  params.delete("start");

  const remaining = params.toString();

  return {
    isRequested: true,
    shouldStart: canStart,
    nextSearch: remaining.length > 0 ? `?${remaining}` : "",
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

export default function SessionStartCard({ initialState, supportEmail = null }: SessionStartCardProps) {
  // Wyspa hydratuje się z opóźnieniem, a kliknięcia sprzed hydratacji ginęły bez
  // żadnej reakcji — do tego czasu przycisk startu pozostaje wyłączony.
  const isHydrated = useIsHydrated();
  const { kind, isStarting, isPreparingMemory, notice, startSession } = useSessionStart({
    initialState,
    onStarted: (session) => {
      window.location.assign(buildSessionHref(session.id));
    },
  });

  const canStart = kind === "ready" || kind === "followup_ready";
  const remainingCopy = formatRemainingFreeSessions(initialState.sessionQuota);

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

    void startSession();
  }, [canStart, isHydrated, isStarting, startSession]);
  // Rozmowa premium trwa dłużej, więc obietnica czasu musi iść za planem —
  // to samo źródło, z którego trasa startu liczy `expires_at`.
  const sessionDurationSeconds = resolveSessionDurationSeconds(initialState.sessionQuota?.plan);
  const sessionBudgetMinutes = formatSessionBudgetMinutes(sessionDurationSeconds);
  // Imię zamiast „awatara”: „Lena uwzględni…” czyta się jak zdanie o osobie,
  // „pamięć awatara” jak zdanie o systemie.
  const avatarFirstName = initialState.avatar.selected.avatarName.split(",")[0]?.trim() || "Awatar";

  if (kind === "session_limit_reached") {
    // Koniec puli nie może być ślepym zaułkiem: użytkownik ma wiedzieć, co
    // dalej (premium jest przyznawane ręcznie) i mieć dokąd napisać.
    return (
      <div className="bg-surface-soft text-ink-muted mt-6 rounded-2xl p-5 text-sm leading-6" data-session-limit-reached>
        <p className="text-ink font-serif text-xl leading-snug font-medium">
          Pula bezpłatnych rozmów została wykorzystana
        </p>
        <p className="mt-2">{LIMIT_REACHED_COPY}</p>
        <p className="mt-3">{PREMIUM_HOW_TO_COPY}</p>
        {supportEmail ? (
          <a
            href={`mailto:${supportEmail}?subject=${encodeURIComponent("SafeSpace — dostęp do planu premium")}`}
            className="border-line-accent bg-surface text-ink hover:bg-surface-hover focus-visible:ring-brand-ring mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
          >
            <Mail aria-hidden="true" className="text-brand h-4 w-4" />
            Napisz w sprawie premium
          </a>
        ) : null}
      </div>
    );
  }

  if (!canStart) {
    return (
      <div className="bg-surface-soft text-ink-muted mt-6 rounded-2xl p-5 text-sm leading-6">
        {kind === "trial_already_claimed"
          ? "Pierwsza darmowa rozmowa została już wykorzystana na tym koncie. Zapisy znajdziesz w historii rozmów."
          : "Nie udało się potwierdzić dostępności rozmowy. Odśwież panel za chwilę."}
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div>
        <p className="text-ink text-base font-medium">Do {sessionBudgetMinutes} rozmowy</p>
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
        {isStarting ? "Przygotowujemy rozmowę…" : "Rozpocznij rozmowę"}
        {isStarting ? null : <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />}
      </button>
      <p className={cn("text-ink-muted text-sm leading-6", !isStarting && "sr-only")} role="status" aria-live="polite">
        {isPreparingMemory
          ? `${avatarFirstName} czyta wasze wcześniejsze rozmowy. Czas rozmowy jeszcze nie biegnie; przy dłuższej historii może to potrwać do minuty.`
          : isStarting
            ? "Za chwilę przejdziesz do ekranu rozmowy."
            : ""}
      </p>

      {/* Jedna linijka zamiast zwijanego wyjaśnienia; pełny opis stoi w „Prywatność i zasady”. */}
      <p className="text-ink-muted text-sm leading-6">
        {kind === "followup_ready"
          ? `${avatarFirstName} uwzględni wasze wcześniejsze rozmowy. Samo otwarcie panelu nie zużywa próby ani czasu.`
          : "Pierwsza rozmowa zaczyna się od tego, co chcesz dziś poruszyć. Samo otwarcie panelu nie zużywa próby ani czasu."}{" "}
        <a
          href="/privacy#ai"
          className="text-brand hover:text-brand-deep focus-visible:ring-brand-ring rounded font-medium underline underline-offset-4 focus:outline-none focus-visible:ring-2"
        >
          Jak to działa
        </a>
      </p>
    </div>
  );
}
