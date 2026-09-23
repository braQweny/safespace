import { takeLegacyStoredChoice, writePreferenceCookie } from "@/lib/preference-cookie";

export type StartMode = "text" | "voice";

/** Ciasteczko z ostatnim wyborem; serwer czyta je i podaje karcie jako `initialMode`. */
export const START_MODE_COOKIE = "safespace-start-mode";

const LEGACY_STORAGE_KEY = "safespace:start-mode";

// Wybór z tej strony: wygrywa z ciasteczkiem odczytanym przy renderze i działa
// także wtedy, gdy przeglądarka blokuje ciasteczka.
let chosenMode: StartMode | null = null;
const listeners = new Set<() => void>();

/** Walidacja przy każdym odczycie: cokolwiek innego niż znany tryb to „brak wyboru”. */
export function parseStartMode(value: unknown): StartMode | null {
  return value === "text" || value === "voice" ? value : null;
}

export function subscribeStartMode(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Tryb rozmowy, który osoba wybrała ostatnio: kto rozmawia głosem, za drugim
 * razem klika raz. Serwer renderuje wybór z ciasteczka (`initialMode`), więc
 * hydratacja nie przeskakuje z pisanej na głosową; domyślnie „pisana”.
 */
export function readStartMode(initialMode: StartMode | null): StartMode {
  return chosenMode ?? initialMode ?? "text";
}

export function setStartMode(mode: StartMode) {
  chosenMode = mode;
  writePreferenceCookie(START_MODE_COOKIE, mode);
  for (const listener of listeners) listener();
}

/**
 * Wybór sprzed ciasteczka (`localStorage`) przechodzi do ciasteczka raz, gdy
 * serwer nie miał jeszcze czego odczytać; klucz znika w każdym przypadku.
 */
export function migrateLegacyStartMode(hasCookieChoice: boolean) {
  const legacy = parseStartMode(takeLegacyStoredChoice(LEGACY_STORAGE_KEY));

  if (legacy && !hasCookieChoice) {
    setStartMode(legacy);
  }
}

/** Tylko do testów: zapomina wybór z tej strony. */
export function resetStartModeForTests() {
  chosenMode = null;
}
