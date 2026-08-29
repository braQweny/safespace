import { useState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { useIsHydrated } from "@/components/hooks/useIsHydrated";
import { useSessionStart } from "@/components/hooks/useSessionStart";
import type { SessionQuota } from "@/lib/session-data/types";
import { formatRemainingFreeSessions, PREMIUM_HOW_TO_COPY } from "@/lib/session-flow/plan-copy";
import { formatSessionBudgetCopy, formatSessionBudgetMinutes } from "@/lib/session-flow/session-budget";
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

const READY_FREE_COPY =
  "Plan bezpłatny obejmuje trzy rozmowy próbne z limitem czasu. Rozmowa zaczyna się dopiero po kliknięciu — samo otwarcie panelu nie zużywa próby.";

const READY_PREMIUM_COPY =
  "Rozmowa ma limit czasu i zaczyna się dopiero po kliknięciu — samo otwarcie panelu nie zużywa próby.";

const FOLLOWUP_COPY = "Rozmowa ma limit czasu i zaczyna się dopiero po kliknięciu startu.";

const LIMIT_REACHED_COPY =
  "Plan bezpłatny obejmuje trzy rozmowy próbne i wszystkie zostały już wykorzystane na tym koncie. Dalsze rozmowy są dostępne w planie premium. Zapisy dotychczasowych rozmów znajdziesz w historii poniżej.";

const SESSION_BUDGET_COPY = formatSessionBudgetCopy();
const SESSION_BUDGET_MINUTES = formatSessionBudgetMinutes();

export function buildSessionHref(sessionId: string) {
  return `/dashboard/session?sessionId=${encodeURIComponent(sessionId)}`;
}

function getStartCopy(kind: SessionStartPageState["kind"], quota: SessionQuota | null) {
  if (kind === "ready") {
    return quota?.plan === "premium" ? READY_PREMIUM_COPY : READY_FREE_COPY;
  }

  return FOLLOWUP_COPY;
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
  const [skipContext, setSkipContext] = useState(false);
  // Wyspa hydratuje się z opóźnieniem, a kliknięcia sprzed hydratacji ginęły bez
  // żadnej reakcji — do tego czasu przycisk startu pozostaje wyłączony.
  const isHydrated = useIsHydrated();
  const { kind, isStarting, notice, startSession } = useSessionStart({
    initialState,
    onStarted: (session) => {
      window.location.assign(buildSessionHref(session.id));
    },
  });

  const hasApprovedSummaries = initialState.approvedSummaries.length > 0;
  // Without approved summaries there is nothing to carry over, so the start is
  // context-free either way; the checkbox only matters when context exists.
  const startsWithoutContext =
    initialState.canStartWithoutContext && (skipContext || !hasApprovedSummaries) && kind === "followup_ready";
  const canStart = kind === "ready" || kind === "followup_ready";
  const remainingCopy = formatRemainingFreeSessions(initialState.sessionQuota);

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
            className="border-line-accent bg-surface text-ink hover:bg-surface-hover focus-visible:ring-brand-ring mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
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
          ? "Pierwsza darmowa rozmowa została już wykorzystana na tym koncie. Zapisy znajdziesz w historii poniżej."
          : "Nie udało się potwierdzić dostępności rozmowy. Odśwież panel za chwilę."}
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <p className="text-ink-muted text-sm leading-6">
        {getStartCopy(kind, initialState.sessionQuota)} {SESSION_BUDGET_COPY}
      </p>

      {kind === "followup_ready" ? (
        <div className="bg-surface-soft text-ink-soft rounded-2xl p-5 text-sm leading-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-ink text-[15px] font-semibold">Z czym zacznie się ta rozmowa</p>
            {hasApprovedSummaries ? <p className="text-ink-muted text-xs">Tylko to, co zatwierdzisz</p> : null}
          </div>
          {hasApprovedSummaries ? (
            <div className="mt-3 space-y-3">
              {initialState.approvedSummaries.slice(0, 3).map((summary) => (
                <div
                  key={summary.id}
                  className={cn("bg-surface rounded-xl p-4 transition-opacity", skipContext && "opacity-50")}
                >
                  {/* Ten sam łuk co w bramie podsumowania: to jest dokładnie to,
                      co przez próg przeszło. */}
                  <p className="text-brand flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] uppercase">
                    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
                      <path
                        d="M4.5 21.5V12a7.5 7.5 0 0 1 15 0v9.5Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Przechodzi do tej rozmowy
                  </p>
                  {/* Podsumowanie to treść rozmowy — szeryf, jak w samej rozmowie. */}
                  <p className="text-ink mt-2 font-serif text-[17px] leading-relaxed whitespace-pre-wrap">
                    {summary.summaryText}
                  </p>
                </div>
              ))}
              <p className="text-ink-muted">
                {skipContext
                  ? "Ta rozmowa zacznie się od zera. Żadne z powyższych podsumowań do niej nie trafi — zostają w historii i możesz je przekazać przy następnym starcie."
                  : "Tylko te zatwierdzone, widoczne podsumowania mogą zostać przekazane do tej rozmowy."}
              </p>
              {initialState.canStartWithoutContext ? (
                <label
                  htmlFor="skip-approved-context"
                  className="text-ink hover:bg-surface flex cursor-pointer items-start gap-3 rounded-xl p-2 transition-colors"
                >
                  <input
                    id="skip-approved-context"
                    type="checkbox"
                    checked={skipContext}
                    onChange={(event) => {
                      setSkipContext(event.target.checked);
                    }}
                    disabled={isStarting}
                    className="accent-brand focus-visible:ring-brand-ring mt-1 h-4 w-4 shrink-0 rounded focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed"
                  />
                  <span className="min-w-0">
                    <span className="font-medium">Zacznij bez przekazywania kontekstu</span>
                    <span className="text-ink-muted mt-1 block text-xs leading-5">
                      Wybór obowiązuje przez całą rozmowę — podsumowanie zatwierdzone w jej trakcie też do niej nie
                      trafi.
                    </span>
                  </span>
                </label>
              ) : null}
            </div>
          ) : (
            <p className="text-ink-muted mt-2">
              Nie masz jeszcze zatwierdzonego podsumowania, więc ta rozmowa zacznie się od zera. Podsumowanie
              poprzedniej rozmowy przygotujesz w jej historii, niżej na tej stronie.
            </p>
          )}
        </div>
      ) : null}

      {notice ? (
        <div className="border-danger-line bg-danger-soft text-danger rounded-2xl border p-4 text-sm leading-6">
          <p className="font-semibold">{notice.title}</p>
          <p className="mt-1">{notice.body}</p>
        </div>
      ) : null}

      <div className="border-line flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        {remainingCopy ? (
          <div className="flex items-center gap-3">
            <AllowanceMeter quota={initialState.sessionQuota} />
            <p className="text-ink-soft text-sm" data-session-quota>
              {remainingCopy}
            </p>
          </div>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => {
            void startSession({ withoutContext: startsWithoutContext });
          }}
          disabled={!isHydrated || isStarting}
          className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring disabled:bg-brand-disabled inline-flex h-12 shrink-0 items-center justify-center gap-3 rounded-2xl px-6 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed"
        >
          <span>
            {isStarting
              ? "Rozpoczynanie…"
              : kind === "ready"
                ? initialState.sessionQuota?.plan === "premium"
                  ? "Rozpocznij pierwszą rozmowę"
                  : "Rozpocznij pierwszą darmową rozmowę"
                : "Rozpocznij rozmowę"}
          </span>
          {isStarting ? null : (
            <>
              <span className="font-normal opacity-80">do {SESSION_BUDGET_MINUTES}</span>
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
