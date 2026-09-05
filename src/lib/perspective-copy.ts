import type { ModalityId } from "@/lib/modalities";

/** Krótkie etykiety wyboru, niezależne od instrukcji wysyłanych do modelu. */
export const perspectiveFocus: Record<ModalityId, string> = {
  psychodynamic: "Emocje i powracające wzorce",
  cbt: "Jedna sytuacja, krok po kroku",
  humanistic_experiential: "To, co czujesz teraz",
  systemic: "Relacje i komunikacja",
  integrative: "Łączenie różnych perspektyw",
};
