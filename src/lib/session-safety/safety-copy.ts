import type { SessionSafetyCopy } from "./types";

export function getCrisisSafetyCopy(): SessionSafetyCopy {
  return {
    title: "Nie mozemy kontynuowac zwyklej symulacji",
    body: "Twoja wiadomosc moze dotyczyc pilnego zagrozenia. SafeSpace nie diagnozuje sytuacji i nie kontaktuje sluzb, dlatego w tym stanie zwykla symulacja rozmowy zostaje zatrzymana.",
    nextSteps: [
      "Jesli grozi Ci natychmiastowe niebezpieczenstwo, skontaktuj sie z numerem alarmowym w swoim kraju.",
      "Jesli mozesz, odezwij sie teraz do zaufanej osoby albo lokalnej linii wsparcia kryzysowego.",
      "Nie zostawaj z tym samodzielnie, gdy czujesz, ze mozesz zrobic krzywde sobie albo komus innemu.",
    ],
  };
}

export function getCautionSafetyCopy(): SessionSafetyCopy {
  return {
    title: "Mozemy kontynuowac tylko w bezpiecznych ramach",
    body: "Rozmowa moze isc dalej jako spokojne uporzadkowanie mysli, bez diagnozy, instrukcji ryzykownych dzialan ani obietnicy leczenia.",
    nextSteps: [
      "Jesli temat zacznie dotyczyc bezposredniego zagrozenia, zwykla symulacja zostanie przerwana.",
      "W razie nasilajacego sie kryzysu skorzystaj z lokalnego wsparcia kryzysowego lub pomocy specjalisty.",
    ],
  };
}

export function getSafetyUnavailableCopy(): SessionSafetyCopy {
  return {
    title: "Nie mozemy teraz bezpiecznie rozpoczac symulacji",
    body: "Granica bezpieczenstwa nie jest dostepna albo nie zwrocila poprawnej odpowiedzi. SafeSpace w takiej sytuacji zatrzymuje zwykla symulacje zamiast zgadywac poziom ryzyka.",
    nextSteps: [
      "Sprobuj ponownie pozniej.",
      "Jesli sprawa jest pilna lub dotyczy zagrozenia, skorzystaj z lokalnego numeru alarmowego albo lokalnej linii kryzysowej.",
    ],
  };
}
