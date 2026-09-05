import type { AstroCookies } from "astro";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE_MAX_AGE_SECONDS, LOCALE_COOKIE_NAME, type Locale } from "./locale";

/**
 * Moduł serwerowy (czyta `import.meta.env.PROD`) — nie importować z islandów.
 * Cookie jest źródłem prawdy per żądanie; konto tylko je synchronizuje przy
 * logowaniu (`account-locale.ts`).
 */
export function readLocaleCookie(cookies: Pick<AstroCookies, "get">): Locale | null {
  const value = cookies.get(LOCALE_COOKIE_NAME)?.value;

  return isLocale(value) ? value : null;
}

export function resolveRequestLocale(cookies: Pick<AstroCookies, "get">): Locale {
  return readLocaleCookie(cookies) ?? DEFAULT_LOCALE;
}

export function writeLocaleCookie(cookies: Pick<AstroCookies, "set">, locale: Locale) {
  cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
    // Nic po stronie przeglądarki nie czyta tej wartości: `lang` i teksty
    // renderuje serwer, islandy dostają język propsem.
    httpOnly: true,
    // Jak cookies Supabase (`src/lib/supabase.ts`): tylko HTTPS na produkcji,
    // zwykłe http w `astro dev`.
    secure: import.meta.env.PROD,
  });
}
