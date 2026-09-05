import type { ReactNode } from "react";
import { LocaleContext } from "@/components/hooks/useLocale";
import type { Locale } from "@/lib/i18n/locale";

interface LocaleProviderProps {
  locale: Locale;
  children: ReactNode;
}

/**
 * Korzeń islandu owija tym swoje drzewo. Komponent renderujący provider
 * nie może sam wołać `useLocale()` — dostałby wartość domyślną; on używa
 * propsa.
 */
export function LocaleProvider({ locale, children }: LocaleProviderProps) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}
