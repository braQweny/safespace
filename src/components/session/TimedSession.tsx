import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CircleStop, FileText, History, PlayCircle, ShieldCheck } from "lucide-react";
import { useTimedSession } from "@/components/hooks/useTimedSession";
import type { SessionStartPageState, SessionStartPageStateKind, SessionView } from "@/lib/session-flow/session-state";
import { cn } from "@/lib/utils";
import SessionComposer from "./SessionComposer";
import SessionMessages from "./SessionMessages";
import SessionSafetyNotice from "./SessionSafetyNotice";
import SessionTimer from "./SessionTimer";

interface TimedSessionProps {
  initialState: SessionStartPageState;
}

const stateCopy: Record<SessionStartPageStateKind, { title: string; body: string }> = {
  ready: {
    title: "Przygotowanie do pierwszej sesji",
    body: "Wejście na tę stronę nie zużywa darmowej próby. Sesja startuje dopiero po użyciu przycisku rozpoczęcia.",
  },
  active: {
    title: "Sesja jest aktywna",
    body: "Możesz pisać wiadomości, dopóki trwa czas sesji.",
  },
  expired: {
    title: "Limit czasu został osiągnięty",
    body: "Pierwsza 15-minutowa sesja jest już po czasie. Nie można już wysyłać nowych wiadomości.",
  },
  completed: {
    title: "Sesja została zakończona",
    body: "Rozmowa została prywatnie zapisana. Pełny zapis znajdziesz w historii w panelu — tam możesz też przejrzeć i zatwierdzić podsumowanie do kolejnej sesji.",
  },
  interrupted: {
    title: "Sesja została przerwana",
    body: "Rozmowa została zatrzymana w bezpiecznym stanie. Zwykła symulacja nie będzie kontynuowana w tej sesji.",
  },
  followup_ready: {
    title: "Przygotowanie do kolejnej sesji",
    body: "Możesz rozpocząć kolejną sesję z limitem czasu. Przed startem widzisz, czy rozmowa otrzyma zatwierdzone podsumowania jako kontekst.",
  },
  trial_already_claimed: {
    title: "Darmowa próba została już wykorzystana",
    body: "Darmowa próba obejmuje jedną sesję i została już użyta na tym koncie. Zapis rozmowy znajdziesz w historii w panelu.",
  },
  unavailable: {
    title: "Stan sesji jest chwilowo niedostępny",
    body: "Nie udało się potwierdzić dostępności darmowej próby. Spróbuj ponownie za chwilę.",
  },
};

const BOUNDARIES_COPY =
  "SafeSpace jest symulacją rozmowy edukacyjnej. Nie diagnozuje i nie zastępuje specjalisty. W bezpośrednim zagrożeniu skorzystaj z realnej pomocy, np. lokalnego numeru alarmowego.";

const PERSPECTIVE_COPY =
  "Wybrana perspektywa obowiązuje przez całą sesję. Kolejna rozmowa korzysta wyłącznie z podsumowań, które samodzielnie zatwierdzisz — albo zaczyna się bez kontekstu, jeśli tak zdecydujesz.";

const emptySubscribe = () => () => {
  // Stan hydratacji nigdy się nie zmienia po pierwszym renderze klienta.
};

function useIsHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

function getSessionTotalSeconds(session: SessionView | null) {
  if (!session?.startedAt || !session.expiresAt) {
    return null;
  }

  const startedAtMs = Date.parse(session.startedAt);
  const expiresAtMs = Date.parse(session.expiresAt);

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= startedAtMs) {
    return null;
  }

  return Math.round((expiresAtMs - startedAtMs) / 1000);
}

export default function TimedSession({ initialState }: TimedSessionProps) {
  const { state, composerAvailable, handleExpired, setDraft, startSession, sendMessage, endSession } =
    useTimedSession(initialState);
  const { kind, session, messages, draft, isStarting, isEnding, isMessagePending, pendingUserText, notice } = state;
  const [isConfirmingEnd, setIsConfirmingEnd] = useState(false);
  const [skipContext, setSkipContext] = useState(false);
  // Wyspa hydratuje się z opóźnieniem, a kliknięcia sprzed hydratacji ginęły bez
  // żadnej reakcji — do tego czasu przycisk startu pozostaje wyłączony.
  const isHydrated = useIsHydrated();
  const confirmEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isConfirmingEnd) {
      confirmEndRef.current?.focus();
    }
  }, [isConfirmingEnd]);
  const hasApprovedSummaries = initialState.approvedSummaries.length > 0;
  // Without approved summaries there is nothing to carry over, so the start is
  // context-free either way; the checkbox only matters when context exists.
  const startsWithoutContext =
    initialState.canStartWithoutContext && (skipContext || !hasApprovedSummaries) && kind === "followup_ready";
  const canEndSession = kind === "active" && session?.status === "active";
  const showHistoryCta = kind === "completed" || kind === "expired" || kind === "interrupted";
  const avatar = initialState.avatar.selected;
  // Gdy istnieje sesja, strona zachowuje się jak komunikator: nagłówek i pole
  // wpisywania są przypięte, a przewija się wyłącznie zapis rozmowy.
  const isChatLayout = Boolean(session);

  const startAction =
    kind === "ready" || kind === "followup_ready" ? (
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
          : kind === "followup_ready"
            ? startsWithoutContext
              ? "Rozpocznij kolejną sesję bez kontekstu"
              : "Rozpocznij kolejną sesję z kontekstem"
            : "Rozpocznij pierwszą darmową sesję"}
      </button>
    ) : null;

  const contextPanel =
    kind === "followup_ready" ? (
      <div className="border-line-strong bg-surface-soft text-ink-soft rounded-lg border p-4 text-sm leading-6">
        <div className="flex items-start gap-3">
          <FileText aria-hidden="true" className="text-brand mt-1 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-ink font-semibold">Kontekst pokazany przed startem</p>
            {hasApprovedSummaries ? (
              <div className="mt-3 space-y-3">
                {initialState.approvedSummaries.slice(0, 3).map((summary, index) => (
                  <div
                    key={summary.id}
                    className={cn("border-line bg-surface rounded-lg border p-3", skipContext && "opacity-50")}
                  >
                    <p className="text-brand text-xs font-semibold tracking-wide uppercase">Podsumowanie {index + 1}</p>
                    <p className="text-ink mt-2 whitespace-pre-wrap">{summary.summaryText}</p>
                  </div>
                ))}
                <p className="text-ink-muted">
                  {skipContext
                    ? "Ta sesja zacznie się od zera. Żadne z powyższych podsumowań nie trafi do rozmowy — zostają w historii i możesz je przekazać przy następnym starcie."
                    : "Tylko te zatwierdzone, widoczne podsumowania mogą zostać przekazane do kolejnej rozmowy."}
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
                        Wybór obowiązuje przez całą sesję — podsumowanie zatwierdzone w jej trakcie też do niej nie
                        trafi.
                      </span>
                    </span>
                  </label>
                ) : null}
              </div>
            ) : (
              <p className="text-ink-muted mt-2">
                Nie ma zatwierdzonych podsumowań. Sesję bez kontekstu rozpoczniesz osobnym przyciskiem poniżej.
              </p>
            )}
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div
      className={cn(
        "mx-auto flex h-full w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8",
        // W trybie rozmowy wiersz siatki nie może rosnąć ponad ekran — inaczej wysoka
        // kolumna boczna wypycha pole wpisywania poza widok.
        isChatLayout ? "lg:grid-rows-[minmax(0,1fr)]" : "overflow-y-auto",
      )}
    >
      <section
        className={cn(
          "border-line-strong bg-surface shadow-card flex min-h-0 flex-col overflow-hidden rounded-lg border",
          // Rozmowa wypełnia ekran; ekrany startowe i podsumowania rosną z treścią.
          isChatLayout ? "flex-1 lg:h-full" : "lg:self-start",
        )}
      >
        <header className="border-line shrink-0 border-b px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={avatar.assetPath}
                alt=""
                width="96"
                height="96"
                className="h-11 w-11 shrink-0 rounded-full object-cover lg:hidden"
                loading="lazy"
              />
              <div className="min-w-0">
                <p className="text-brand text-xs font-medium">{stateCopy[kind].title}</p>
                <h2 className="text-ink mt-0.5 truncate text-lg font-semibold">{avatar.avatarName}</h2>
                <p className="text-brand truncate text-sm">{avatar.modalityName}</p>
              </div>
            </div>
            {canEndSession ? (
              <div className="flex flex-wrap items-center gap-2">
                <SessionTimer
                  key={session.id}
                  expiresAt={session.expiresAt}
                  initialRemainingSeconds={session.remainingSeconds}
                  totalSeconds={getSessionTotalSeconds(session)}
                  onExpired={handleExpired}
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmingEnd(true);
                  }}
                  disabled={isEnding || isMessagePending || isConfirmingEnd}
                  className="border-danger-line bg-surface text-danger hover:bg-danger-soft focus:ring-danger-strong inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CircleStop aria-hidden="true" className="h-4 w-4" />
                  {isEnding ? "Kończenie…" : "Zakończ sesję"}
                </button>
              </div>
            ) : null}
          </div>

          {canEndSession && isConfirmingEnd ? (
            <div
              ref={confirmEndRef}
              role="alertdialog"
              aria-label="Potwierdź zakończenie sesji"
              tabIndex={-1}
              className="border-danger-line bg-danger-soft text-danger mt-4 rounded-lg border p-4 text-sm leading-6 focus:outline-none"
            >
              <p className="font-semibold">Na pewno zakończyć sesję?</p>
              <p className="mt-1">Zakończonej rozmowy nie da się wznowić, ale jej zapis pozostanie w historii.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmingEnd(false);
                    void endSession();
                  }}
                  disabled={isEnding || isMessagePending}
                  className="bg-danger-strong hover:bg-danger focus:ring-danger-strong inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Zakończ teraz
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmingEnd(false);
                  }}
                  className="border-line-strong bg-surface text-ink-soft hover:bg-surface-soft focus:ring-brand-ring inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors focus:ring-2 focus:outline-none"
                >
                  Wróć do rozmowy
                </button>
              </div>
            </div>
          ) : null}

          <details className="mt-3 lg:hidden">
            <summary className="text-brand cursor-pointer list-none text-xs font-medium">
              Granice rozmowy i perspektywa
            </summary>
            <p className="text-ink-muted mt-2 text-xs leading-5">{BOUNDARIES_COPY}</p>
            <a href="/dashboard/avatar" className="text-brand mt-2 inline-block text-xs font-medium underline">
              Zmień awatara
            </a>
          </details>
        </header>

        <div className={cn("flex flex-col gap-4 px-5", isChatLayout ? "min-h-0 flex-1 py-4" : "py-5")}>
          {(!isChatLayout || messages.length === 0) && !notice ? (
            <p className="text-ink-muted shrink-0 text-sm leading-6">{stateCopy[kind].body}</p>
          ) : null}

          {notice ? (
            <div className="max-h-[45%] shrink-0 overflow-y-auto">
              <SessionSafetyNotice
                variant={notice.variant}
                copy={notice.copy}
                crisisResources={notice.crisisResources}
              />
            </div>
          ) : null}

          {showHistoryCta ? (
            <a
              href="/dashboard"
              className="border-line-accent bg-surface text-brand hover:bg-surface-hover focus:ring-brand-ring inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-lg border px-4 text-sm font-medium transition-colors focus:ring-2 focus:outline-none"
            >
              <History aria-hidden="true" className="h-4 w-4" />
              Przejdź do historii i podsumowania
            </a>
          ) : null}

          {contextPanel}
          {startAction}

          {session ? (
            <SessionMessages
              variant="live"
              messages={messages}
              isPending={isMessagePending}
              pendingUserText={pendingUserText}
              assistantAvatar={avatar}
            />
          ) : null}
        </div>

        {session && kind === "active" ? (
          <div className="border-line shrink-0 border-t px-5 py-4">
            <SessionComposer
              value={draft}
              isDisabled={!composerAvailable}
              isPending={isMessagePending}
              onChange={setDraft}
              onSubmit={() => {
                void sendMessage();
              }}
            />
          </div>
        ) : null}
      </section>

      <aside
        className={cn(
          "border-line bg-surface-soft hidden rounded-lg border p-5 lg:block",
          isChatLayout ? "lg:max-h-full lg:overflow-y-auto" : "lg:sticky lg:top-0 lg:self-start",
        )}
      >
        <img
          src={avatar.assetPath}
          alt={avatar.altText}
          width="384"
          height="384"
          className="aspect-square w-full rounded-lg object-cover"
          loading="lazy"
        />
        <p className="text-ink-muted mt-4 text-sm leading-6">{PERSPECTIVE_COPY}</p>
        <div className="border-line text-ink-muted mt-5 border-t pt-4 text-sm leading-6">
          <div className="flex items-start gap-3">
            <ShieldCheck aria-hidden="true" className="text-brand mt-1 h-4 w-4 shrink-0" />
            <div>
              <p className="text-ink font-semibold">Granice rozmowy</p>
              <p className="mt-1">{BOUNDARIES_COPY}</p>
            </div>
          </div>
        </div>
        <a
          href="/dashboard/avatar"
          className="border-line-accent bg-surface text-brand hover:bg-surface-hover focus:ring-brand-ring mt-4 inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors focus:ring-2 focus:outline-none"
        >
          Zmień awatara
        </a>
      </aside>
    </div>
  );
}
