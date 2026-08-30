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

export function formatSessionBudgetMinutes(durationSeconds: number = FREE_TRIAL_DURATION_SECONDS) {
  const minutes = Math.max(1, Math.round(durationSeconds / 60));

  return `${minutes} min`;
}

/** „Każda rozmowa trwa do 15 minut.” — zdanie pokazywane przed startem. */
export function formatSessionBudgetCopy(durationSeconds: number = FREE_TRIAL_DURATION_SECONDS) {
  const minutes = Math.max(1, Math.round(durationSeconds / 60));
  const unit = minutes === 1 ? "minuty" : "minut";

  return `Każda rozmowa trwa do ${minutes} ${unit} — czas widzisz przez cały czas na ekranie.`;
}
