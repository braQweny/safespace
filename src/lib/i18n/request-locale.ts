import { DEFAULT_LOCALE, isLocale, type Locale } from "./locale";

/**
 * Trasy czytają język wyłącznie tędy. Middleware zawsze ustawia
 * `locals.locale`, ale testy tras budują `locals` ręcznie — brak pola ma
 * znaczyć „domyślny”, nie wyjątek.
 */
export function getRequestLocale(locals: { locale?: unknown } | null | undefined): Locale {
  return locals && isLocale(locals.locale) ? locals.locale : DEFAULT_LOCALE;
}
