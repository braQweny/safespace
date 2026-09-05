import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";

/**
 * Język islandu przychodzi propsem z Astro i jest wpuszczany do drzewa przez
 * `LocaleProvider`. Domyślna wartość kontekstu istnieje tylko dla testów
 * renderujących pojedynczy komponent; w aplikacji provider jest zawsze.
 */
export const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
