import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

const SESSION_COMPOSER_COPY = defineCopy(
  {
    label: "Message text",
    placeholder: "Write what you'd like to start with…",
    shortcutHint: "Enter adds a new line, Cmd/Ctrl + Enter sends.",
    send: "Send",
    dictate: "Dictate",
    stopRecording: "Stop",
    transcribing: "Transcribing…",
    recordingProgress: (shownSeconds: number, maxSeconds: number) => `Recording… ${shownSeconds} s / ${maxSeconds} s`,
  },
  {
    label: "Treść wiadomości",
    placeholder: "Napisz, od czego chcesz zacząć…",
    shortcutHint: "Enter dodaje nową linię, Cmd/Ctrl + Enter wysyła.",
    send: "Wyślij",
    dictate: "Dyktuj",
    stopRecording: "Zatrzymaj",
    transcribing: "Przepisywanie…",
    recordingProgress: (shownSeconds, maxSeconds) => `Nagrywanie… ${shownSeconds} s / ${maxSeconds} s`,
  },
);

export function getSessionComposerCopy(locale: Locale) {
  return SESSION_COMPOSER_COPY[locale];
}
