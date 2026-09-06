import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { ArrowUp, Loader2, Mic, Square } from "lucide-react";
import { useLocale } from "@/components/hooks/useLocale";
import { requestApiJson } from "@/lib/api-client";
import type { Locale } from "@/lib/i18n/locale";
import { getSessionCopy } from "@/lib/session-copy";
import { SESSION_MESSAGE_MAX_CHARS } from "@/lib/session-flow/message-contract";
import {
  isSessionTranscriptionFailure,
  isSessionTranscriptionSuccess,
  SESSION_TRANSCRIPTION_MAX_AUDIO_BYTES,
  SESSION_TRANSCRIPTION_MAX_RECORDING_MS,
} from "@/lib/session-flow/session-transcription-contract";
import { isRecord } from "@/lib/type-guards";
import { cn } from "@/lib/utils";
import { getSessionComposerCopy } from "./session-composer-copy";

interface SessionComposerProps {
  sessionId: string;
  value: string;
  /** Pole jest zamknięte: koniec sesji, zatrzymanie, kończenie. */
  isDisabled: boolean;
  /**
   * Tura w locie. Pole zostaje otwarte, ale tylko do odczytu — wyłączony
   * `textarea` gubił fokus po każdej wiadomości, więc rozmowa na klawiaturze
   * zaczynała się od nowa od szukania pola.
   */
  isPending: boolean;
  /** Pole z prefillem z karty osoby dostaje fokus z kursorem na końcu zdania. */
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

type SessionComposerKeyboardEvent = Pick<
  KeyboardEvent<HTMLTextAreaElement>,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

type DictationStatus = "idle" | "recording" | "transcribing";

const COARSE_POINTER_QUERY = "(pointer: coarse)";
const RECORDING_TICK_MS = 1_000;

export function shouldSubmitSessionComposerFromKeyboard(
  event: SessionComposerKeyboardEvent,
  platform = getClientPlatform(),
) {
  if (event.key !== "Enter" || event.altKey || event.shiftKey) {
    return false;
  }

  if (isMacPlatform(platform)) {
    return event.metaKey || event.ctrlKey;
  }

  return event.ctrlKey && !event.metaKey;
}

/**
 * Czy to jest ten moment, w którym ktoś szuka sposobu wysłania: sam Enter, bez
 * modyfikatorów, w polu, w którym coś już stoi. Shift + Enter to świadoma nowa
 * linia, a puste pole nie ma czego wysyłać — w obu przypadkach podpowiedź
 * byłaby zaczepianiem.
 */
export function shouldHintSubmitShortcut(event: SessionComposerKeyboardEvent, hasText: boolean) {
  return hasText && event.key === "Enter" && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey;
}

export function appendTranscriptionToDraft(draft: string, transcription: string, maxChars = SESSION_MESSAGE_MAX_CHARS) {
  const text = transcription.trim();

  if (!text) {
    return {
      value: draft,
      didAppend: false,
      wasTruncated: false,
    };
  }

  const separator = draft.length > 0 && !/\s$/.test(draft) ? " " : "";
  const combinedValue = `${draft}${separator}${text}`;
  const value = combinedValue.slice(0, maxChars);

  return {
    value,
    didAppend: value.length > draft.length,
    wasTruncated: combinedValue.length > maxChars,
  };
}

export function getSupportedWebmMimeType(mediaRecorder: Pick<typeof MediaRecorder, "isTypeSupported"> | undefined) {
  if (typeof mediaRecorder?.isTypeSupported !== "function") {
    return null;
  }

  return ["audio/webm;codecs=opus", "audio/webm"].find((mimeType) => mediaRecorder.isTypeSupported(mimeType)) ?? null;
}

/**
 * Dyktowanie wymaga i nagrywarki, i mikrofonu, i formatu, który serwer
 * przyjmuje. Safari na iOS ma nagrywarkę, ale nie WebM — tam przycisk po
 * prostu nie istnieje, zamiast obiecywać i kończyć ogólnym błędem.
 */
export function getDictationSupport(input: {
  mediaRecorder: Pick<typeof MediaRecorder, "isTypeSupported"> | undefined;
  mediaDevices: Pick<MediaDevices, "getUserMedia"> | undefined;
}) {
  return (
    typeof input.mediaDevices?.getUserMedia === "function" && getSupportedWebmMimeType(input.mediaRecorder) !== null
  );
}

/**
 * Nazwa wyjątku z `getUserMedia` mówi, co poszło nie tak; ogólne „nie udało
 * się przepisać” było fałszywe, bo nic jeszcze nie zostało nagrane.
 */
export function getDictationErrorCopy(locale: Locale, error: unknown) {
  const name = getErrorName(error);
  const { dictation } = getSessionCopy(locale);

  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return dictation.microphoneDenied;
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return dictation.microphoneMissing;
  }

  return dictation.microphoneUnavailable;
}

export function formatRecordingProgress(
  locale: Locale,
  elapsedSeconds: number,
  maxRecordingMs = SESSION_TRANSCRIPTION_MAX_RECORDING_MS,
) {
  const maxSeconds = Math.round(maxRecordingMs / 1000);
  const shownSeconds = Math.min(maxSeconds, Math.max(0, Math.floor(elapsedSeconds)));

  return getSessionComposerCopy(locale).recordingProgress(shownSeconds, maxSeconds);
}

/**
 * „Cmd/Ctrl + Enter wysyła” nie ma sensu na ekranowej klawiaturze, a sam
 * rozmiar okna tego nie rozstrzyga: tablet w poziomie jest szeroki jak laptop.
 */
export function readCoarsePointerPreference(matchMedia: ((query: string) => { matches: boolean }) | undefined) {
  return typeof matchMedia === "function" && matchMedia(COARSE_POINTER_QUERY).matches;
}

const subscribeNever = () => () => {
  // Wsparcie dyktowania nie zmienia się po hydratacji.
};

function readClientDictationSupport() {
  return getDictationSupport({
    mediaRecorder: typeof MediaRecorder === "undefined" ? undefined : MediaRecorder,
    mediaDevices: getMediaDevices(),
  });
}

const readServerFalse = () => false;

/**
 * `false` w SSR i podczas hydratacji, prawdziwa odpowiedź od pierwszego
 * renderu klienta — bez rozjazdu znaczników i bez `setState` w efekcie.
 */
function useDictationSupport() {
  return useSyncExternalStore(subscribeNever, readClientDictationSupport, readServerFalse);
}

function subscribeToCoarsePointer(onChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const media = window.matchMedia(COARSE_POINTER_QUERY);
  media.addEventListener("change", onChange);

  return () => {
    media.removeEventListener("change", onChange);
  };
}

function readClientCoarsePointer() {
  return readCoarsePointerPreference(typeof window === "undefined" ? undefined : window.matchMedia.bind(window));
}

function useIsCoarsePointer() {
  return useSyncExternalStore(subscribeToCoarsePointer, readClientCoarsePointer, readServerFalse);
}

export default function SessionComposer({
  sessionId,
  value,
  isDisabled,
  isPending,
  autoFocus = false,
  onChange,
  onSubmit,
}: SessionComposerProps) {
  const locale = useLocale();
  const copy = getSessionComposerCopy(locale);
  const { dictation } = getSessionCopy(locale);
  const [dictationStatus, setDictationStatus] = useState<DictationStatus>("idle");
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isShortcutHintVisible, setIsShortcutHintVisible] = useState(false);
  const isDictationSupported = useDictationSupport();
  const isCoarsePointer = useIsCoarsePointer();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const latestValueRef = useRef(value);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const trimmedValue = value.trim();
  const isNearCharLimit = trimmedValue.length > SESSION_MESSAGE_MAX_CHARS * 0.8;
  const canSubmit = !isDisabled && !isPending && dictationStatus === "idle" && trimmedValue.length > 0;
  const canUseDictation = !isDisabled && !isPending && dictationStatus !== "transcribing";
  const showsShortcutHint = !isCoarsePointer;

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  // Prefill z karty osoby: kursor na końcu zdania, żeby dało się je od razu
  // dopisać albo skasować — bez przewijania strony do pola.
  useEffect(() => {
    if (!autoFocus) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [autoFocus]);

  // Podpowiedź gaśnie sama — ma pomóc raz, a nie zostać ostrzeżeniem nad polem.
  useEffect(() => {
    if (!isShortcutHintVisible) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setIsShortcutHintVisible(false);
    }, 4_000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isShortcutHintVisible]);

  const clearRecordingTimers = useCallback(() => {
    if (recordingTimeoutRef.current !== null) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    if (recordingTickRef.current !== null) {
      clearInterval(recordingTickRef.current);
      recordingTickRef.current = null;
    }
  }, []);

  const cleanupRecordingStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      return;
    }

    recorder.stop();
  }, []);

  const handleRecordingStop = useCallback(async () => {
    clearRecordingTimers();
    cleanupRecordingStream();

    const chunks = chunksRef.current;
    chunksRef.current = [];
    recorderRef.current = null;

    const audio = new Blob(chunks, { type: "audio/webm" });

    if (audio.size <= 0) {
      setDictationStatus("idle");
      setDictationError(dictation.transcriptionFailed);
      return;
    }

    if (audio.size > SESSION_TRANSCRIPTION_MAX_AUDIO_BYTES) {
      setDictationStatus("idle");
      setDictationError(dictation.recordingTooLarge);
      return;
    }

    setDictationStatus("transcribing");
    setDictationError(null);

    try {
      const audioBase64 = await blobToBase64(audio);
      const result = await requestApiJson("/api/session/transcribe", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          audioBase64,
          format: "webm",
        }),
      });

      if (result.kind === "json" && (result.status === 413 || isAudioTooLargeFailure(result.body))) {
        setDictationError(dictation.recordingTooLarge);
        return;
      }

      if (result.kind !== "json" || result.status !== 200 || !isSessionTranscriptionSuccess(result.body)) {
        setDictationError(dictation.transcriptionFailed);
        return;
      }

      const appendedDraft = appendTranscriptionToDraft(latestValueRef.current, result.body.text);

      if (!appendedDraft.didAppend) {
        setDictationError(dictation.transcriptionTooLong);
        return;
      }

      onChange(appendedDraft.value);
      setDictationError(appendedDraft.wasTruncated ? dictation.transcriptionTooLong : null);
    } catch {
      setDictationError(dictation.transcriptionFailed);
    } finally {
      setDictationStatus("idle");
    }
  }, [cleanupRecordingStream, clearRecordingTimers, dictation, onChange, sessionId]);

  const startRecording = useCallback(async () => {
    if (!canUseDictation) {
      return;
    }

    setDictationError(null);

    const mediaDevices = getMediaDevices();

    if (typeof MediaRecorder === "undefined" || typeof mediaDevices?.getUserMedia !== "function") {
      setDictationError(dictation.microphoneUnavailable);
      return;
    }

    const mimeType = getSupportedWebmMimeType(MediaRecorder);

    if (!mimeType) {
      setDictationError(dictation.microphoneUnavailable);
      return;
    }

    try {
      const stream = await mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        clearRecordingTimers();
        cleanupRecordingStream();
        chunksRef.current = [];
        recorderRef.current = null;
        setDictationStatus("idle");
        setDictationError(dictation.transcriptionFailed);
      };
      recorder.onstop = () => {
        void handleRecordingStop();
      };

      recorder.start();
      const startedAtMs = Date.now();
      setRecordingSeconds(0);
      setDictationStatus("recording");
      recordingTickRef.current = setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - startedAtMs) / 1000));
      }, RECORDING_TICK_MS);
      recordingTimeoutRef.current = setTimeout(() => {
        stopRecording();
      }, SESSION_TRANSCRIPTION_MAX_RECORDING_MS);
    } catch (error) {
      cleanupRecordingStream();
      chunksRef.current = [];
      recorderRef.current = null;
      setDictationStatus("idle");
      setDictationError(getDictationErrorCopy(locale, error));
    }
  }, [
    canUseDictation,
    cleanupRecordingStream,
    clearRecordingTimers,
    dictation,
    handleRecordingStop,
    locale,
    stopRecording,
  ]);

  useEffect(() => {
    return () => {
      clearRecordingTimers();

      const recorder = recorderRef.current;

      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }

      cleanupRecordingStream();
      chunksRef.current = [];
      recorderRef.current = null;
    };
  }, [cleanupRecordingStream, clearRecordingTimers]);

  function submitAndKeepFocus() {
    setIsShortcutHintVisible(false);
    onSubmit();
    // Kliknięcie „Wyślij” przenosi fokus na przycisk, który za chwilę będzie
    // wyłączony — wracamy do pola, żeby następne zdanie zaczynało się od pisania.
    textareaRef.current?.focus();
  }

  const dictationStatusCopy =
    dictationStatus === "recording"
      ? formatRecordingProgress(locale, recordingSeconds)
      : dictationStatus === "transcribing"
        ? copy.transcribing
        : null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();

        if (!canSubmit) {
          return;
        }

        submitAndKeepFocus();
      }}
      className="mx-auto w-full max-w-3xl"
    >
      <label htmlFor="session-message" className="sr-only">
        {copy.label}
      </label>
      {/* Pole i przyciski tworzą jedną kartę: tekst u góry, sterowanie w dolnym
          rzędzie — jak kartka, nie formularz. */}
      <div
        className={cn(
          "border-line-strong bg-surface shadow-card focus-within:border-brand-ring focus-within:ring-brand-ring/20 rounded-[18px] border transition-colors focus-within:ring-2",
          isDisabled && "bg-surface-soft",
        )}
      >
        <textarea
          ref={textareaRef}
          id="session-message"
          value={value}
          maxLength={SESSION_MESSAGE_MAX_CHARS}
          disabled={isDisabled}
          readOnly={isPending}
          aria-busy={isPending || undefined}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (!canSubmit || !shouldSubmitSessionComposerFromKeyboard(event)) {
              /*
               * Sam Enter zostaje nową linią: w rozmowie, do której wraca się
               * w połowie zdania, wysłanie w pół myśli jest gorsze niż jedno
               * nieudane naciśnięcie. Ale odruch z komunikatorów jest silny,
               * więc dokładnie w tym momencie podpowiedź o skrócie zapala się
               * zamiast siedzieć szarym drobnym drukiem.
               */
              if (showsShortcutHint && !isPending && shouldHintSubmitShortcut(event, trimmedValue.length > 0)) {
                setIsShortcutHintVisible(true);
              }

              return;
            }

            event.preventDefault();
            submitAndKeepFocus();
          }}
          placeholder={copy.placeholder}
          className="text-ink placeholder:text-ink-muted block max-h-60 min-h-14 w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-base leading-relaxed outline-none disabled:cursor-not-allowed sm:min-h-[4.5rem]"
        />
        <div className="flex items-center justify-between gap-3 px-2.5 pb-2.5 pl-4">
          {/* The hint used to be *replaced* by the counter, so it disappeared exactly
              when a long message made "how do I send this?" pressing. Show both —
              but not the keyboard shortcut on touch screens, where there is no Cmd key. */}
          <p
            className={cn(
              "text-xs transition-colors",
              isShortcutHintVisible ? "text-ink font-medium" : "text-ink-muted",
              !isNearCharLimit && !isShortcutHintVisible && "hidden sm:block",
            )}
          >
            {showsShortcutHint ? (
              <span className={cn("hidden sm:inline", isShortcutHintVisible && "inline")}>{copy.shortcutHint}</span>
            ) : null}
            {isNearCharLimit ? (
              <span className="text-ink-muted font-medium tabular-nums sm:ml-2">
                {trimmedValue.length}/{SESSION_MESSAGE_MAX_CHARS}
              </span>
            ) : null}
          </p>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {isDictationSupported ? (
              <button
                type="button"
                disabled={!canUseDictation}
                aria-pressed={dictationStatus === "recording"}
                onClick={() => {
                  if (dictationStatus === "recording") {
                    stopRecording();
                    return;
                  }

                  void startRecording();
                }}
                className="border-line-accent bg-surface text-ink-soft hover:bg-surface-soft hover:text-ink focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {dictationStatus === "recording" ? (
                  <Square aria-hidden="true" className="text-clay h-4 w-4 fill-current" />
                ) : dictationStatus === "transcribing" ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Mic aria-hidden="true" className="h-4 w-4" />
                )}
                {dictationStatus === "recording"
                  ? copy.stopRecording
                  : dictationStatus === "transcribing"
                    ? copy.transcribing
                    : copy.dictate}
              </button>
            ) : null}
            <button
              type="submit"
              disabled={!canSubmit}
              className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring disabled:border-brand-disabled disabled:bg-brand-soft disabled:text-brand-deep inline-flex h-11 items-center justify-center gap-2 rounded-full border border-transparent px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp aria-hidden="true" className="h-4 w-4" />
              )}
              {copy.send}
            </button>
          </div>
        </div>
      </div>
      {(dictationStatusCopy !== null || dictationError !== null) && (
        <p className="text-ink-muted mt-2 text-xs" role={dictationError ? "alert" : "status"}>
          {dictationError ?? dictationStatusCopy}
        </p>
      )}
    </form>
  );
}

function isAudioTooLargeFailure(body: unknown) {
  return isSessionTranscriptionFailure(body) && body.code === "audio_too_large";
}

function getErrorName(error: unknown) {
  if (error instanceof Error) {
    return error.name;
  }

  return isRecord(error) && typeof error.name === "string" ? error.name : "";
}

/**
 * `navigator.mediaDevices` nie istnieje w niezabezpieczonym kontekście ani w
 * starszych WebView, choć typy DOM deklarują je jako zawsze obecne.
 */
function getMediaDevices(): MediaDevices | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  const browserNavigator: Partial<Pick<Navigator, "mediaDevices">> = navigator;

  return browserNavigator.mediaDevices;
}

async function blobToBase64(blob: Blob) {
  if (typeof FileReader === "undefined") {
    throw new Error("file_reader_unavailable");
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error("file_reader_failed"));
    };
    reader.onloadend = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("file_reader_failed"));
        return;
      }

      const [, base64 = ""] = reader.result.split(",", 2);
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

function getClientPlatform() {
  if (typeof navigator === "undefined") {
    return "";
  }

  const browserNavigator = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
    };
  };
  const userAgentDataPlatform = browserNavigator.userAgentData?.platform;

  if (userAgentDataPlatform && userAgentDataPlatform.trim().length > 0) {
    return userAgentDataPlatform;
  }

  return browserNavigator.userAgent;
}

function isMacPlatform(platform: string) {
  return platform.toLowerCase().includes("mac");
}
