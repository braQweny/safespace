import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

/**
 * Teksty wyspy rozmowy głosowej. Stany rozmowy (trwa, zakończona, wygasła,
 * przerwana), przycisk zakończenia i granice biorą się z `timed-session-copy`,
 * bo są wspólne dla obu trybów; tu jest tylko to, co dotyczy mikrofonu,
 * połączenia i dźwięku.
 */
const VOICE_SESSION_COPY = defineCopy(
  {
    introTitle: (name: string) => `${name} is listening once the microphone is on`,
    introBody:
      "This is a live conversation: the avatar listens and speaks at the same time, and you can interrupt at any moment. The audio goes straight to the model provider; SafeSpace keeps only the transcript, like a written conversation.",
    introHint:
      "The conversation clock has been running since the start. It's best to talk somewhere private: the microphone picks up everything around you.",
    enableMicrophone: "Turn on the microphone",
    requestingMicrophone: "Waiting for microphone permission…",
    connecting: "Connecting…",
    unsupportedTitle: "This browser can't run a voice conversation",
    unsupportedBody:
      "It needs microphone access and WebRTC. Try a current Chrome, Safari or Firefox, or end the conversation and go back to the dashboard.",
    unavailableTitle: "Voice conversations are unavailable right now",
    unavailableBody:
      "This conversation was started, but the voice feature is switched off. End it and go back to the dashboard.",
    transcriptEmpty: "The conversation starts once the avatar says hello.",
    statusAria: "Voice conversation status",
    status: {
      listening: "Listening",
      speaking: (name: string) => `${name} is speaking`,
      muted: "Microphone muted",
      connecting: "Connecting…",
      reconnecting: "Reconnecting…",
      paused: "A short pause",
      audioBlocked: "Sound is waiting",
    },
    mute: "Mute",
    unmute: "Unmute",
    reconnect: "Reconnect",
    enableAudio: "Turn on the sound",
    notices: {
      micFailedTitle: "The microphone couldn't be turned on",
      connectFailedTitle: "The connection couldn't be made",
      connectFailedBody: "Try again in a moment. The conversation clock keeps running.",
      connectRateLimitedBody: "Too many attempts in a short time. Wait a moment and try again.",
      connectionLostTitle: "The connection was interrupted",
      connectionLostBody: "We're reconnecting. If that doesn't help, use the Reconnect button.",
      supersededTitle: "The conversation continues in another tab",
      supersededBody: "This connection was replaced by a newer one. Close this tab or go back to the dashboard.",
      disabledTitle: "Voice conversations have been switched off",
      disabledBody: "The conversation has ended and its transcript has been kept. You can go back to the dashboard.",
      heartbeatFailedTitle: "No connection to the server",
      heartbeatFailedBody: "The conversation may continue, but the transcript will arrive with a delay.",
      audioBlockedTitle: "The sound is waiting for your tap",
      audioBlockedBody: "The browser paused playback. Tap “Turn on the sound” to hear the avatar.",
    },
  },
  {
    introTitle: (name) => `${name} słucha, gdy włączysz mikrofon`,
    introBody:
      "To rozmowa na żywo: awatar słucha i mówi jednocześnie, a Ty możesz mu przerwać w każdej chwili. Dźwięk płynie bezpośrednio do dostawcy modelu; SafeSpace zachowuje tylko zapis, jak w rozmowie pisanej.",
    introHint:
      "Czas rozmowy biegnie od jej rozpoczęcia. Najlepiej rozmawiać w ustronnym miejscu: mikrofon zbiera wszystko dookoła.",
    enableMicrophone: "Włącz mikrofon",
    requestingMicrophone: "Czekamy na zgodę na mikrofon…",
    connecting: "Łączenie…",
    unsupportedTitle: "Ta przeglądarka nie obsługuje rozmowy głosowej",
    unsupportedBody:
      "Potrzebny jest dostęp do mikrofonu i WebRTC. Spróbuj w aktualnym Chrome, Safari albo Firefoksie, albo zakończ rozmowę i wróć do panelu.",
    unavailableTitle: "Rozmowa głosowa jest teraz niedostępna",
    unavailableBody: "Ta rozmowa została rozpoczęta, ale funkcja jest wyłączona. Zakończ ją i wróć do panelu.",
    transcriptEmpty: "Rozmowa zacznie się, gdy awatar się przywita.",
    statusAria: "Stan rozmowy głosowej",
    status: {
      listening: "Słucham",
      speaking: (name) => `${name} mówi`,
      muted: "Mikrofon wyciszony",
      connecting: "Łączenie…",
      reconnecting: "Łączę ponownie…",
      paused: "Chwila przerwy",
      audioBlocked: "Dźwięk czeka",
    },
    mute: "Wycisz",
    unmute: "Włącz mikrofon",
    reconnect: "Połącz ponownie",
    enableAudio: "Włącz dźwięk",
    notices: {
      micFailedTitle: "Nie udało się włączyć mikrofonu",
      connectFailedTitle: "Nie udało się połączyć",
      connectFailedBody: "Spróbuj ponownie za chwilę. Czas rozmowy biegnie dalej.",
      connectRateLimitedBody: "Za dużo prób w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.",
      connectionLostTitle: "Połączenie zostało przerwane",
      connectionLostBody: "Łączymy ponownie. Jeśli to nie pomoże, użyj przycisku „Połącz ponownie”.",
      supersededTitle: "Rozmowa trwa w innej karcie",
      supersededBody: "To połączenie zostało zastąpione nowszym. Zamknij tę kartę albo wróć do panelu.",
      disabledTitle: "Rozmowa głosowa została wyłączona",
      disabledBody: "Rozmowa została zakończona, a jej zapis zachowany. Możesz wrócić do panelu.",
      heartbeatFailedTitle: "Brak łączności z serwerem",
      heartbeatFailedBody: "Rozmowa może trwać dalej, ale zapis dotrze z opóźnieniem.",
      audioBlockedTitle: "Dźwięk czeka na Twoje dotknięcie",
      audioBlockedBody: "Przeglądarka wstrzymała odtwarzanie. Dotknij „Włącz dźwięk”, żeby usłyszeć awatara.",
    },
  },
);

export function getVoiceSessionCopy(locale: Locale) {
  return VOICE_SESSION_COPY[locale];
}
