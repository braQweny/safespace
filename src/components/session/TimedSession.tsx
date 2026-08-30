import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, DoorOpen, History, Loader2 } from "lucide-react";
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
  // Granice muszą być na widoku przez całą rozmowę, ale na telefonie trzy
  // linijki nad polem pisania zabierały ekran rozmowie. Zwinięte do jednej,
  // rozwijane jednym dotknięciem — ten sam tekst, nie skrócona obietnica.
  const [areBoundariesOpen, setAreBoundariesOpen] = useState(false);
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
  // Podpowiedzi startowe pomagają przy pierwszym zdaniu, więc znikają dopiero
  // wtedy, gdy użytkownik sam coś napisze — nie wtedy, gdy w rozmowie pojawi
  // się cokolwiek. Sesja startuje z wiadomością otwierającą awatara, więc
  // warunek „brak wiadomości” chował je zawsze.
  const hasUserMessage = messages.some((message) => message.role === "user");

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
    // Rozmowa jest jedną kolumną tekstu na całej wysokości ekranu: bez ramki,
    // bez bocznego panelu. Wszystko, co nie jest rozmową (granice, pomoc,
    // czas), siedzi w cienkim pasku u góry albo w jednej linijce pod polem.
    <div className={cn("flex h-full w-full flex-col", !isChatLayout && "overflow-y-auto")}>
      <header className="border-line bg-surface/70 relative shrink-0 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5 sm:gap-x-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            {/*
              Ten pasek jest jedynym nagłówkiem strony rozmowy. Wcześniej stał pod
              `AppHeader`, więc na telefonie 120 px znikało na dwa paski, zanim
              pojawiło się słowo rozmowy — a jedyne, co robił ten drugi, to powrót
              do panelu. Łuk przejmuje dokładnie to zadanie.
            */}
            <a
              href="/dashboard"
              aria-label="Wróć do panelu"
              className="border-line-strong bg-surface hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="h-[22px] w-[22px]">
                <path
                  d="M4.5 21.5V12a7.5 7.5 0 0 1 15 0v9.5Z"
                  className="fill-brand-soft stroke-brand"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
            {/* Twarz stoi przy każdej wypowiedzi w zapisie, więc na telefonie
                w pasku jest zbędna — tam liczy się każdy piksel szerokości. */}
            <img
              src={avatar.assetPath}
              alt=""
              width="96"
              height="96"
              className="hidden h-9 w-9 shrink-0 rounded-full object-cover sm:block"
              loading="lazy"
            />
            <div className="min-w-0">
              <h1 className="text-ink truncate font-sans text-[15px] leading-tight font-semibold tracking-normal">
                {avatar.avatarName}
              </h1>
              <p className="text-ink-muted truncate text-xs leading-tight">{avatar.modalityName}</p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-3">
            {canEndSession ? (
              <>
                {/* Stan czyta się z pierścienia; czytnik ekranu dostaje go słowami. */}
                <p className="sr-only">{stateCopy[kind].title}</p>
                <SessionTimer
                  key={session.id}
                  expiresAt={session.expiresAt}
                  initialRemainingSeconds={session.remainingSeconds}
                  totalSeconds={getSessionTotalSeconds(session)}
                  onExpired={handleExpired}
                />
                <CrisisHelpTrigger
                  isOpen={isCrisisHelpOpen}
                  onToggle={() => {
                    setIsCrisisHelpOpen((open) => !open);
                  }}
                />
                <button
                  ref={endButtonRef}
                  type="button"
                  onClick={() => {
                    setIsConfirmingEnd(true);
                  }}
                  disabled={isEnding || isMessagePending || isConfirmingEnd}
                  aria-label="Zakończ sesję"
                  className="text-ink-muted hover:bg-surface-soft hover:text-ink focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3.5"
                >
                  {isEnding ? (
                    <>
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin sm:hidden" />
                      <span className="hidden sm:inline">Kończenie…</span>
                    </>
                  ) : (
                    <>
                      <DoorOpen aria-hidden="true" className="h-4 w-4 sm:hidden" />
                      <span className="hidden sm:inline">Zakończ sesję</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <p className="text-ink-muted inline-flex items-center gap-2 text-sm">
                  <span aria-hidden="true" className="bg-clay h-2 w-2 shrink-0 rounded-full" />
                  {stateCopy[kind].title}
                </p>
                <CrisisHelpTrigger
                  isOpen={isCrisisHelpOpen}
                  onToggle={() => {
                    setIsCrisisHelpOpen((open) => !open);
                  }}
                />
              </>
            )}
          </div>
        </div>

        {isCrisisHelpOpen ? (
          <div className="px-4 pb-4 sm:px-6">
            <CrisisHelpPanel onClose={closeCrisisHelp} />
          </div>
        ) : null}

        {canEndSession && isConfirmingEnd ? (
          <div className="px-4 pb-4 sm:px-6">
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
              className="border-line-accent bg-surface text-ink-soft shadow-card mx-auto mt-1 w-full max-w-3xl rounded-2xl border p-5 text-sm leading-6 focus:outline-none"
            >
              <p className="text-ink font-serif text-lg leading-snug font-medium">Na pewno zakończyć sesję?</p>
              <p className="mt-1">Zakończonej rozmowy nie da się wznowić, ale jej zapis pozostanie w historii.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmingEnd(false);
                    void endSession();
                  }}
                  disabled={isEnding || isMessagePending}
                  className="bg-brand-deep text-surface hover:bg-brand-strong focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Zakończ teraz
                </button>
                <button
                  type="button"
                  onClick={cancelEndConfirmation}
                  className="border-line-accent bg-surface text-ink hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
                >
                  Wróć do rozmowy
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <div className={cn("flex flex-col", isChatLayout ? "min-h-0 flex-1" : "flex-1")}>
        {/* The closing card below repeats this copy verbatim for finished sessions. */}
        {(!isChatLayout || messages.length === 0) && !notice && !showHistoryCta ? (
          <p className="text-ink-muted mx-auto w-full max-w-3xl shrink-0 px-4 pt-6 text-sm leading-6 sm:px-6">
            {stateCopy[kind].body}
          </p>
        ) : null}

        {/* Bez sesji nie ma pola wpisywania, więc granice stoją tu — pod zdaniem
            odsyłającym do panelu. */}
        {!session ? (
          <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
            <p className="text-ink-muted text-xs leading-5">
              <span className="text-ink-soft font-medium">Granice rozmowy:</span> {SESSION_BOUNDARIES_COPY}
            </p>
            <a
              href="/dashboard"
              className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring mt-5 inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
            >
              Wróć do panelu
            </a>
          </div>
        ) : null}

        {notice ? (
          <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-5 sm:px-6">
            <div className="max-h-[60vh] overflow-y-auto">
              <SessionSafetyNotice
                variant={notice.variant}
                copy={notice.copy}
                crisisResources={notice.crisisResources}
              />
            </div>
          </div>
        ) : null}

        {showHistoryCta ? (
          <div className="mx-auto w-full max-w-3xl shrink-0 space-y-4 px-4 pt-5 sm:px-6">
            <div className="border-line-strong bg-surface shadow-card rounded-2xl border p-5 sm:p-6">
              <h2 className="text-ink font-serif text-2xl leading-tight font-medium">{stateCopy[kind].title}</h2>
              <p className="text-ink-soft mt-2 text-sm leading-6">{stateCopy[kind].body}</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <a
                  href="/dashboard"
                  className="border-line-accent bg-surface text-ink hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
                >
                  Wróć do panelu
                </a>
                <a
                  href={historyHref}
                  className="border-line-accent bg-surface text-ink hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
                >
                  <History aria-hidden="true" className="h-4 w-4" />
                  Otwórz w historii
                </a>
              </div>
              <p className="text-ink-muted border-line mt-5 border-t pt-4 text-xs leading-5">
                {SESSION_PERSPECTIVE_COPY}{" "}
                <a
                  href="/dashboard/avatar"
                  className="text-brand focus-visible:ring-brand-ring rounded font-medium underline underline-offset-4 focus:outline-none focus-visible:ring-2"
                >
                  Zmień perspektywę
                </a>
              </p>
              <p className="text-ink-muted mt-2 text-xs leading-5">
                <span className="text-ink-soft font-medium">Granice rozmowy:</span> {SESSION_BOUNDARIES_COPY}
              </p>
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
        <div className="border-line shrink-0 border-t px-4 pt-3 pb-4 sm:px-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            {!hasUserMessage && !pendingUserText && draft.length === 0 ? (
              <SessionStarterPrompts isDisabled={!composerAvailable || isMessagePending} onSelect={setDraft} />
            ) : null}
            <SessionComposer
              sessionId={session.id}
              value={draft}
              isDisabled={!composerAvailable}
              isPending={isMessagePending}
              onChange={setDraft}
              onSubmit={() => {
                void sendMessage();
              }}
            />
            {/* Jedna cicha linijka zamiast bocznego panelu: granice są zawsze na
                widoku, ale nie konkurują z rozmową. */}
            <button
              type="button"
              aria-expanded={areBoundariesOpen}
              onClick={() => {
                setAreBoundariesOpen((open) => !open);
              }}
              className="text-ink-muted hover:text-ink focus-visible:ring-brand-ring flex items-start gap-1.5 rounded text-left text-xs leading-5 transition-colors focus:outline-none focus-visible:ring-2"
            >
              <span className={cn(!areBoundariesOpen && "line-clamp-1")}>
                <span className="text-ink-soft font-medium">Granice rozmowy:</span> {SESSION_BOUNDARIES_COPY}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform", areBoundariesOpen && "rotate-180")}
              />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
