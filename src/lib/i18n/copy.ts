import type { Locale } from "./locale";

export type CopyTable<T extends object> = Readonly<Record<Locale, T>>;

/**
 * Para tekstów w obu językach. Typ jest wnioskowany wyłącznie z `en`
 * (`NoInfer` na `pl`), więc brakujący albo nadmiarowy klucz po polsku to błąd
 * kompilacji, a formattery muszą zachować tę samą sygnaturę. Długości tablic
 * pilnuje test parytetu, nie typ.
 */
export function defineCopy<T extends object>(en: T, pl: NoInfer<T>): CopyTable<T> {
  return Object.freeze({ en, pl });
}
