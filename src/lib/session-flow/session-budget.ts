import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";
import { plural } from "@/lib/i18n/plural";
import type { AccountPlan, SessionDurationBucketSeconds } from "@/lib/session-data/types";

/**
 * Budżet czasu jednej rozmowy. Wydzielony z `session-state.ts`, żeby wyspy
 * React (karta startu, strona konta) mogły pokazać „do 15 minut” bez
 * wciągania do bundla klienta repozytorium danych — import typu planu jest
 * kasowany przy kompilacji, więc ta granica dalej się trzyma.
 *
 * Długość rozmowy zależy od planu konta i jest ustalana w chwili startu:
 * zapisujemy ją w `duration_bucket_seconds`, a cała reszta (licznik, fazy
 * rozmowy, wygaśnięcie) liczy się już z `expires_at` konkretnej sesji. Zmiana
 * planu w trakcie trwającej rozmowy nie przedłuża jej ani nie skraca.
 */

/** Plan bezpłatny: 15 minut na rozmowę. */
export const FREE_TRIAL_DURATION_SECONDS = 900;

/** Plan premium: 60 minut na rozmowę. */
export const PREMIUM_SESSION_DURATION_SECONDS = 3600;

/** Jednorazowa próba głosowa konta free: 10 minut (bucket 600 w bazie). */
export const VOICE_TRIAL_DURATION_SECONDS = 600;

/**
 * Budżet rozmowy dla danego planu. Nieznany plan (np. odczyt planu padł)
 * dostaje wariant bezpłatny — krótsza rozmowa jest bezpiecznym domyślnym
 * wyborem, bo nie obiecuje czasu, do którego konto nie ma prawa.
 */
export function resolveSessionDurationSeconds(
  plan: AccountPlan | null | undefined,
): Extract<SessionDurationBucketSeconds, 900 | 3600> {
  return plan === "premium" ? PREMIUM_SESSION_DURATION_SECONDS : FREE_TRIAL_DURATION_SECONDS;
}

/**
 * Budżet (bucket) rozmowy głosowej. Premium dostaje pełne 3600 s, ale
 * `expires_at` może być krótsze, gdy w miesięcznej puli zostało mniej minut;
 * konto free ma jedną próbę 600 s.
 */
export function resolveVoiceSessionDurationSeconds(
  plan: AccountPlan | null | undefined,
): Extract<SessionDurationBucketSeconds, 600 | 3600> {
  return plan === "premium" ? PREMIUM_SESSION_DURATION_SECONDS : VOICE_TRIAL_DURATION_SECONDS;
}

const SESSION_BUDGET_COPY = defineCopy(
  {
    minutesUnit: { one: "minute", many: "minutes" },
    preStart: (minutes: number, unit: string) =>
      `Each conversation lasts up to ${minutes} ${unit} — the time stays visible on screen throughout.`,
  },
  {
    // Dopełniacz po „do”: „do 1 minuty”, „do 15 minut”, „do 60 minut”.
    minutesUnit: { one: "minuty", many: "minut" },
    preStart: (minutes, unit) => `Każda rozmowa trwa do ${minutes} ${unit} — czas widzisz przez cały czas na ekranie.`,
  },
);

function toBudgetMinutes(durationSeconds: number) {
  return Math.max(1, Math.round(durationSeconds / 60));
}

/** „15 min” — skrót jest ten sam w obu językach; `locale` zostaje dla spójnej sygnatury. */
export function formatSessionBudgetMinutes(_locale: Locale, durationSeconds: number = FREE_TRIAL_DURATION_SECONDS) {
  return `${toBudgetMinutes(durationSeconds)} min`;
}

/** „Każda rozmowa trwa do 15 minut.” — zdanie pokazywane przed startem. */
export function formatSessionBudgetCopy(locale: Locale, durationSeconds: number = FREE_TRIAL_DURATION_SECONDS) {
  const copy = SESSION_BUDGET_COPY[locale];
  const minutes = toBudgetMinutes(durationSeconds);

  return copy.preStart(minutes, plural(locale, minutes, copy.minutesUnit));
}
