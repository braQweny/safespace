import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Copy, History, Loader2 } from "lucide-react";
import { useLocale } from "@/components/hooks/useLocale";
import { useSessionSummary } from "@/components/hooks/useSessionSummary";
import { useTimedSession } from "@/components/hooks/useTimedSession";
import { useVisualViewportBox } from "@/components/hooks/useVisualViewportBox";
import { useAvatarMemoryPreparation } from "@/components/hooks/useAvatarMemoryPreparation";
import { usePeopleMemoryPreparation } from "@/components/hooks/usePeopleMemoryPreparation";
import { LocaleProvider } from "@/components/LocaleProvider";
import SessionSummaryPanel from "@/components/modality/SessionSummaryPanel";
import type { Locale } from "@/lib/i18n/locale";
import { getModalityCopy } from "@/lib/modality-copy";
import type { LatestSessionSummaryState } from "@/lib/session-data/types";
import { getSessionCopy } from "@/lib/session-copy";
import { formatRemainingFreeSessions } from "@/lib/session-flow/plan-copy";
import type { SessionStartPageState, SessionView } from "@/lib/session-flow/session-state";
import { cn } from "@/lib/utils";
import { CrisisHelpPanel, CrisisHelpTrigger } from "./CrisisHelpPanel";
import SessionComposer from "./SessionComposer";
import SessionMessages from "./SessionMessages";
import SessionSafetyNotice from "./SessionSafetyNotice";
import SessionStarterPrompts from "./SessionStarterPrompts";
import SessionTimer from "./SessionTimer";
import { getTimedSessionCopy } from "./timed-session-copy";

interface TimedSessionProps {
  locale: Locale;
  initialState: SessionStartPageState;
  /**
   * Podsumowanie zakończonej rozmowy jest częścią jej zakończenia, nie osobnym
   * zadaniem w historii — dlatego stan przychodzi już z serwera.
   */
  initialSummary?: LatestSessionSummaryState | null;
  /**
   * Zdanie z karty osoby („Porozmawiaj o tej osobie”), wstawione do pola przed
   * pierwszą wiadomością. Użytkownik je edytuje i sam decyduje, co wyśle.
   */
  initialDraft?: string | null;
  /** Po zakończonej rozmowie przygotuj w tle także karty osób (flaga funkcji). */
  prepareCards?: boolean;
}

const noop = () => undefined;

const subscribeNever = () => () => {
  // Dostępność schowka nie zmienia się po hydratacji.
};

const readServerFalse = () => false;

function readClientClipboardSupport() {
  if (typeof navigator === "undefined") {
    return false;
  }

  // Schowka nie ma w niezabezpieczonym kontekście i w części WebView, choć
  // typy DOM deklarują go jako zawsze obecny.
  const browserNavigator: Partial<Pick<Navigator, "clipboard">> = navigator;

  return typeof browserNavigator.clipboard?.writeText === "function";
}

/**
 * Słowa, które nie zdążyły wyjść przed końcem czasu, wracają do użytkownika
 * na karcie zamknięcia — do skopiowania, jeśli przeglądarka na to pozwala, a
 * przynajmniej do przeczytania. Nigdy po zatrzymaniu bezpieczeństwa.
 */
export function UnsentMessageNotice({ text }: { text: string }) {
  const { turn } = getSessionCopy(useLocale());
  const canCopy = useSyncExternalStore(subscribeNever, readClientClipboardSupport, readServerFalse);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copyUnsentText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <div className="border-line-accent bg-surface-soft mt-4 rounded-2xl border p-4 sm:p-5">
      <p className="text-ink-soft text-sm font-medium">{turn.unsentMessage}</p>
      <blockquote className="text-ink mt-2 text-base leading-relaxed whitespace-pre-wrap">{text}</blockquote>
      {canCopy ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={copyUnsentText}
            className="border-line-accent bg-surface text-ink hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
          >
            <Copy aria-hidden="true" className="h-4 w-4" />
            {copyStatus === "copied" ? turn.copiedUnsent : turn.copyUnsent}
          </button>
          <p role="status" className={cn("text-ink-muted text-xs", copyStatus !== "failed" && "sr-only")}>
            {copyStatus === "copied" ? turn.copiedUnsent : copyStatus === "failed" ? turn.copyUnsentFailed : null}
          </p>
        </div>
      ) : null}
    </div>
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

export default function TimedSession({
  locale,
  initialState,
  initialSummary = null,
  initialDraft = null,
  prepareCards = false,
}: TimedSessionProps) {
  // Korzeń islandu: język przychodzi propsem z Astro i wchodzi do drzewa tutaj.
  return (
    <LocaleProvider locale={locale}>
      <TimedSessionView
        initialState={initialState}
        initialSummary={initialSummary}
        initialDraft={initialDraft}
        prepareCards={prepareCards}
      />
    </LocaleProvider>
  );
}

function TimedSessionView({
  initialState,
  initialSummary,
  initialDraft = null,
  prepareCards = false,
}: Omit<TimedSessionProps, "locale">) {
  const locale = useLocale();
  const copy = getTimedSessionCopy(locale);
  const { boundaries } = getSessionCopy(locale);
  const stateCopy = copy.states;
  const { state, composerAvailable, handleExpired, setDraft, sendMessage, endSession } = useTimedSession(initialState, {
    locale,
    initialDraft,
  });
  const {
    kind,
    session,
    messages,
    draft,
    isEnding,
    isMessagePending,
    isResponseSlow,
    pendingUserText,
    unsentText,
    notice,
  } = state;
  const isFinished = session !== null && (kind === "completed" || kind === "expired" || kind === "interrupted");
  useAvatarMemoryPreparation(initialState.avatar.modality, isFinished);
  // Karty osób dojeżdżają osobną pętlą po pamięci; ten ekran nie ma czego
  // odświeżać, więc bez wywołania zwrotnego.
  usePeopleMemoryPreparation(initialState.avatar.modality, prepareCards && isFinished, noop);
  const [isConfirmingEnd, setIsConfirmingEnd] = useState(false);
  const [isCrisisHelpOpen, setIsCrisisHelpOpen] = useState(false);
  // Granice muszą być na widoku przez całą rozmowę, ale na telefonie trzy
  // linijki nad polem pisania zabierały ekran rozmowie. Zwinięte do jednej,
  // rozwijane jednym dotknięciem — ten sam tekst, nie skrócona obietnica.
  const [areBoundariesOpen, setAreBoundariesOpen] = useState(false);
  const { summaryState, summaryStatus, summaryErrorCode, generateSummary, approveSummary } =
    useSessionSummary(initialSummary);
  const viewportBox = useVisualViewportBox();
  const confirmEndRef = useRef<HTMLDivElement | null>(null);
  const endButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreEndFocusRef = useRef(false);
  const crisisTriggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreCrisisFocusRef = useRef(false);

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
  // Ten sam wzorzec co przy dialogu zakończenia: po Escape albo „Zamknij”
  // fokus wraca na „Pomoc”, a nie na początek dokumentu.
  useEffect(() => {
    if (isCrisisHelpOpen || !restoreCrisisFocusRef.current) {
      return;
    }

    restoreCrisisFocusRef.current = false;
    crisisTriggerRef.current?.focus();
  }, [isCrisisHelpOpen]);
  const closeCrisisHelp = useCallback(() => {
    restoreCrisisFocusRef.current = true;
    setIsCrisisHelpOpen(false);
  }, []);
  const toggleCrisisHelp = useCallback(() => {
    setIsCrisisHelpOpen((open) => !open);
  }, []);
  const canEndSession = kind === "active" && session?.status === "active";
  // Zamknięcie karty z niewysłanym zdaniem w polu kasuje je bez śladu, więc
  // przeglądarka pyta — dopóki rozmowa trwa i coś w polu stoi. Nietknięty
  // prefill z karty osoby to jeszcze nie słowa użytkownika.
  const shouldGuardDraft = canEndSession && draft.trim().length > 0 && draft !== (initialDraft ?? "");

  useEffect(() => {
    if (!shouldGuardDraft) {
      return;
    }

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", warnBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [shouldGuardDraft]);
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
  const avatarCopy = getModalityCopy(locale, avatar.modalityId);
  const avatarFirstName = avatar.avatarFirstName;
  const remainingSessionsCopy = formatRemainingFreeSessions(locale, initialState.sessionQuota);
  // Powiadomienia tury (odpowiedź nie dotarła, ponów, błąd wysyłki) stoją przy
  // polu pisania, gdzie jest wzrok i kciuk. Zatrzymanie bezpieczeństwa i stany
  // końcowe zostają u góry, bo zastępują rozmowę, a nie komentują jedną turę.
  const isTurnNotice = notice !== null && notice.variant !== "hard_stop" && kind === "active" && session !== null;
  // Gdy istnieje sesja, strona zachowuje się jak komunikator: nagłówek i pole
  // wpisywania są przypięte, a przewija się wyłącznie zapis rozmowy.
  const isChatLayout = Boolean(session);
  // Klawiatura ekranowa w Safari i w części WebView nie zmniejsza layout
  // viewportu, tylko przesuwa stronę. Rozmowa dopasowuje się wtedy sama do
  // widocznego wycinka, żeby pole pisania nie zostało pod klawiaturą. Chromium
  // na Androidzie załatwia to meta `interactive-widget` i tu dostaje `null`.
  const keyboardAwareStyle =
    isChatLayout && kind === "active" && viewportBox
      ? { height: `${viewportBox.height}px`, transform: `translateY(${viewportBox.offsetTop}px)` }
      : undefined;

  return (
    // Rozmowa jest jedną kolumną tekstu na całej wysokości ekranu: bez ramki,
    // bez bocznego panelu. Wszystko, co nie jest rozmową (granice, pomoc,
    // czas), siedzi w cienkim pasku u góry albo w jednej linijce pod polem.
    <div className={cn("flex h-full w-full flex-col", !isChatLayout && "overflow-y-auto")} style={keyboardAwareStyle}>
      <header className="border-line bg-surface/70 relative z-10 shrink-0 border-b backdrop-blur">
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
              aria-label={copy.backToDashboard}
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
              {/* Na telefonie samo imię: pełna nazwa perspektywy stoi przy każdej
                  wypowiedzi w zapisie, a w jednym rzędzie paska liczy się każdy
                  piksel — to on robi miejsce na „Zakończ” słowem. */}
              <h1 className="text-ink truncate font-sans text-[15px] leading-tight font-semibold tracking-normal">
                <span className="sm:hidden">{avatarFirstName}</span>
                <span className="hidden sm:inline">{avatarCopy.avatarName}</span>
              </h1>
              <p className="text-ink-muted hidden truncate text-xs leading-tight sm:block">{avatarCopy.modalityName}</p>
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
                <CrisisHelpTrigger ref={crisisTriggerRef} isOpen={isCrisisHelpOpen} onToggle={toggleCrisisHelp} />
                {/* Tura w locie nie blokuje wyjścia: serwer sam sprawdza status
                    sesji, zanim zapisze odpowiedź. */}
                <button
                  ref={endButtonRef}
                  type="button"
                  onClick={() => {
                    setIsConfirmingEnd(true);
                  }}
                  disabled={isEnding || isConfirmingEnd}
                  className="text-ink-muted hover:bg-surface-soft hover:text-ink focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full px-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3.5"
                >
                  {/* Słowo, nie ikona: drzwi nie są konwencją „zakończ”, a jedynego
                      wyjścia z rozmowy nie powinno się zgadywać. Na telefonie
                      krócej, jak „Pomoc” obok „Pomoc teraz”. */}
                  {isEnding ? (
                    <>
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                      <span>{copy.ending}</span>
                    </>
                  ) : (
                    <>
                      <span className="sm:hidden">{copy.endShort}</span>
                      <span className="hidden sm:inline">{copy.endLong}</span>
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
                <CrisisHelpTrigger ref={crisisTriggerRef} isOpen={isCrisisHelpOpen} onToggle={toggleCrisisHelp} />
              </>
            )}
          </div>
        </div>

        {isCrisisHelpOpen ? (
          // Nakładka pod paskiem, nie wstawka w nagłówku: wstawiony w `shrink-0`
          // nagłówek panel z numerami spychał na telefonie zapis i pole pisania
          // za ekran, a sam kończył się poza nim bez możliwości przewinięcia.
          // Pływa nad rozmową, która zostaje na swoim miejscu, i przewija się sam.
          <div className="absolute inset-x-0 top-full z-20 px-4 pb-4 sm:px-6">
            <CrisisHelpPanel onClose={closeCrisisHelp} />
          </div>
        ) : null}

        {canEndSession && isConfirmingEnd ? (
          <div className="px-4 pb-4 sm:px-6">
            <div
              ref={confirmEndRef}
              role="alertdialog"
              aria-label={copy.confirmEndAria}
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
              <p className="text-ink font-serif text-lg leading-snug font-medium">{copy.confirmEndTitle}</p>
              <p className="mt-1">{copy.confirmEndBody}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmingEnd(false);
                    void endSession();
                  }}
                  disabled={isEnding}
                  className="bg-brand-deep text-surface hover:bg-brand-strong focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {copy.confirmEndNow}
                </button>
                <button
                  type="button"
                  onClick={cancelEndConfirmation}
                  className="border-line-accent bg-surface text-ink hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
                >
                  {copy.confirmEndCancel}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <div
        className={cn(
          "flex flex-col",
          isChatLayout ? "min-h-0 flex-1" : "flex-1",
          // Po zakończeniu rozmowy przewija się cała kolumna: karta zamknięcia,
          // podsumowanie i zapis razem. Zapis w osobnym scrollu kurczył się na
          // małym telefonie do kilku linijek, a dół karty był odcięty na stałe.
          isChatLayout && showHistoryCta && "overflow-y-auto overscroll-contain",
        )}
      >
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
              <span className="text-ink-soft font-medium">{copy.boundariesLabel}</span> {boundaries}
            </p>
            <a
              href="/dashboard"
              className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring mt-5 inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
            >
              {copy.backToDashboard}
            </a>
          </div>
        ) : null}

        {notice && !isTurnNotice ? (
          <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-5 sm:px-6">
            {/* Bez własnego scrolla: po zatrzymaniu rozmowa jest zakończona, więc
                przewija się cała kolumna, a zagnieżdżony scroll w 60vh na telefonie
                tylko łapał palec w połowie listy numerów. */}
            <SessionSafetyNotice variant={notice.variant} copy={notice.copy} crisisResources={notice.crisisResources} />
          </div>
        ) : null}

        {showHistoryCta ? (
          <div className="mx-auto w-full max-w-3xl shrink-0 space-y-4 px-4 pt-5 sm:px-6">
            {/* Jeden krok główny po rozmowie: powrót do panelu. Zapis obok, cicho. */}
            <div className="border-line-strong bg-surface shadow-card rounded-[20px] border p-5 sm:p-7">
              <h2 className="text-ink font-serif text-2xl leading-tight font-medium sm:text-[28px]">
                {stateCopy[kind].title}
              </h2>
              <p className="text-ink-soft mt-2 text-base leading-7">{stateCopy[kind].body}</p>
              {unsentText && kind !== "interrupted" ? <UnsentMessageNotice text={unsentText} /> : null}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
                <a
                  href="/dashboard"
                  className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring inline-flex h-12 items-center justify-center rounded-[14px] px-6 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2"
                >
                  {copy.backToDashboard}
                </a>
                <a
                  href={historyHref}
                  className="border-line-accent bg-surface text-ink hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-12 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
                >
                  <History aria-hidden="true" className="h-4 w-4" />
                  {copy.openTranscript}
                </a>
              </div>
              {remainingSessionsCopy ? (
                <p className="text-ink-muted mt-3 text-[13px] leading-5">{remainingSessionsCopy}</p>
              ) : null}
            </div>

            {/* Podsumowanie tej jednej rozmowy: zdanie i przycisk, bo pamięć
                rozmów nie czeka na ten krok. */}
            <SessionSummaryPanel
              summaryState={summaryState}
              summaryStatus={summaryStatus}
              summaryErrorCode={summaryErrorCode}
              canSummarize={canSummarizeSession}
              onGenerate={handleGenerateSummary}
              onApprove={handleApproveSummary}
            />

            {/* Jedno zastrzeżenie na ekran, pod kartą, a nie w niej. */}
            <p className="text-ink-muted text-xs leading-5">
              <span className="text-ink-soft font-medium">{copy.boundariesLabel}</span> {boundaries}{" "}
              <a
                href="/dashboard/avatar"
                className="text-brand focus-visible:ring-brand-ring rounded font-medium underline underline-offset-4 focus:outline-none focus-visible:ring-2"
              >
                {copy.changePerspective}
              </a>
            </p>
          </div>
        ) : null}

        {session ? (
          <SessionMessages
            variant={showHistoryCta ? "finished" : "live"}
            messages={messages}
            isPending={isMessagePending}
            isResponseSlow={isResponseSlow}
            pendingUserText={pendingUserText}
            assistantAvatar={avatar}
          />
        ) : null}
      </div>

      {session && kind === "active" ? (
        <div className="border-line shrink-0 border-t px-4 pt-3 pb-4 sm:px-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            {notice && isTurnNotice ? (
              <SessionSafetyNotice
                variant={notice.variant}
                copy={notice.copy}
                crisisResources={notice.crisisResources}
              />
            ) : null}
            {!hasUserMessage && !pendingUserText && draft.length === 0 ? (
              <SessionStarterPrompts isDisabled={!composerAvailable || isMessagePending} onSelect={setDraft} />
            ) : null}
            <SessionComposer
              sessionId={session.id}
              value={draft}
              isDisabled={!composerAvailable}
              isPending={isMessagePending}
              autoFocus={Boolean(initialDraft)}
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
                <span className="text-ink-soft font-medium">{copy.boundariesLabel}</span> {boundaries}
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
