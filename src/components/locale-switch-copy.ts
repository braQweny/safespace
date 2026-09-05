import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

/** Nazwy własne języków nie są tłumaczone — endonim rozpozna każdy. */
export const LOCALE_ENDONYM: Readonly<Record<Locale, string>> = {
  en: "English",
  pl: "Polski",
};

interface LocaleSwitchCopy {
  label: string;
  description: string;
  switchTo: Readonly<Record<Locale, string>>;
}

const LOCALE_SWITCH_COPY = defineCopy<LocaleSwitchCopy>(
  {
    label: "Language",
    description: "Applies to this device and, when you are signed in, to your account on other devices as well.",
    switchTo: { en: "Switch to English", pl: "Switch to Polish" },
  },
  {
    label: "Język",
    description: "Dotyczy tego urządzenia, a po zalogowaniu także konta na innych urządzeniach.",
    switchTo: { en: "Przełącz na angielski", pl: "Przełącz na polski" },
  },
);

export function getLocaleSwitchCopy(locale: Locale) {
  return LOCALE_SWITCH_COPY[locale];
}
