import { useEffect, useRef } from "react";
import { Loader2, Mic, MicOff, RefreshCw, Volume2 } from "lucide-react";
import { useAvatarMemoryPreparation } from "@/components/hooks/useAvatarMemoryPreparation";
import { useIsHydrated } from "@/components/hooks/useIsHydrated";
import { useLocale } from "@/components/hooks/useLocale";
import { usePeopleMemoryPreparation } from "@/components/hooks/usePeopleMemoryPreparation";
import { useSessionChrome } from "@/components/hooks/useSessionChrome";
import { useSessionSummary } from "@/components/hooks/useSessionSummary";
import { useVoiceSession } from "@/components/hooks/useVoiceSession";
import { LocaleProvider } from "@/components/LocaleProvider";
import { PILL_BRAND } from "@/components/ui/button-styles";
import SessionSummaryPanel, { SessionSummaryButton } from "@/components/modality/SessionSummaryPanel";
import type { Locale } from "@/lib/i18n/locale";
import type { LatestSessionSummaryState } from "@/lib/session-data/types";
import { getSessionCopy } from "@/lib/session-copy";
import { formatRemainingFreeSessions, getPlanCopy } from "@/lib/session-flow/plan-copy";
import { VOICE_TRIAL_DURATION_SECONDS } from "@/lib/session-flow/session-budget";
import type { SessionStartPageState, SessionView } from "@/lib/session-flow/session-state";
import {
  hasVoiceEndedUnconnected,
  isAwaitingFirstVoiceConnection,
  isVoiceConnected,
  type VoiceSessionUiState,
} from "@/lib/session-flow/voice-session-state";
import { cn } from "@/lib/utils";
import SessionBoundariesToggle from "./SessionBoundariesToggle";
import SessionClosingCard, { shouldClosingCardTakeFocus } from "./SessionClosingCard";
import SessionMessages from "./SessionMessages";
import SessionSafetyNotice from "./SessionSafetyNotice";
import SessionScreenHeader from "./SessionScreenHeader";
import { PRIMARY_BUTTON } from "./start-card-styles";
import { getTimedSessionCopy } from "./timed-session-copy";
import { getVoiceSessionCopy } from "./voice-session-copy";

interface VoiceSessionProps {
  locale: Locale;
  initialState: SessionStartPageState;
  initialSummary?: LatestSessionSummaryState | null;
  /** Po zakończonej rozmowie przygotuj w tle także karty osób i mapę tematów (którakolwiek flaga). */
  prepareCards?: boolean;
  /** Flaga i dostawca po stronie serwera; bez nich przycisk mikrofonu ustępuje miejsca informacji. */
  voiceAvailable: boolean;
}

const noop = () => undefined;

const PILL_CLASS =
  "border-line-accent bg-surface text-ink hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Zamknięcie rozmowy, która nie miała połączenia audio: zamiast „czas minął”
 * albo „rozmowa zakończona” — że nic nie przepadło. Bucket próby (600 s) mówi
 * o jednorazowej rozmowie, każdy dłuższy o puli minut (ta sama granica co w
 * `readVoiceConnectAllowance`).
 */
function withUnconnectedEndCopy(
  states: ReturnType<typeof getTimedSessionCopy>["states"],
  copy: ReturnType<typeof getVoiceSessionCopy>,
  session: SessionView | null,
): ReturnType<typeof getTimedSessionCopy>["states"] {
  const bucketSeconds = session?.durationBucketSeconds ?? 0;
  const unconnected = {
    title: copy.unconnectedEndTitle,
    body: bucketSeconds > VOICE_TRIAL_DURATION_SECONDS ? copy.unconnectedEndPoolBody : copy.unconnectedEndTrialBody,
  };

  return { ...states, expired: unconnected, completed: unconnected };
}

function getStatusLabel(
  state: VoiceSessionUiState,
  avatarFirstName: string,
  copy: ReturnType<typeof getVoiceSessionCopy>["status"],
) {
  switch (state.status) {
    case "connecting":
    case "requesting_mic":
      return copy.connecting;
    case "reconnecting":
      return copy.reconnecting;
    case "paused_safety":
      return copy.paused;
    case "audio_blocked":
      return copy.audioBlocked;
    default:
      if (state.isMuted) {
        return copy.muted;
      }

      return state.isAvatarSpeaking ? copy.speaking(avatarFirstName) : copy.listening;
  }
}

export default function VoiceSession({
  locale,
  initialState,
  initialSummary = null,
  prepareCards = false,
  voiceAvailable,
}: VoiceSessionProps) {
  // Korzeń islandu: język przychodzi propsem z Astro i wchodzi do drzewa tutaj.
  return (
    <LocaleProvider locale={locale}>
      <VoiceSessionView
        initialState={initialState}
        initialSummary={initialSummary}
        prepareCards={prepareCards}
        voiceAvailable={voiceAvailable}
      />
    </LocaleProvider>
  );
}

function VoiceSessionView({
  initialState,
  initialSummary,
  prepareCards = false,
  voiceAvailable,
}: Omit<VoiceSessionProps, "locale">) {
  const locale = useLocale();
  const copy = getVoiceSessionCopy(locale);
  const chromeCopy = getTimedSessionCopy(locale);
  // Te same zdania o puli, co w karcie startu na panelu.
  const planCopy = getPlanCopy(locale);
  const { boundaries } = getSessionCopy(locale);
  const isHydrated = useIsHydrated();
  const {
    state,
    liveFragments,
    remoteStream,
    enableMicrophone,
    reconnect,
    toggleMute,
    reportAudioBlocked,
    reportAudioUnblocked,
    handleExpired,
    endSession,
  } = useVoiceSession(initialState, { locale, voiceAvailable });
  const { kind, session, status, notice, isEnding, isMuted, persistedMessages } = state;
  // Przed pierwszym połączeniem audio zegar stoi (licznik pokazuje pełną
  // długość), a rozmowa zamknięta bez połączenia niczego nie zużyła.
  const awaitingFirstConnection = isAwaitingFirstVoiceConnection(state);
  const stateCopy = hasVoiceEndedUnconnected(state)
    ? withUnconnectedEndCopy(chromeCopy.states, copy, session)
    : chromeCopy.states;
  const isFinished = session !== null && (kind === "completed" || kind === "expired" || kind === "interrupted");
  useAvatarMemoryPreparation(initialState.avatar.selected, isFinished);
  usePeopleMemoryPreparation(initialState.avatar.selected, prepareCards && isFinished, noop);
  const chrome = useSessionChrome();
  const { summaryState, summaryStatus, summaryErrorCode, generateSummary, approveSummary } =
    useSessionSummary(initialSummary);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Dźwięk awatara: element jest zawsze zamontowany, strumień podpina się po
  // `ontrack`. Odtwarzanie zaczęte w łańcuchu dotknięcia „Włącz mikrofon”
  // trzyma zgodę przeglądarki; gdy jej zabraknie, pasek prosi o dotknięcie.
  useEffect(() => {
    const audio = audioRef.current;

    if (!audio || !remoteStream) {
      return;
    }

    audio.srcObject = remoteStream;
    audio.play().then(reportAudioUnblocked, reportAudioBlocked);

    return () => {
      audio.srcObject = null;
    };
  }, [remoteStream, reportAudioBlocked, reportAudioUnblocked]);

  function handleEnableMicrophone() {
    // Pusty element odrzuca `play()`, ale sam wywołanie w łańcuchu dotknięcia
    // odblokowuje późniejsze odtwarzanie zdalnego strumienia (iOS, Android).
    audioRef.current?.play().catch(noop);
    void enableMicrophone();
  }

  function unblockAudio() {
    audioRef.current?.play().then(reportAudioUnblocked, reportAudioBlocked);
  }

  const canEndSession = kind === "active" && session?.status === "active";
  const showHistoryCta = kind === "completed" || kind === "expired" || kind === "interrupted";
  const canSummarizeSession = showHistoryCta && persistedMessages.length > 0;
  // Panel podsumowania dopiero wtedy, gdy ma co pokazać (tekst albo błąd).
  const showsSummaryPanel = summaryState.kind !== "none" || summaryErrorCode !== null;
  const connected = isVoiceConnected(status);
  const showsTranscript = connected || status === "reconnecting";
  // Odmowa puli w trakcie rozmowy: komunikat mówi, że wszystko jest zapisane, więc zapis zostaje widoczny.
  const showsSavedTranscript = status === "refused" && persistedMessages.length > 0;
  const showsIntro = kind === "active" && session !== null && !showsTranscript;
  const canConnect = status === "idle" || status === "reconnecting";
  const avatar = initialState.avatar.selected;
  const avatarFirstName = avatar.avatarFirstName;
  const remainingSessionsCopy = formatRemainingFreeSessions(locale, initialState.sessionQuota);
  // Powiadomienia połączenia stoją przy pasku stanu, gdzie jest wzrok i kciuk;
  // zatrzymanie bezpieczeństwa i stany końcowe zostają u góry.
  const isBarNotice = notice !== null && notice.variant !== "hard_stop" && kind === "active" && showsTranscript;
  const isChatLayout = Boolean(session);
  const statusLabel = getStatusLabel(state, avatarFirstName, copy.status);
  const isListening = connected && status === "live" && !isMuted && !state.isAvatarSpeaking;

  function handleGenerateSummary() {
    if (session) {
      void generateSummary(session.id);
    }
  }

  function handleApproveSummary() {
    if (session) {
      void approveSummary(session.id);
    }
  }

  return (
    <div className={cn("flex h-full w-full flex-col", !isChatLayout && "overflow-y-auto")}>
      {/* Zdalny strumień WebRTC nie ma ścieżki napisów, a jego odpowiednikiem
          tekstowym jest zapis rozmowy na ekranie: wypowiedzi na żywo i zapisane
          wiersze z heartbeatu. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- live WebRTC audio; the on-screen transcript is its text equivalent */}
      <audio ref={audioRef} autoPlay className="hidden" />

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
        timerWaitingLabel={awaitingFirstConnection ? copy.timerWaiting : null}
      />

      <div
        className={cn(
          "flex flex-col",
          isChatLayout ? "min-h-0 flex-1" : "flex-1",
          isChatLayout && (showHistoryCta || showsIntro) && "overflow-y-auto overscroll-contain",
        )}
      >
        {!session ? (
          <div className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6">
            <p className="text-ink-muted text-sm leading-6">{stateCopy[kind].body}</p>
            <p className="text-ink-muted mt-4 text-xs leading-5">
              <span className="text-ink-soft font-medium">{chromeCopy.boundariesLabel}</span> {boundaries}
            </p>
            <a href="/dashboard" className={cn(PILL_BRAND, "mt-5")}>
              {chromeCopy.backToDashboard}
            </a>
          </div>
        ) : null}

        {notice && !isBarNotice ? (
          <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-5 sm:px-6">
            <SessionSafetyNotice variant={notice.variant} copy={notice.copy} crisisResources={notice.crisisResources} />
          </div>
        ) : null}

        {showsIntro ? (
          <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-5 sm:px-6" data-voice-intro>
            <div className="border-line-strong bg-surface shadow-card rounded-[20px] border p-5 sm:p-7">
              <div className="flex items-start gap-4">
                <img
                  src={avatar.assetPath}
                  alt=""
                  width="96"
                  height="96"
                  className="h-14 w-14 shrink-0 rounded-full object-cover"
                  loading="lazy"
                />
                <div className="min-w-0">
                  <h2 className="text-ink font-serif text-2xl leading-tight font-medium sm:text-[28px]">
                    {copy.introTitle(avatarFirstName)}
                  </h2>
                  <p className="text-ink-soft mt-2 text-base leading-7">{copy.introBody}</p>
                </div>
              </div>

              {status === "refused" && state.refusal ? (
                // Pula nie pozwala połączyć: zamiast przycisku, który nic nie zmieni, mówimy co dalej.
                <div className="mt-5" data-voice-refused={state.refusal}>
                  <SessionSafetyNotice
                    variant="info"
                    copy={{
                      title: copy.refusedTitle,
                      body:
                        state.refusal === "voice_trial_used" ? planCopy.voiceTrialUsed : planCopy.voiceMinutesExhausted,
                      nextSteps: [copy.refusedNextStep],
                    }}
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    {state.refusal === "voice_trial_used" ? (
                      <a href="/account/security" className={PILL_CLASS}>
                        {copy.refusedPlanLink}
                      </a>
                    ) : null}
                    <a href="/dashboard" className={PILL_CLASS}>
                      {chromeCopy.backToDashboard}
                    </a>
                  </div>
                </div>
              ) : status === "unsupported" || status === "unavailable" ? (
                <div className="mt-5">
                  <SessionSafetyNotice
                    variant="info"
                    copy={{
                      title: status === "unsupported" ? copy.unsupportedTitle : copy.unavailableTitle,
                      body: status === "unsupported" ? copy.unsupportedBody : copy.unavailableBody,
                      nextSteps: [],
                    }}
                  />
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleEnableMicrophone}
                    disabled={!isHydrated || !canConnect}
                    className={cn(PRIMARY_BUTTON, "mt-5")}
                    data-voice-connect
                  >
                    {status === "requesting_mic" || status === "connecting" ? (
                      <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <Mic aria-hidden="true" className="h-4 w-4 shrink-0" />
                    )}
                    {status === "requesting_mic"
                      ? copy.requestingMicrophone
                      : status === "connecting"
                        ? copy.connecting
                        : awaitingFirstConnection
                          ? copy.startMicrophone
                          : copy.enableMicrophone}
                  </button>
                  {/* Przed pierwszym połączeniem: czas i próba czekają na mikrofon. */}
                  <p className="text-ink-muted mt-3 text-sm leading-6" data-voice-intro-note>
                    {awaitingFirstConnection ? copy.introNoteFirst : copy.introNoteResumed}
                  </p>
                </>
              )}
            </div>
          </div>
        ) : null}

        {showHistoryCta ? (
          <div className="mx-auto w-full max-w-3xl shrink-0 space-y-4 px-4 pt-5 sm:px-6">
            <SessionClosingCard
              title={stateCopy[kind].title}
              body={stateCopy[kind].body}
              remainingSessionsCopy={remainingSessionsCopy}
              takesFocus={shouldClosingCardTakeFocus(initialState.kind, notice?.variant)}
              actions={
                <>
                  {canSummarizeSession && !showsSummaryPanel ? (
                    <SessionSummaryButton summaryStatus={summaryStatus} onGenerate={handleGenerateSummary} />
                  ) : null}
                  <a
                    href="/dashboard/avatar"
                    className="text-brand hover:text-brand-deep focus-visible:ring-brand-ring inline-flex min-h-11 items-center rounded text-sm font-medium underline underline-offset-4 transition-colors focus:outline-none focus-visible:ring-2"
                  >
                    {chromeCopy.changePerspective}
                  </a>
                </>
              }
            />

            {showsSummaryPanel ? (
              <SessionSummaryPanel
                summaryState={summaryState}
                summaryStatus={summaryStatus}
                summaryErrorCode={summaryErrorCode}
                canSummarize={canSummarizeSession}
                onGenerate={handleGenerateSummary}
                onApprove={handleApproveSummary}
              />
            ) : null}

            {/* Jedno zastrzeżenie na ekran, pod kartą, a nie w niej. */}
            <p className="text-ink-muted text-xs leading-5">
              <span className="text-ink-soft font-medium">{chromeCopy.boundariesLabel}</span> {boundaries}
            </p>
          </div>
        ) : null}

        {/* Zakończona rozmowa bez jednej wypowiedzi nie ma czego pokazać: pusty zapis
            mówiłby „rozmowa zacznie się, gdy awatar się przywita” pod kartą końca. */}
        {session && (showsTranscript || ((showHistoryCta || showsSavedTranscript) && persistedMessages.length > 0)) ? (
          <SessionMessages
            variant={showHistoryCta || showsSavedTranscript ? "finished" : "live"}
            messages={persistedMessages}
            liveFragments={showHistoryCta || showsSavedTranscript ? [] : liveFragments}
            announcesMessages={false}
            assistantAvatar={avatar}
            emptyCopy={copy.transcriptEmpty}
          />
        ) : null}
      </div>

      {session && kind === "active" ? (
        <div className="border-line shrink-0 border-t px-4 pt-3 pb-4 sm:px-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            {notice && isBarNotice ? (
              <SessionSafetyNotice
                variant={notice.variant}
                copy={notice.copy}
                crisisResources={notice.crisisResources}
              />
            ) : null}

            {showsTranscript ? (
              <div className="flex flex-wrap items-center gap-2" data-voice-bar>
                <p
                  role="status"
                  aria-live="polite"
                  aria-label={copy.statusAria}
                  className="bg-surface-soft text-ink-soft inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      isListening ? "bg-brand animate-pulse motion-reduce:animate-none" : "bg-line-accent",
                    )}
                  />
                  {statusLabel}
                </p>

                {connected ? (
                  <button type="button" aria-pressed={isMuted} onClick={toggleMute} className={PILL_CLASS}>
                    {isMuted ? (
                      <MicOff aria-hidden="true" className="h-4 w-4" />
                    ) : (
                      <Mic aria-hidden="true" className="h-4 w-4" />
                    )}
                    {isMuted ? copy.unmute : copy.mute}
                  </button>
                ) : null}

                {status === "reconnecting" ? (
                  <button
                    type="button"
                    onClick={() => {
                      void reconnect();
                    }}
                    className={PILL_CLASS}
                  >
                    <RefreshCw aria-hidden="true" className="h-4 w-4" />
                    {copy.reconnect}
                  </button>
                ) : null}

                {status === "audio_blocked" ? (
                  <button type="button" onClick={unblockAudio} className={PILL_CLASS}>
                    <Volume2 aria-hidden="true" className="h-4 w-4" />
                    {copy.enableAudio}
                  </button>
                ) : null}
              </div>
            ) : null}

            <SessionBoundariesToggle />
          </div>
        </div>
      ) : null}
    </div>
  );
}
