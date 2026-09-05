import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

/** Neutralne id sekcji: te same w obu partialach, linkowalne z każdej strony (`/privacy#ai`). */
export const PRIVACY_SECTION_IDS = [
  "what-is",
  "data",
  "who-sees",
  "ai",
  "deletion",
  "plans",
  "crisis",
  "contact",
] as const;

export type PrivacySectionId = (typeof PRIVACY_SECTION_IDS)[number];

interface PrivacyCopy {
  pageTitle: string;
  description: string;
  eyebrow: string;
  title: string;
  intro: string;
  tocAria: string;
  tocTitle: string;
  sections: Readonly<Record<PrivacySectionId, string>>;
  backToDashboard: string;
  backHome: string;
}

const PRIVACY_COPY = defineCopy<PrivacyCopy>(
  {
    pageTitle: "Privacy and terms - SafeSpace",
    description: "How SafeSpace processes data, who sees conversations and how to delete them.",
    eyebrow: "SafeSpace",
    title: "Privacy and terms of use",
    intro:
      "Briefly and plainly: what SafeSpace does with your data, who has access to it and what the product does not do.",
    tocAria: "Table of contents",
    tocTitle: "On this page",
    sections: {
      "what-is": "What SafeSpace is",
      data: "What data we process",
      "who-sees": "Who sees your conversations",
      ai: "How AI works in a conversation",
      deletion: "Deletion and control",
      plans: "Free and premium plans",
      crisis: "Help in a crisis",
      contact: "Contact",
    },
    backToDashboard: "Back to the dashboard",
    backHome: "Back to the home page",
  },
  {
    pageTitle: "Prywatność i zasady - SafeSpace",
    description: "Jak SafeSpace przetwarza dane, kto widzi rozmowy i jak je usunąć.",
    eyebrow: "SafeSpace",
    title: "Prywatność i zasady korzystania",
    intro: "Krótko i po ludzku: co SafeSpace robi z Twoimi danymi, kto ma do nich dostęp i czego produkt nie robi.",
    tocAria: "Spis treści",
    tocTitle: "Na tej stronie",
    sections: {
      "what-is": "Czym jest SafeSpace",
      data: "Jakie dane przetwarzamy",
      "who-sees": "Kto widzi Twoje rozmowy",
      ai: "Jak działa AI w rozmowie",
      deletion: "Usuwanie i kontrola",
      plans: "Plan bezpłatny i premium",
      crisis: "Pomoc w kryzysie",
      contact: "Kontakt",
    },
    backToDashboard: "Wróć do panelu",
    backHome: "Wróć na stronę główną",
  },
);

export function getPrivacyCopy(locale: Locale): PrivacyCopy {
  return PRIVACY_COPY[locale];
}
