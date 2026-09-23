import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Loader2, Mic, Square } from "lucide-react";
import { useClientCapability } from "@/components/hooks/useClientCapability";
import { formatRecordingProgress, useDictation } from "@/components/hooks/useDictation";
import { useLocale } from "@/components/hooks/useLocale";
import { SESSION_MESSAGE_MAX_CHARS } from "@/lib/session-flow/message-contract";
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

const COARSE_POINTER_QUERY = "(pointer: coarse)";

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

/**
 * „Cmd/Ctrl + Enter wysyła” nie ma sensu na ekranowej klawiaturze, a sam
 * rozmiar okna tego nie rozstrzyga: tablet w poziomie jest szeroki jak laptop.
 */
export function readCoarsePointerPreference(matchMedia: ((query: string) => { matches: boolean }) | undefined) {
  return typeof matchMedia === "function" && matchMedia(COARSE_POINTER_QUERY).matches;
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
  return useClientCapability(readClientCoarsePointer, false, subscribeToCoarsePointer);
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
  const [isShortcutHintVisible, setIsShortcutHintVisible] = useState(false);
  const isCoarsePointer = useIsCoarsePointer();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Nagrywanie, przepisanie i komunikaty błędów żyją w `useDictation`; nazwy
  // zostają te same, więc znaczniki poniżej się nie zmieniają.
  const {
    isSupported: isDictationSupported,
    status: dictationStatus,
    error: dictationError,
    recordingSeconds,
    canUse: canUseDictation,
    start: startRecording,
    stop: stopRecording,
  } = useDictation({ sessionId, locale, value, isBlocked: isDisabled || isPending, onChange });
  const trimmedValue = value.trim();
  const isNearCharLimit = trimmedValue.length > SESSION_MESSAGE_MAX_CHARS * 0.8;
  const canSubmit = !isDisabled && !isPending && dictationStatus === "idle" && trimmedValue.length > 0;
  const showsShortcutHint = !isCoarsePointer;

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
          "border-line-control bg-surface shadow-card focus-within:border-brand-ring focus-within:ring-brand-ring/20 rounded-[18px] border transition-colors focus-within:ring-2",
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
