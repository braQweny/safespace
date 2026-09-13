export type StartMode = "text" | "voice";

const STORAGE_KEY = "safespace:start-mode";

// Wybór trzymany w pamięci strony na wypadek, gdy przeglądarka blokuje
// `localStorage` (okno prywatne, ustawienia): przełącznik działa i wtedy.
let chosenMode: StartMode | null = null;
const listeners = new Set<() => void>();

function isStartMode(value: unknown): value is StartMode {
  return value === "text" || value === "voice";
}

export function subscribeStartMode(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Tryb rozmowy, który osoba wybrała ostatnio: kto rozmawia głosem, za drugim
 * razem klika raz. Domyślnie „pisana”; czysto po stronie klienta, jak
 * „Mapa / Lista” w widoku pamięci.
 */
export function readStartMode(): StartMode {
  if (chosenMode) return chosenMode;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isStartMode(stored)) return stored;
  } catch {
    // Brak dostępu do pamięci przeglądarki: zostaje tryb pisany.
  }
  return "text";
}

/** Serwer i pierwszy render po hydratacji pokazują tryb pisany: działa bez JS. */
export function getServerStartMode(): StartMode {
  return "text";
}

export function setStartMode(mode: StartMode) {
  chosenMode = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Wybór zostaje na czas tej strony.
  }
  for (const listener of listeners) listener();
}

/** Tylko do testów: zapomina wybór z tej strony (pamięć przeglądarki zostaje). */
export function resetStartModeForTests() {
  chosenMode = null;
}
