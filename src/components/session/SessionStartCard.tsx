import { useState } from "react";
import { FileText, Mail, PlayCircle } from "lucide-react";
import { useIsHydrated } from "@/components/hooks/useIsHydrated";
import { useSessionStart } from "@/components/hooks/useSessionStart";
import type { SessionQuota } from "@/lib/session-data/types";
import { formatRemainingFreeSessions, PREMIUM_HOW_TO_COPY } from "@/lib/session-flow/plan-copy";
import { formatSessionBudgetCopy } from "@/lib/session-flow/session-budget";
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

export function buildSessionHref(sessionId: string) {
  return `/dashboard/session?sessionId=${encodeURIComponent(sessionId)}`;
}

function getStartCopy(kind: SessionStartPageState["kind"], quota: SessionQuota | null) {
  if (kind === "ready") {
    return quota?.plan === "premium" ? READY_PREMIUM_COPY : READY_FREE_COPY;
  }

  return FOLLOWUP_COPY;
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
      <div
        className="border-line bg-surface-soft text-ink-muted mt-5 rounded-lg border p-4 text-sm leading-6"
        data-session-limit-reached
      >
        <p className="text-ink font-semibold">Pula bezpłatnych rozmów została wykorzystana</p>
        <p className="mt-1">{LIMIT_REACHED_COPY}</p>
        <p className="mt-3">{PREMIUM_HOW_TO_COPY}</p>
        {supportEmail ? (
          <a
            href={`mailto:${supportEmail}?subject=${encodeURIComponent("SafeSpace — dostęp do planu premium")}`}
            className="border-line-accent bg-surface text-brand hover:bg-surface-hover focus:ring-brand-ring mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors focus:ring-2 focus:outline-none"
          >
            <Mail aria-hidden="true" className="h-4 w-4" />
            Napisz w sprawie premium
          </a>
        ) : null}
      </div>
    );
  }

  if (!canStart) {
    return (
      <div className="border-line bg-surface-soft text-ink-muted mt-5 rounded-lg border p-4 text-sm leading-6">
        {kind === "trial_already_claimed"
          ? "Pierwsza darmowa rozmowa została już wykorzystana na tym koncie. Zapisy znajdziesz w historii poniżej."
          : "Nie udało się potwierdzić dostępności rozmowy. Odśwież panel za chwilę."}
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-4">
      <p className="text-ink-muted text-sm leading-6">
        {getStartCopy(kind, initialState.sessionQuota)} {SESSION_BUDGET_COPY}
      </p>

      {remainingCopy ? (
        <p className="text-brand text-sm font-medium" data-session-quota>
          {remainingCopy}
        </p>
      ) : null}

      {kind === "followup_ready" ? (
        <div className="border-line-strong bg-surface-soft text-ink-soft rounded-lg border p-4 text-sm leading-6">
          <div className="flex items-start gap-3">
            <FileText aria-hidden="true" className="text-brand mt-1 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-ink font-semibold">Z czym zacznie się ta rozmowa</p>
              {hasApprovedSummaries ? (
                <div className="mt-3 space-y-3">
                  {initialState.approvedSummaries.slice(0, 3).map((summary, index) => (
                    <div
                      key={summary.id}
                      className={cn("border-line bg-surface rounded-lg border p-3", skipContext && "opacity-50")}
                    >
                      <p className="text-brand text-xs font-semibold tracking-wide uppercase">
                        Podsumowanie {index + 1}
                      </p>
                      <p className="text-ink mt-2 whitespace-pre-wrap">{summary.summaryText}</p>
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
                      className="border-line bg-surface text-ink hover:bg-surface-hover flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
                    >
                      <input
                        id="skip-approved-context"
                        type="checkbox"
                        checked={skipContext}
                        onChange={(event) => {
                          setSkipContext(event.target.checked);
                        }}
                        disabled={isStarting}
                        className="accent-brand focus:ring-brand-ring mt-1 h-4 w-4 shrink-0 rounded focus:ring-2 focus:outline-none disabled:cursor-not-allowed"
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
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="border-danger-line bg-danger-soft text-danger rounded-lg border p-4 text-sm leading-6">
          <p className="font-semibold">{notice.title}</p>
          <p className="mt-1">{notice.body}</p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          void startSession({ withoutContext: startsWithoutContext });
        }}
        disabled={!isHydrated || isStarting}
        className="bg-brand hover:bg-brand-strong focus:ring-brand-ring disabled:bg-brand-disabled inline-flex h-11 shrink-0 items-center justify-center gap-2 self-start rounded-lg px-5 text-sm font-medium text-white transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed"
      >
        <PlayCircle aria-hidden="true" className="h-4 w-4" />
        {isStarting
          ? "Rozpoczynanie…"
          : kind === "ready"
            ? initialState.sessionQuota?.plan === "premium"
              ? "Rozpocznij pierwszą rozmowę"
              : "Rozpocznij pierwszą darmową rozmowę"
            : "Rozpocznij rozmowę"}
      </button>
    </div>
  );
}
