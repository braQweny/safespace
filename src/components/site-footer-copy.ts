import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

const SITE_FOOTER_COPY = defineCopy(
  {
    disclaimer:
      "an educational conversation simulation — not therapy, a diagnosis or crisis help. In an emergency, call your local emergency number.",
    navAria: "About the service",
    privacy: "Privacy and terms",
    contact: "Contact",
  },
  {
    disclaimer:
      "edukacyjna symulacja rozmowy — nie terapia, diagnoza ani pomoc kryzysowa. W nagłym zagrożeniu zadzwoń pod lokalny numer alarmowy.",
    navAria: "Informacje o serwisie",
    privacy: "Prywatność i zasady",
    contact: "Kontakt",
  },
);

export function getSiteFooterCopy(locale: Locale) {
  return SITE_FOOTER_COPY[locale];
}
