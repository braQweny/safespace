/**
 * Granice rozmowy powtarzają się teraz w panelu i w samej rozmowie. Trzymanie
 * ich w jednym miejscu jest ważniejsze niż wygoda lokalnej stałej: rozjazd
 * dwóch wersji tego zdania byłby rozjazdem obietnicy produktu.
 */
export const SESSION_BOUNDARIES_COPY =
  "SafeSpace jest symulacją rozmowy edukacyjnej. Nie diagnozuje i nie zastępuje specjalisty. W bezpośrednim zagrożeniu skorzystaj z realnej pomocy, np. lokalnego numeru alarmowego.";

export const SESSION_PERSPECTIVE_COPY =
  "Wybrana perspektywa obowiązuje przez całą sesję. Każda nowa rozmowa automatycznie korzysta z podsumowania wszystkich wcześniejszych rozmów z tym awatarem. Rozmowy z innymi awatarami mają osobną pamięć.";

/** Dawna etykieta zachowana dla zgodności tekstów starszego przepływu podsumowań. */
export const SUMMARY_APPROVE_LABEL = "Przepuść do następnej rozmowy";

/**
 * Kopie jednej tury rozmowy: to, co użytkownik czyta, gdy odpowiedź się
 * przeciąga, nie dociera albo gdy jego własne słowa nie zdążyły wyjść przed
 * końcem czasu. Trzymane razem, żeby test diakrytyków obejmował je jednym
 * importem i żeby brzmiały jak jeden głos.
 */
export const SESSION_TURN_COPY = {
  slowResponse: "Odpowiedź trwa dłużej niż zwykle…",
  timeoutTitle: "Odpowiedź nie dotarła na czas",
  timeoutBody: "Spróbuj wysłać ponownie. Treść wiadomości została zachowana.",
  unsentMessage: "Ta wiadomość nie zdążyła zostać wysłana:",
  copyUnsent: "Kopiuj",
  copiedUnsent: "Skopiowano",
  copyUnsentFailed: "Nie udało się skopiować. Zaznacz tekst i skopiuj go ręcznie.",
} as const;

/**
 * Dyktowanie ma mówić, co konkretnie nie zadziałało — brak zgody na mikrofon
 * to inna sytuacja niż brak mikrofonu albo za długie nagranie, a jeden ogólny
 * komunikat odsyłał wszystkich do „spróbuj ponownie”.
 */
export const DICTATION_COPY = {
  transcriptionFailed: "Nie udało się przepisać nagrania. Spróbuj ponownie albo wpisz tekst.",
  transcriptionTooLong: "Transkrypcja przekroczyła limit wiadomości. Skróć tekst albo nagraj krótszą wypowiedź.",
  microphoneDenied: "Brak zgody na użycie mikrofonu. Możesz pisać.",
  microphoneMissing: "Nie znaleziono mikrofonu.",
  microphoneUnavailable: "Nie udało się uruchomić mikrofonu. Możesz pisać.",
  recordingTooLarge: "Nagranie jest za długie lub za duże, żeby je przepisać. Nagraj krótszą wypowiedź.",
} as const;
