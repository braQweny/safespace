import type { ModalityId } from "@/lib/modalities";

/**
 * Klasy odcienia dla każdej perspektywy. Wartości kolorów żyją w tokenach
 * `--color-persp-*` (`src/styles/global.css`) — tu są tylko pełne nazwy klas,
 * bo Tailwind musi je zobaczyć w źródle w całości, nie sklejone z kawałków.
 */
export interface PerspectiveTint {
  /** Kolor tekstu (nazwa nurtu, etykieta mówiącego). */
  text: string;
  /** Miękkie tło (plakietka, karta z cytatem). */
  soft: string;
  /** Obwódka pod zaznaczenie. */
  border: string;
}

export const PERSPECTIVE_TINTS: Record<ModalityId, PerspectiveTint> = {
  psychodynamic: {
    text: "text-persp-psychodynamic",
    soft: "bg-persp-psychodynamic-soft",
    border: "border-persp-psychodynamic",
  },
  cbt: {
    text: "text-persp-cbt",
    soft: "bg-persp-cbt-soft",
    border: "border-persp-cbt",
  },
  humanistic_experiential: {
    text: "text-persp-humanistic",
    soft: "bg-persp-humanistic-soft",
    border: "border-persp-humanistic",
  },
  systemic: {
    text: "text-persp-systemic",
    soft: "bg-persp-systemic-soft",
    border: "border-persp-systemic",
  },
  integrative: {
    text: "text-persp-integrative",
    soft: "bg-persp-integrative-soft",
    border: "border-persp-integrative",
  },
};

export function getPerspectiveTint(modalityId: ModalityId): PerspectiveTint {
  return PERSPECTIVE_TINTS[modalityId];
}
