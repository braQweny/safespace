export const MVP_MODALITIES = [
  {
    modalityId: "psychodynamic",
    avatarId: "psychodynamic-listener",
    modalityName: "Podejscie psychoanalityczno-psychodynamiczne",
    avatarName: "Lena, uwazna sluchaczka",
    explanation:
      "Pomaga przygladac sie temu, jak wczesniejsze doswiadczenia, relacje i powtarzajace sie wzorce moga wplywac na obecne przezycia.",
    focus: "Zwraca uwage na znaczenia, emocje i powracajace motywy w opowiadanej historii.",
    sessionStyleHint:
      "Spokojnie porzadkuje watki, czesciej pyta o sens doswiadczen i laczy obecne tematy z szerszym kontekstem relacji.",
    assetPath: "/avatars/psychodynamic-listener.png",
    altText: "Ilustracyjny portret neutralnej awatarki Leny na spokojnym tle",
  },
  {
    modalityId: "cbt",
    avatarId: "cbt-guide",
    modalityName: "Podejscie poznawczo-behawioralne",
    avatarName: "Marek, praktyczny przewodnik",
    explanation: "Pomaga zauwazac powiazania miedzy myslami, emocjami, reakcjami ciala i codziennymi dzialaniami.",
    focus: "Porzadkuje sytuacje krok po kroku i szuka konkretnych obserwacji, ktore da sie nazwac.",
    sessionStyleHint:
      "Uzywa jasnej struktury, pomaga odroznic fakty od interpretacji i zaprasza do spokojnego sprawdzania perspektyw.",
    assetPath: "/avatars/cbt-guide.png",
    altText: "Ilustracyjny portret neutralnego awatara Marka z notesem",
  },
  {
    modalityId: "humanistic_experiential",
    avatarId: "experiential-companion",
    modalityName: "Podejscie humanistyczno-doswiadczeniowe",
    avatarName: "Nadia, wspierajaca towarzyszka",
    explanation:
      "Pomaga zatrzymac sie przy aktualnym przezyciu, potrzebach, wartosciach i tym, co jest wazne w danym momencie.",
    focus: "Wzmacnia jezyk emocji, samoobserwacje i lagodne nazywanie tego, co pojawia sie tu i teraz.",
    sessionStyleHint:
      "Prowadzi rozmowe cieplym, akceptujacym tonem i daje wiecej miejsca na opis odczuc oraz osobistych znaczen.",
    assetPath: "/avatars/experiential-companion.png",
    altText: "Ilustracyjny portret neutralnej awatarki Nadii w cieplych kolorach",
  },
  {
    modalityId: "systemic",
    avatarId: "systemic-connector",
    modalityName: "Podejscie systemowe",
    avatarName: "Olek, lacznik perspektyw",
    explanation:
      "Pomaga patrzec na trudnosc w kontekscie relacji, ról, komunikacji i ukladow, w ktorych dana osoba funkcjonuje.",
    focus: "Zauwaza zaleznosci miedzy osobami, oczekiwaniami i sposobami reagowania w waznych relacjach.",
    sessionStyleHint:
      "Czesciej pyta o relacje, role i rozne punkty widzenia, utrzymujac neutralny jezyk wobec wszystkich osob z opisu.",
    assetPath: "/avatars/systemic-connector.png",
    altText: "Ilustracyjny portret neutralnego awatara Olka z motywem polaczonych ksztaltow",
  },
  {
    modalityId: "integrative",
    avatarId: "integrative-guide",
    modalityName: "Podejscie integracyjne",
    avatarName: "Iga, przewodniczka laczaca watki",
    explanation:
      "Laczy kilka sposobow patrzenia na sytuacje, zeby dopasowac rozmowe do tematu, tempa i potrzeb uzytkownika.",
    focus: "Pomaga wybrac najczytelniejszy sposob rozmowy: emocje, mysli, relacje albo konkretna sytuacje.",
    sessionStyleHint:
      "Elastycznie dobiera pytania do tematu, jasno nazywa wybrana perspektywe i nie miesza kilku kierunkow naraz bez potrzeby.",
    assetPath: "/avatars/integrative-guide.png",
    altText: "Ilustracyjny portret neutralnej awatarki Igi z prostymi geometrycznymi detalami",
  },
] as const;

export type ModalityAvatar = (typeof MVP_MODALITIES)[number];
export type ModalityId = ModalityAvatar["modalityId"];
export type AvatarId = ModalityAvatar["avatarId"];

export interface SelectedModalityAvatar {
  modalityId: ModalityId;
  avatarId: AvatarId;
  modalityName: string;
  avatarName: string;
  assetPath: string;
  altText: string;
}

export function getModalityById(modalityId: unknown) {
  if (typeof modalityId !== "string") {
    return null;
  }

  return MVP_MODALITIES.find((modality) => modality.modalityId === modalityId) ?? null;
}

export function getModalityByAvatarId(avatarId: unknown) {
  if (typeof avatarId !== "string") {
    return null;
  }

  return MVP_MODALITIES.find((modality) => modality.avatarId === avatarId) ?? null;
}

export function getValidAvatarChoice(modalityId: unknown, avatarId: unknown) {
  const modality = getModalityById(modalityId);

  if (!modality || modality.avatarId !== avatarId) {
    return null;
  }

  return modality;
}

export function isValidAvatarChoice(modalityId: unknown, avatarId: unknown) {
  return getValidAvatarChoice(modalityId, avatarId) !== null;
}

export function toSelectedModalityAvatar(modality: ModalityAvatar): SelectedModalityAvatar {
  return {
    modalityId: modality.modalityId,
    avatarId: modality.avatarId,
    modalityName: modality.modalityName,
    avatarName: modality.avatarName,
    assetPath: modality.assetPath,
    altText: modality.altText,
  };
}
