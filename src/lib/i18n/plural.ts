import type { Locale } from "./locale";

export interface PluralForms {
  /** 1 */
  one: string;
  /** PL: 2–4, poza 12–14. Pominięte → `many`. */
  few?: string;
  /** Reszta. */
  many: string;
}

/**
 * Liczba mnoga liczona ręcznie, nie przez `Intl.PluralRules`: dwie reguły
 * są krótsze niż zależność od tabel ICU w środowisku Workera i dają się
 * przetestować co do jednej liczby.
 */
export function plural(locale: Locale, count: number, forms: PluralForms): string {
  const absolute = Math.abs(Math.trunc(count));

  if (absolute === 1) {
    return forms.one;
  }

  if (locale === "pl") {
    const lastDigit = absolute % 10;
    const lastTwoDigits = absolute % 100;
    const isFew = lastDigit >= 2 && lastDigit <= 4 && !(lastTwoDigits >= 12 && lastTwoDigits <= 14);

    return isFew ? (forms.few ?? forms.many) : forms.many;
  }

  return forms.many;
}
