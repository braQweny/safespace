/**
 * Fragmenty CSP, których nie da się zapisać jako stała lista dyrektyw w
 * `astro.config.mjs`: jedne zależą od środowiska (adres projektu Supabase),
 * inne od treści skryptu wstawionego wprost w HTML (hash).
 *
 * Plik jest `.mjs`, bo ładuje go zarówno konfiguracja Astro (zwykły ESM, przed
 * jakąkolwiek transpilacją), jak i test w Vitest.
 */
import { createHash } from "node:crypto";

/**
 * Ekran zgody Google — ostatni przystanek przekierowań, które zaczynają się od
 * wysłania formularza „Kontynuuj z Google”.
 */
export const GOOGLE_AUTH_ORIGIN = "https://accounts.google.com";

/**
 * @param {unknown} rawUrl
 * @returns {string | null} origin albo `null`, gdy adresu nie da się rozpoznać
 */
export function resolveOrigin(rawUrl) {
  if (typeof rawUrl !== "string") {
    return null;
  }

  const trimmedUrl = rawUrl.trim();
  if (trimmedUrl.length === 0) {
    return null;
  }

  try {
    return new URL(trimmedUrl).origin;
  } catch {
    return null;
  }
}

/**
 * Start logowania przez Google to nawigacja wywołana wysłaniem formularza:
 * POST `/api/auth/google` → 303 na Supabase → 302 na Google. Chrome sprawdza
 * `form-action` na KAŻDYM kroku takiego łańcucha, więc sama akcja formularza
 * na własnym originie nie wystarcza — przy `form-action 'self'` przeglądarka
 * cicho przerywa nawigację (`net::ERR_ABORTED`) i przycisk „nic nie robi”.
 * Dopuszczamy dokładnie dwa dodatkowe originy, oba należące do tego przepływu.
 *
 * @param {unknown} supabaseUrl wartość `SUPABASE_URL` z czasu budowania
 * @returns {`form-action ${string}`} gotowa dyrektywa `form-action`
 */
export function buildFormActionDirective(supabaseUrl) {
  const supabaseOrigin = resolveOrigin(supabaseUrl);
  const sources = ["'self'", supabaseOrigin, GOOGLE_AUTH_ORIGIN].filter((source) => source !== null);

  return `form-action ${[...new Set(sources)].join(" ")}`;
}

const INLINE_SCRIPT_PATTERN = /<script is:inline>([\s\S]*?)<\/script>/g;

/**
 * Astro hashuje na potrzeby CSP tylko skrypty, które sam pakuje — `is:inline`
 * trafia do HTML nietknięty i bez tego hasha zostaje zablokowany. Liczymy hash
 * z pliku źródłowego w czasie budowania, żeby edycja skryptu nie mogła
 * rozjechać się z polityką.
 *
 * @param {string} astroSource treść komponentu `.astro`
 * @returns {`sha256-${string}`[]} hashe w formacie oczekiwanym przez Astro
 */
export function collectInlineScriptHashes(astroSource) {
  return [...astroSource.matchAll(INLINE_SCRIPT_PATTERN)].map((match) => {
    /** @type {`sha256-${string}`} */
    const hash = `sha256-${createHash("sha256").update(match[1], "utf8").digest("base64")}`;

    return hash;
  });
}
