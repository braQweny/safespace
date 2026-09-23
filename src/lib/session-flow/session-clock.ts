/**
 * Jeden zegar rozmowy: parsowanie znacznika czasu i arytmetyka „ile zostało /
 * czy termin minął”. Moduł-liść bez importów — czyta go serwer (trasy, stan
 * startu, historia, podsumowania, uzgadnianie głosu) i klient (timer), więc nie
 * może wciągać niczego do paczki ani tworzyć pętli modułów (`voice-reconcile`
 * trzymał wcześniej lokalną kopię, bo `time-limit` importuje `session-state`).
 *
 * Tu jest wyłącznie czas: status sesji („tylko aktywna wygasa”) sprawdza
 * wołający, a zaokrąglenie jest jawne w nazwie funkcji.
 */

/** `null` dla braku, pustego napisu i znacznika, którego `Date.parse` nie rozumie. */
export function parseTimestampMs(timestamp: string | null | undefined): number | null {
  if (!timestamp) {
    return null;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Dokładne milisekundy do terminu, nigdy poniżej zera; `null` bez czytelnego terminu. */
export function remainingMs(expiresAt: string | null | undefined, nowMs: number): number | null {
  const expiresAtMs = parseTimestampMs(expiresAt);

  if (expiresAtMs === null) {
    return null;
  }

  return Math.max(0, expiresAtMs - nowMs);
}

/**
 * Sekundy do terminu zaokrąglone w górę (ostatnia częściowa sekunda liczy się
 * jako cała), nigdy poniżej zera; `null` bez czytelnego terminu.
 */
export function remainingSeconds(expiresAt: string | null | undefined, nowMs: number): number | null {
  const expiresAtMs = parseTimestampMs(expiresAt);

  if (expiresAtMs === null) {
    return null;
  }

  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
}

/**
 * Termin minął, gdy `expiresAt <= now` (sama chwila terminu już się liczy).
 * Brak albo nieczytelny termin nigdy nie jest „po terminie”.
 */
export function isPastDeadline(expiresAt: string | null | undefined, nowMs: number): boolean {
  const expiresAtMs = parseTimestampMs(expiresAt);
  return expiresAtMs !== null && expiresAtMs <= nowMs;
}
