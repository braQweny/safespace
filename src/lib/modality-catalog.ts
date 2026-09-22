/**
 * Katalog perspektyw bez promptów: identyfikatory, imię awatara i grafika —
 * wszystko, czego potrzebuje UI. Island importuje ten moduł (bezpośrednio albo
 * przez `modality-copy.ts`), więc trafia on do paczki klienta; persony AI
 * (`sessionStyleHint`, `summaryLensHint`, `registerExamples`, głos warstwy
 * live) dokłada wyłącznie serwerowy `modalities.ts`. Nie dopisuj tu pól
 * promptowych — `__tests__/modality-catalog.test.ts` i reguła ESLint pilnują,
 * żeby prompty nie wyciekły do przeglądarki.
 */
export const MODALITY_CATALOG = [
  {
    modalityId: "psychodynamic",
    avatarId: "psychodynamic-listener",
    avatarFirstName: "Lena",
    assetPath: "/avatars/psychodynamic-listener.webp",
  },
  {
    modalityId: "cbt",
    avatarId: "cbt-guide",
    avatarFirstName: "Marek",
    assetPath: "/avatars/cbt-guide.webp",
  },
  {
    modalityId: "humanistic_experiential",
    avatarId: "experiential-companion",
    avatarFirstName: "Nadia",
    assetPath: "/avatars/experiential-companion.webp",
  },
  {
    modalityId: "systemic",
    avatarId: "systemic-connector",
    avatarFirstName: "Olek",
    assetPath: "/avatars/systemic-connector.webp",
  },
  {
    modalityId: "integrative",
    avatarId: "integrative-guide",
    avatarFirstName: "Iga",
    assetPath: "/avatars/integrative-guide.webp",
  },
] as const;

export type ModalityCatalogEntry = (typeof MODALITY_CATALOG)[number];
export type ModalityId = ModalityCatalogEntry["modalityId"];
export type AvatarId = ModalityCatalogEntry["avatarId"];

/**
 * Neutralny językowo wybór awatara: przechodzi granicę serwer→island i API
 * historii, więc nie niesie żadnego tekstu. Nazwy i opisy dokłada
 * `getModalityCopy(locale, modalityId)`.
 */
export interface SelectedModalityAvatar {
  modalityId: ModalityId;
  avatarId: AvatarId;
  avatarFirstName: string;
  assetPath: string;
}

export function getCatalogEntryById(modalityId: unknown) {
  if (typeof modalityId !== "string") {
    return null;
  }

  return MODALITY_CATALOG.find((entry) => entry.modalityId === modalityId) ?? null;
}

export function getCatalogEntryByAvatarId(avatarId: unknown) {
  if (typeof avatarId !== "string") {
    return null;
  }

  return MODALITY_CATALOG.find((entry) => entry.avatarId === avatarId) ?? null;
}

/** Przyjmuje też pełny wpis z `modalities.ts` i zostawia z niego tylko pola katalogu. */
export function toSelectedModalityAvatar(entry: ModalityCatalogEntry): SelectedModalityAvatar {
  return {
    modalityId: entry.modalityId,
    avatarId: entry.avatarId,
    avatarFirstName: entry.avatarFirstName,
    assetPath: entry.assetPath,
  };
}

/** Lista wyboru dla islandów: ids, imię i grafika. */
export const MODALITY_CHOICES: readonly SelectedModalityAvatar[] = MODALITY_CATALOG.map(toSelectedModalityAvatar);
