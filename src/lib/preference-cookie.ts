/**
 * Drobne wybory interfejsu (tryb startu „Pisana | Głosowa”, widok „Mapa |
 * Lista”) trzymane w ciasteczku pierwszej strony zamiast w `localStorage`:
 * serwer czyta je przy renderze, więc strona od razu pokazuje zapamiętany
 * wybór, zamiast przeskakiwać na niego po hydratacji.
 *
 * Nie `httpOnly`, bo zapisuje je klient w chwili wyboru; wartości to jedno z
 * kilku znanych słów, walidowane przy każdym odczycie. Nie trafiają do logów.
 */
export const PREFERENCE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function buildPreferenceCookie(name: string, value: string, secure: boolean) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${String(PREFERENCE_COOKIE_MAX_AGE_SECONDS)}`,
    "SameSite=Lax",
    // Jak cookies serwera: tylko HTTPS na produkcji, zwykłe http w `astro dev`.
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/** Zapis z przeglądarki; zablokowane ciasteczka zostawiają wybór na czas tej strony. */
export function writePreferenceCookie(name: string, value: string) {
  try {
    document.cookie = buildPreferenceCookie(name, value, window.location.protocol === "https:");
  } catch {
    // Brak `document` albo zablokowane ciasteczka: wybór zostaje w pamięci strony.
  }
}

/**
 * Jednorazowa migracja wyboru zapisanego wcześniej w `localStorage`: odczyt i
 * usunięcie klucza. Czy wartość przejdzie do ciasteczka, decyduje wołający.
 * Po pierwszej wizycie klucza już nie ma, więc to tylko ścieżka przejścia.
 */
export function takeLegacyStoredChoice(storageKey: string): string | null {
  try {
    const stored = window.localStorage.getItem(storageKey);

    if (stored !== null) {
      window.localStorage.removeItem(storageKey);
    }

    return stored;
  } catch {
    return null;
  }
}
