/**
 * Budżet czasu jednej rozmowy. Wydzielony z `session-state.ts`, żeby wyspy
 * React (karta startu, strona konta) mogły pokazać „do 15 minut” bez
 * wciągania do bundla klienta repozytorium danych. 15 minut to obecny budżet
 * każdej sesji (próbnej i kolejnej); dłuższe sesje płatne będą skalować ten
 * parametr, nie mnożyć stałych w copy.
 */
export const FREE_TRIAL_DURATION_SECONDS = 900;

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
