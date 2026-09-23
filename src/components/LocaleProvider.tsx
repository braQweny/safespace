import type { ReactNode } from "react";
import { LocaleContext } from "@/components/hooks/useLocale";
import { TimeZoneContext } from "@/components/hooks/useTimeZone";
import type { Locale } from "@/lib/i18n/locale";
import { DEFAULT_TIME_ZONE } from "@/lib/i18n/time-zone";

interface LocaleProviderProps {
  locale: Locale;
  /** Strefa z `Astro.locals.timeZone`; potrzebna tylko wyspom, które pokazują daty. */
  timeZone?: string;
  children: ReactNode;
}

/**
 * Korzeń islandu owija tym swoje drzewo. Komponent renderujący provider
 * nie może sam wołać `useLocale()` ani `useTimeZone()` — dostałby wartość
 * domyślną; on używa propsów.
 */
export function LocaleProvider({ locale, timeZone = DEFAULT_TIME_ZONE, children }: LocaleProviderProps) {
  return (
    <LocaleContext value={locale}>
      <TimeZoneContext value={timeZone}>{children}</TimeZoneContext>
    </LocaleContext>
  );
}
