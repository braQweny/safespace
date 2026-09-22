import { createContext, useContext } from "react";
import { DEFAULT_TIME_ZONE } from "@/lib/i18n/time-zone";

/**
 * Strefa islandu przychodzi propsem z Astro (`Astro.locals.timeZone`) i jest
 * wpuszczana do drzewa przez `LocaleProvider`, obok języka. Nigdy nie czytamy
 * jej z przeglądarki w czasie renderu — serwer i hydratacja muszą formatować
 * daty identycznie. Wartość domyślna istnieje dla testów i wysp bez dat.
 */
export const TimeZoneContext = createContext<string>(DEFAULT_TIME_ZONE);

export function useTimeZone(): string {
  return useContext(TimeZoneContext);
}
