import type { SessionSafetyCopy } from "./types";

export function getCrisisSafetyCopy(): SessionSafetyCopy {
  return {
    title: "Nie możemy kontynuować zwykłej symulacji",
    body: "Twoja wiadomość może dotyczyć pilnego zagrożenia. SafeSpace nie diagnozuje sytuacji i nie kontaktuje służb, dlatego w tym stanie zwykła symulacja rozmowy zostaje zatrzymana.",
    nextSteps: [
      "Jeśli grozi Ci natychmiastowe niebezpieczeństwo, skontaktuj się z numerem alarmowym w swoim kraju.",
      "Jeśli możesz, odezwij się teraz do zaufanej osoby albo lokalnej linii wsparcia kryzysowego.",
      "Nie zostawaj z tym samodzielnie, gdy czujesz, że możesz zrobić krzywdę sobie albo komuś innemu.",
    ],
  };
}

export function getSafetyUnavailableCopy(): SessionSafetyCopy {
  return {
    title: "Nie możemy teraz bezpiecznie rozpocząć symulacji",
    body: "Granica bezpieczeństwa nie jest dostępna albo nie zwróciła poprawnej odpowiedzi. SafeSpace w takiej sytuacji zatrzymuje zwykłą symulację zamiast zgadywać poziom ryzyka.",
    nextSteps: [
      "Spróbuj ponownie później.",
      "Jeśli sprawa jest pilna lub dotyczy zagrożenia, skorzystaj z lokalnego numeru alarmowego albo lokalnej linii kryzysowej.",
    ],
  };
}
