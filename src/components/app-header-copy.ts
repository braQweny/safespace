import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

const APP_HEADER_COPY = defineCopy(
  {
    activePill: (remainingMinutes: number | null) =>
      remainingMinutes ? `Conversation in progress · ~${remainingMinutes} min` : "Conversation in progress",
    account: "Account",
    planSettings: "Plan and settings",
    appearance: "Appearance",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Evening",
    signOut: "Sign out",
    signIn: "Sign in",
  },
  {
    activePill: (remainingMinutes) =>
      remainingMinutes ? `Rozmowa w toku · ok. ${remainingMinutes} min` : "Rozmowa w toku",
    account: "Konto",
    planSettings: "Plan i ustawienia",
    appearance: "Wygląd",
    themeSystem: "System",
    themeLight: "Jasny",
    themeDark: "Wieczorny",
    signOut: "Wyloguj się",
    signIn: "Zaloguj się",
  },
);

export function getAppHeaderCopy(locale: Locale) {
  return APP_HEADER_COPY[locale];
}
