import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";
import type { SessionSafetyCopy } from "./types";

interface SafetyCopy {
  crisis: SessionSafetyCopy;
  unavailable: SessionSafetyCopy;
}

/**
 * Najbardziej odpowiedzialne zdania w produkcie: mówią, że SafeSpace nie
 * ocenia sytuacji i nie kontaktuje służb. Obie wersje muszą to obiecywać
 * dokładnie tak samo (pinuje to `crisis-resources.test.ts`).
 */
const SAFETY_COPY = defineCopy<SafetyCopy>(
  {
    crisis: {
      title: "We can't continue the usual simulation",
      body: "Your message may concern an urgent danger. SafeSpace does not assess the situation and does not contact emergency services, so in this state the usual conversation simulation is stopped.",
      nextSteps: [
        "If you are in immediate danger, contact the emergency number in your country.",
        "If you can, reach out now to someone you trust or to a local crisis support line.",
        "Don't stay alone with this if you feel you might hurt yourself or someone else.",
      ],
    },
    unavailable: {
      title: "We can't safely start the simulation right now",
      body: "The safety boundary is unavailable or did not return a valid answer. In that situation SafeSpace stops the usual simulation instead of guessing the level of risk.",
      nextSteps: [
        "Please try again later.",
        "If the matter is urgent or involves danger, use your local emergency number or a local crisis line.",
      ],
    },
  },
  {
    crisis: {
      title: "Nie możemy kontynuować zwykłej symulacji",
      body: "Twoja wiadomość może dotyczyć pilnego zagrożenia. SafeSpace nie diagnozuje sytuacji i nie kontaktuje służb, dlatego w tym stanie zwykła symulacja rozmowy zostaje zatrzymana.",
      nextSteps: [
        "Jeśli grozi Ci natychmiastowe niebezpieczeństwo, skontaktuj się z numerem alarmowym w swoim kraju.",
        "Jeśli możesz, odezwij się teraz do zaufanej osoby albo lokalnej linii wsparcia kryzysowego.",
        "Nie zostawaj z tym samodzielnie, gdy czujesz, że możesz zrobić krzywdę sobie albo komuś innemu.",
      ],
    },
    unavailable: {
      title: "Nie możemy teraz bezpiecznie rozpocząć symulacji",
      body: "Granica bezpieczeństwa nie jest dostępna albo nie zwróciła poprawnej odpowiedzi. SafeSpace w takiej sytuacji zatrzymuje zwykłą symulację zamiast zgadywać poziom ryzyka.",
      nextSteps: [
        "Spróbuj ponownie później.",
        "Jeśli sprawa jest pilna lub dotyczy zagrożenia, skorzystaj z lokalnego numeru alarmowego albo lokalnej linii kryzysowej.",
      ],
    },
  },
);

export function getCrisisSafetyCopy(locale: Locale): SessionSafetyCopy {
  return SAFETY_COPY[locale].crisis;
}

export function getSafetyUnavailableCopy(locale: Locale): SessionSafetyCopy {
  return SAFETY_COPY[locale].unavailable;
}
