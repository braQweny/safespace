import { useEffect, useState, useSyncExternalStore } from "react";
import { Copy } from "lucide-react";
import { useLocale } from "@/components/hooks/useLocale";
import { useSessionChrome } from "@/components/hooks/useSessionChrome";
import { useSessionSummary } from "@/components/hooks/useSessionSummary";
import { useTimedSession } from "@/components/hooks/useTimedSession";
import { useVisualViewportBox } from "@/components/hooks/useVisualViewportBox";
import { useAvatarMemoryPreparation } from "@/components/hooks/useAvatarMemoryPreparation";
import { usePeopleMemoryPreparation } from "@/components/hooks/usePeopleMemoryPreparation";
import { LocaleProvider } from "@/components/LocaleProvider";
import SessionSummaryPanel from "@/components/modality/SessionSummaryPanel";
import type { Locale } from "@/lib/i18n/locale";
import type { LatestSessionSummaryState } from "@/lib/session-data/types";
import { getSessionCopy } from "@/lib/session-copy";
import { formatRemainingFreeSessions } from "@/lib/session-flow/plan-copy";
import type { SessionStartPageState } from "@/lib/session-flow/session-state";
import { cn } from "@/lib/utils";
import SessionBoundariesToggle from "./SessionBoundariesToggle";
import SessionClosingCard from "./SessionClosingCard";
import SessionComposer from "./SessionComposer";
import SessionMessages from "./SessionMessages";
import SessionSafetyNotice from "./SessionSafetyNotice";
import SessionScreenHeader from "./SessionScreenHeader";
import SessionStarterPrompts from "./SessionStarterPrompts";
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
  /** Po zakończonej rozmowie przygotuj w tle także karty osób i mapę tematów (którakolwiek flaga). */
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
  const chrome = useSessionChrome();
  const { summaryState, summaryStatus, summaryErrorCode, generateSummary, approveSummary } =
    useSessionSummary(initialSummary);
  const viewportBox = useVisualViewportBox();
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
      <SessionScreenHeader
        avatar={avatar}
        stateTitle={stateCopy[kind].title}
        session={session}
        canEndSession={canEndSession}
        isEnding={isEnding}
        isConfirmingEnd={chrome.isConfirmingEnd}
        onExpired={handleExpired}
        onRequestEnd={chrome.requestEnd}
        onConfirmEnd={() => {
          chrome.closeEndConfirmation();
          void endSession();
        }}
        onCancelEnd={chrome.cancelEndConfirmation}
        endButtonRef={chrome.endButtonRef}
        confirmEndRef={chrome.confirmEndRef}
        crisisTriggerRef={chrome.crisisTriggerRef}
        isCrisisHelpOpen={chrome.isCrisisHelpOpen}
        onToggleCrisisHelp={chrome.toggleCrisisHelp}
        onCloseCrisisHelp={chrome.closeCrisisHelp}
      />

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
            <SessionClosingCard
              title={stateCopy[kind].title}
              body={stateCopy[kind].body}
              historyHref={historyHref}
              remainingSessionsCopy={remainingSessionsCopy}
            >
              {unsentText && kind !== "interrupted" ? <UnsentMessageNotice text={unsentText} /> : null}
            </SessionClosingCard>

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
            <SessionBoundariesToggle />
          </div>
        </div>
      ) : null}
    </div>
  );
}
