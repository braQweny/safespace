import { useCallback, useEffect, useRef, useState } from "react";
import { CircleStop, History, ShieldCheck } from "lucide-react";
import { useSessionSummary } from "@/components/hooks/useSessionSummary";
import { useTimedSession } from "@/components/hooks/useTimedSession";
import SessionSummaryPanel from "@/components/modality/SessionSummaryPanel";
import type { LatestSessionSummaryState } from "@/lib/session-data/types";
import { SESSION_BOUNDARIES_COPY, SESSION_PERSPECTIVE_COPY } from "@/lib/session-copy";
import type { SessionStartPageState, SessionStartPageStateKind, SessionView } from "@/lib/session-flow/session-state";
import { cn } from "@/lib/utils";
import { CrisisHelpPanel, CrisisHelpTrigger } from "./CrisisHelpPanel";
import SessionComposer from "./SessionComposer";
import SessionMessages from "./SessionMessages";
import SessionSafetyNotice from "./SessionSafetyNotice";
import SessionStarterPrompts from "./SessionStarterPrompts";
import SessionTimer from "./SessionTimer";

interface TimedSessionProps {
  initialState: SessionStartPageState;
  /**
   * Podsumowanie zakończonej rozmowy jest częścią jej zakończenia, nie osobnym
   * zadaniem w historii — dlatego stan przychodzi już z serwera.
   */
  initialSummary?: LatestSessionSummaryState | null;
}

// Rozmowa startuje w panelu, więc strona rozmowy widuje wyłącznie stany z sesją.
// Pozostałe wpisy zostają dla kompletności typu i wracają użytkownika do panelu.
const stateCopy: Record<SessionStartPageStateKind, { title: string; body: string }> = {
  ready: {
    title: "Rozmowa jeszcze się nie zaczęła",
    body: "Rozmowę rozpoczniesz w panelu — tam jest przycisk startu i informacja, z czym się zacznie.",
  },
  active: {
    title: "Sesja jest aktywna",
    body: "Możesz pisać wiadomości, dopóki trwa czas sesji.",
  },
  expired: {
    title: "Limit czasu został osiągnięty",
    body: "Czas tej rozmowy minął i nie można już wysyłać nowych wiadomości. Zapis pozostaje w historii — możesz go podsumować poniżej.",
  },
  completed: {
    title: "Sesja została zakończona",
    body: "Rozmowa została prywatnie zapisana. Nic z niej nie przechodzi dalej samo z siebie — podsumowanie do kolejnej sesji powstaje dopiero wtedy, gdy je wygenerujesz i zatwierdzisz.",
  },
  interrupted: {
    title: "Sesja została przerwana",
    body: "Rozmowa została zatrzymana w bezpiecznym stanie. Zwykła symulacja nie będzie kontynuowana w tej sesji.",
  },
  followup_ready: {
    title: "Rozmowa jeszcze się nie zaczęła",
    body: "Kolejną rozmowę rozpoczniesz w panelu — tam zdecydujesz też, czy przekazać do niej zatwierdzone podsumowanie.",
  },
  trial_already_claimed: {
    title: "Pierwsza darmowa rozmowa została już wykorzystana",
    body: "Pierwsza darmowa sesja została już użyta na tym koncie. Kolejną rozmowę rozpoczniesz w panelu, a zapis tej znajdziesz w historii.",
  },
  session_limit_reached: {
    title: "Limit bezpłatnych rozmów został wykorzystany",
    body: "Plan bezpłatny obejmuje trzy rozmowy próbne i wszystkie zostały już użyte na tym koncie. Dalsze rozmowy są dostępne w planie premium; zapisy znajdziesz w historii w panelu.",
  },
  unavailable: {
    title: "Stan sesji jest chwilowo niedostępny",
    body: "Nie udało się potwierdzić dostępności darmowej próby. Spróbuj ponownie za chwilę.",
  },
};

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

export default function TimedSession({ initialState, initialSummary = null }: TimedSessionProps) {
  const { state, composerAvailable, handleExpired, setDraft, sendMessage, endSession } = useTimedSession(initialState);
  const { kind, session, messages, draft, isEnding, isMessagePending, pendingUserText, notice } = state;
  const [isConfirmingEnd, setIsConfirmingEnd] = useState(false);
  const [isCrisisHelpOpen, setIsCrisisHelpOpen] = useState(false);
  const { summaryState, summaryStatus, summaryErrorCode, generateSummary, approveSummary } =
    useSessionSummary(initialSummary);
  const confirmEndRef = useRef<HTMLDivElement | null>(null);
  const endButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreEndFocusRef = useRef(false);

  useEffect(() => {
    if (isConfirmingEnd) {
      confirmEndRef.current?.focus();
      return;
    }

    // Fokus wraca tam, skąd dialog się otworzył — inaczej klawiatura „spada”
    // na początek dokumentu, a czytnik ekranu traci miejsce w rozmowie.
    // Przycisk jest wyłączony, dopóki dialog jest otwarty, więc fokus musi
    // poczekać na render po zamknięciu.
    if (restoreEndFocusRef.current) {
      restoreEndFocusRef.current = false;
      endButtonRef.current?.focus();
    }
  }, [isConfirmingEnd]);
  const cancelEndConfirmation = useCallback(() => {
    restoreEndFocusRef.current = true;
    setIsConfirmingEnd(false);
  }, []);
  const closeCrisisHelp = useCallback(() => {
    setIsCrisisHelpOpen(false);
  }, []);
  const canEndSession = kind === "active" && session?.status === "active";
  const showHistoryCta = kind === "completed" || kind === "expired" || kind === "interrupted";
  // Pusta rozmowa nie ma czego streszczać, a aktywna wciąż trwa.
  const canSummarizeSession = showHistoryCta && messages.length > 0;

  function handleGenerateSummary() {
    if (!session) {
      return;
    }

    void generateSummary(session.id);
  }

  function handleApproveSummary() {
    if (!session) {
      return;
    }

    void approveSummary(session.id);
  }

  // Link straight at the conversation that just ended: landing on a list of
  // same-day entries and hunting for the right one is the wrong last step.
  const historyHref = session ? `/dashboard?session=${encodeURIComponent(session.id)}` : "/dashboard";
  const avatar = initialState.avatar.selected;
  // Gdy istnieje sesja, strona zachowuje się jak komunikator: nagłówek i pole
  // wpisywania są przypięte, a przewija się wyłącznie zapis rozmowy.
  const isChatLayout = Boolean(session);

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
        {/* During a conversation the header competed with the messages for a small
            phone screen, so identity shrinks to one line and the modality — which
            the user already chose and cannot change here — drops out. */}
        <header className={cn("border-line shrink-0 border-b px-5", isChatLayout ? "py-3 lg:py-4" : "py-4")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={avatar.assetPath}
                alt=""
                width="96"
                height="96"
                className={cn("shrink-0 rounded-full object-cover lg:hidden", isChatLayout ? "h-9 w-9" : "h-11 w-11")}
                loading="lazy"
              />
              <div className="min-w-0">
                {canEndSession ? (
                  <a
                    href="/dashboard"
                    className="text-ink-muted hover:text-brand focus:ring-brand-ring mb-1 inline-flex rounded text-xs font-medium transition-colors focus:ring-2 focus:outline-none"
                  >
                    ← Wróć do panelu
                  </a>
                ) : null}
                <p className="text-brand text-xs font-medium">{stateCopy[kind].title}</p>
                <h1 className={cn("text-ink truncate font-semibold", isChatLayout ? "text-base" : "mt-0.5 text-lg")}>
                  {avatar.avatarName}
                </h1>
                <p className={cn("text-brand truncate text-sm", isChatLayout && "hidden lg:block")}>
                  {avatar.modalityName}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEndSession ? (
                <>
                  <SessionTimer
                    key={session.id}
                    expiresAt={session.expiresAt}
                    initialRemainingSeconds={session.remainingSeconds}
                    totalSeconds={getSessionTotalSeconds(session)}
                    onExpired={handleExpired}
                  />
                  <button
                    ref={endButtonRef}
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
                </>
              ) : null}
              <CrisisHelpTrigger
                isOpen={isCrisisHelpOpen}
                onToggle={() => {
                  setIsCrisisHelpOpen((open) => !open);
                }}
              />
            </div>
          </div>

          {isCrisisHelpOpen ? <CrisisHelpPanel onClose={closeCrisisHelp} /> : null}

          {canEndSession && isConfirmingEnd ? (
            <div
              ref={confirmEndRef}
              role="alertdialog"
              aria-label="Potwierdź zakończenie sesji"
              tabIndex={-1}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelEndConfirmation();
                }
              }}
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
                  onClick={cancelEndConfirmation}
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
            <p className="text-ink-muted mt-2 text-xs leading-5">{SESSION_BOUNDARIES_COPY}</p>
            {canEndSession ? (
              <p className="text-ink-muted mt-2 text-xs leading-5">
                Perspektywa obowiązuje do końca tej rozmowy. Zmienisz ją w panelu, przed kolejnym startem.
              </p>
            ) : (
              <a href="/dashboard/avatar" className="text-brand mt-2 inline-block text-xs font-medium underline">
                Zmień awatara
              </a>
            )}
          </details>
        </header>

        <div className={cn("flex flex-col gap-4 px-5", isChatLayout ? "min-h-0 flex-1 py-4" : "py-5")}>
          {/* The closing card below repeats this copy verbatim for finished sessions. */}
          {(!isChatLayout || messages.length === 0) && !notice && !showHistoryCta ? (
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
            <div className="shrink-0 space-y-4">
              <div className="border-line-strong bg-surface-soft rounded-lg border p-4">
                <p className="text-ink font-semibold">{stateCopy[kind].title}</p>
                <p className="text-ink-muted mt-1 text-sm leading-6">{stateCopy[kind].body}</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <a
                    href="/dashboard"
                    className="bg-brand hover:bg-brand-strong focus:ring-brand-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-white transition-colors focus:ring-2 focus:outline-none"
                  >
                    Wróć do panelu
                  </a>
                  <a
                    href={historyHref}
                    className="border-line-accent bg-surface text-brand hover:bg-surface-hover focus:ring-brand-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors focus:ring-2 focus:outline-none"
                  >
                    <History aria-hidden="true" className="h-4 w-4" />
                    Otwórz w historii
                  </a>
                </div>
              </div>

              {/* Decyzja o tym, co przechodzi dalej, zapada tu — zaraz po rozmowie,
                  a nie dopiero po odnalezieniu jej w historii. */}
              <SessionSummaryPanel
                summaryState={summaryState}
                summaryStatus={summaryStatus}
                summaryErrorCode={summaryErrorCode}
                canSummarize={canSummarizeSession}
                onGenerate={handleGenerateSummary}
                onApprove={handleApproveSummary}
              />
            </div>
          ) : null}

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
          <div className="border-line shrink-0 space-y-3 border-t px-5 py-4">
            {messages.length === 0 && !pendingUserText && draft.length === 0 ? (
              <SessionStarterPrompts isDisabled={!composerAvailable || isMessagePending} onSelect={setDraft} />
            ) : null}
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
        <p className="text-ink-muted mt-4 text-sm leading-6">{SESSION_PERSPECTIVE_COPY}</p>
        <div className="border-line text-ink-muted mt-5 border-t pt-4 text-sm leading-6">
          <div className="flex items-start gap-3">
            <ShieldCheck aria-hidden="true" className="text-brand mt-1 h-4 w-4 shrink-0" />
            <div>
              <p className="text-ink font-semibold">Granice rozmowy</p>
              <p className="mt-1">{SESSION_BOUNDARIES_COPY}</p>
            </div>
          </div>
        </div>
        {/* W trakcie rozmowy zmiana i tak zadziała dopiero od następnej sesji,
            więc zamiast przycisku stoi tu zdanie, które to mówi wprost. */}
        {canEndSession ? (
          <p className="text-ink-muted mt-4 text-sm leading-6">
            Perspektywa obowiązuje do końca tej rozmowy. Zmienisz ją w panelu, przed kolejnym startem.
          </p>
        ) : (
          <a
            href="/dashboard/avatar"
            className="border-line-accent bg-surface text-brand hover:bg-surface-hover focus:ring-brand-ring mt-4 inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-colors focus:ring-2 focus:outline-none"
          >
            Zmień awatara
          </a>
        )}
      </aside>
    </div>
  );
}
