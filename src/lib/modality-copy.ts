import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";
import { getModalityByAvatarId, MVP_MODALITIES, type AvatarId, type ModalityId } from "@/lib/modalities";

/**
 * Teksty perspektyw widoczne dla użytkownika. Imiona awatarów (Lena, Marek,
 * Nadia, Olek, Iga) są takie same w obu językach — tłumaczy się dopisek roli
 * i opisy. `avatarName` zawsze ma postać „Imię, rola”, więc pierwsze imię
 * zostaje neutralne w katalogu (`avatarFirstName`).
 */
export interface ModalityCopy {
  modalityName: string;
  /** Krótka etykieta wyboru: mówi o perspektywie, nie o „podejściu”. */
  perspectiveLabel: string;
  /** Jedno zdanie o tym, na czym perspektywa się skupia (karta panelu, wybór). */
  perspectiveFocus: string;
  avatarRole: string;
  avatarName: string;
  explanation: string;
  focus: string;
  voiceSample: string;
  pairingNote: string;
  altText: string;
}

type ModalityCopyInput = Omit<ModalityCopy, "avatarName">;

function withAvatarName(firstName: string, copy: ModalityCopyInput): ModalityCopy {
  return { ...copy, avatarName: `${firstName}, ${copy.avatarRole}` };
}

const MODALITY_COPY = defineCopy<Readonly<Record<ModalityId, ModalityCopyInput>>>(
  {
    psychodynamic: {
      modalityName: "Psychoanalytic and psychodynamic approach",
      perspectiveLabel: "Psychodynamic perspective",
      perspectiveFocus: "Emotions and recurring patterns",
      avatarRole: "attentive listener",
      explanation:
        "Helps you look at how earlier experiences, relationships and recurring patterns may shape what you are going through now.",
      focus: "Pays attention to meanings, emotions and returning motifs in the story you tell.",
      voiceSample: "we don't have to rush this. let's stay with it for a moment.",
      pairingNote:
        "Lena speaks briefly and calmly. She helps you look at feelings, inner conflicts and recurring patterns in relationships without imposing interpretations. If you are looking for concrete steps, Marek may be a closer fit.",
      altText: "Illustrative portrait of Lena, a neutral avatar, on a calm background",
    },
    cbt: {
      modalityName: "Cognitive-behavioural approach",
      perspectiveLabel: "Cognitive-behavioural perspective",
      perspectiveFocus: "One situation, step by step",
      avatarRole: "practical guide",
      explanation: "Helps you notice the links between thoughts, emotions, bodily reactions and everyday actions.",
      focus: "Sorts situations out step by step and looks for concrete observations that can be named.",
      voiceSample: "let's separate fact from interpretation for a moment…",
      pairingNote:
        "Marek speaks concretely and like a real person, without a coach's tone. He first acknowledges the feeling, then sorts out one situation and may suggest a small, optional step. If you'd rather stay with the experience than sort it out, Nadia may be a closer fit.",
      altText: "Illustrative portrait of Marek, a neutral avatar, with a notebook",
    },
    humanistic_experiential: {
      modalityName: "Humanistic and experiential approach",
      perspectiveLabel: "Humanistic-experiential perspective",
      perspectiveFocus: "What you are feeling right now",
      avatarRole: "supportive companion",
      explanation: "Helps you pause at your present experience, needs, values and what matters in this moment.",
      focus: "Strengthens the language of emotions, self-observation and gently naming what shows up here and now.",
      voiceSample: "let's stay with this feeling for a moment.",
      pairingNote:
        "Nadia speaks warmly and without hurry. She helps you find your own words for experiences and needs, following what matters to you. If you need structure or clear questions, Marek may be a closer fit.",
      altText: "Illustrative portrait of Nadia, a neutral avatar, in warm colours",
    },
    systemic: {
      modalityName: "Systemic approach",
      perspectiveLabel: "Systemic perspective",
      perspectiveFocus: "Relationships and communication",
      avatarRole: "connector of perspectives",
      explanation:
        "Helps you look at a difficulty in the context of relationships, roles, communication and the systems a person lives in.",
      focus: "Notices the dependencies between people, expectations and ways of reacting in important relationships.",
      voiceSample: "what usually happens next?",
      pairingNote:
        "Olek helps you understand communication patterns, roles and boundaries in relationships. He takes power differences into account and never excuses harm. If you'd rather stay with your own experience than with the dynamics between people, Nadia or Lena may be a closer fit.",
      altText: "Illustrative portrait of Olek, a neutral avatar, with a motif of connected shapes",
    },
    integrative: {
      modalityName: "Integrative approach",
      perspectiveLabel: "Integrative perspective",
      perspectiveFocus: "Connecting different perspectives",
      avatarRole: "guide who connects the threads",
      explanation:
        "Combines several ways of looking at a situation to fit the conversation to your topic, pace and needs.",
      focus: "Helps you choose the clearest way to talk: emotions, thoughts, relationships or a concrete situation.",
      voiceSample: "we could put this more simply…",
      pairingNote:
        "Iga speaks clearly and flexibly: she keeps one thread per reply and sometimes hands the choice of direction back to you. If you already know what kind of conversation you're looking for, choose it directly — if not, Iga is a good first choice.",
      altText: "Illustrative portrait of Iga, a neutral avatar, with simple geometric details",
    },
  },
  {
    psychodynamic: {
      modalityName: "Podejście psychoanalityczno-psychodynamiczne",
      perspectiveLabel: "Perspektywa psychodynamiczna",
      perspectiveFocus: "Emocje i powracające wzorce",
      avatarRole: "uważna słuchaczka",
      explanation:
        "Pomaga przyglądać się temu, jak wcześniejsze doświadczenia, relacje i powtarzające się wzorce mogą wpływać na obecne przeżycia.",
      focus: "Zwraca uwagę na znaczenia, emocje i powracające motywy w opowiadanej historii.",
      voiceSample: "nie musimy się z tym spieszyć. zostańmy przy tym chwilę.",
      pairingNote:
        "Lena mówi krótko i spokojnie. Pomaga przyglądać się uczuciom, wewnętrznym konfliktom i powracającym wzorcom w relacjach, bez narzucania interpretacji. Jeśli szukasz konkretnych kroków, bliżej Ci może być do Marka.",
      altText: "Ilustracyjny portret neutralnej awatarki Leny na spokojnym tle",
    },
    cbt: {
      modalityName: "Podejście poznawczo-behawioralne",
      perspectiveLabel: "Perspektywa poznawczo-behawioralna",
      perspectiveFocus: "Jedna sytuacja, krok po kroku",
      avatarRole: "praktyczny przewodnik",
      explanation: "Pomaga zauważać powiązania między myślami, emocjami, reakcjami ciała i codziennymi działaniami.",
      focus: "Porządkuje sytuacje krok po kroku i szuka konkretnych obserwacji, które da się nazwać.",
      voiceSample: "oddzielmy na chwilę fakt od interpretacji…",
      pairingNote:
        "Marek mówi konkretnie i po ludzku, bez tonu trenera. Najpierw przyjmuje uczucie, potem porządkuje jedną sytuację i może zaproponować mały, dobrowolny krok. Jeśli wolisz zostać przy przeżywaniu zamiast porządkować, bliżej Ci może być do Nadii.",
      altText: "Ilustracyjny portret neutralnego awatara Marka z notesem",
    },
    humanistic_experiential: {
      modalityName: "Podejście humanistyczno-doświadczeniowe",
      perspectiveLabel: "Perspektywa humanistyczno-doświadczeniowa",
      perspectiveFocus: "To, co czujesz teraz",
      avatarRole: "wspierająca towarzyszka",
      explanation:
        "Pomaga zatrzymać się przy aktualnym przeżyciu, potrzebach, wartościach i tym, co jest ważne w danym momencie.",
      focus: "Wzmacnia język emocji, samoobserwację i łagodne nazywanie tego, co pojawia się tu i teraz.",
      voiceSample: "zostańmy przez moment przy tym uczuciu.",
      pairingNote:
        "Nadia mówi ciepło i bez pośpiechu. Pomaga szukać własnych słów dla przeżyć i potrzeb, podążając za tym, co jest dla Ciebie ważne. Jeśli potrzebujesz struktury albo jasnych pytań, bliżej Ci może być do Marka.",
      altText: "Ilustracyjny portret neutralnej awatarki Nadii w ciepłych kolorach",
    },
    systemic: {
      modalityName: "Podejście systemowe",
      perspectiveLabel: "Perspektywa systemowa",
      perspectiveFocus: "Relacje i komunikacja",
      avatarRole: "łącznik perspektyw",
      explanation:
        "Pomaga patrzeć na trudność w kontekście relacji, ról, komunikacji i układów, w których dana osoba funkcjonuje.",
      focus: "Zauważa zależności między osobami, oczekiwaniami i sposobami reagowania w ważnych relacjach.",
      voiceSample: "co zwykle dzieje się potem?",
      pairingNote:
        "Olek pomaga rozumieć wzorce komunikacji, role i granice w relacjach. Uwzględnia różnice sił i nie usprawiedliwia krzywdzenia. Jeśli chcesz zostać przy własnym przeżyciu, a nie przy układzie między osobami, bliżej Ci może być do Nadii lub Leny.",
      altText: "Ilustracyjny portret neutralnego awatara Olka z motywem połączonych kształtów",
    },
    integrative: {
      modalityName: "Podejście integracyjne",
      perspectiveLabel: "Perspektywa integracyjna",
      perspectiveFocus: "Łączenie różnych perspektyw",
      avatarRole: "przewodniczka łącząca wątki",
      explanation:
        "Łączy kilka sposobów patrzenia na sytuację, żeby dopasować rozmowę do tematu, tempa i potrzeb użytkownika.",
      focus: "Pomaga wybrać najczytelniejszy sposób rozmowy: emocje, myśli, relacje albo konkretną sytuację.",
      voiceSample: "możemy to ująć prościej…",
      pairingNote:
        "Iga mówi jasno i elastycznie: w jednej odpowiedzi trzyma jeden wątek i czasem oddaje Ci wybór kierunku. Jeśli od początku wiesz, jakiego sposobu rozmowy szukasz, wybierz go wprost — jeśli nie, Iga jest dobrym pierwszym wyborem.",
      altText: "Ilustracyjny portret neutralnej awatarki Igi z prostymi geometrycznymi detalami",
    },
  },
);

const FIRST_NAMES: Readonly<Record<ModalityId, string>> = Object.fromEntries(
  MVP_MODALITIES.map((modality) => [modality.modalityId, modality.avatarFirstName]),
) as Record<ModalityId, string>;

export function getModalityCopy(locale: Locale, modalityId: ModalityId): ModalityCopy {
  return withAvatarName(FIRST_NAMES[modalityId], MODALITY_COPY[locale][modalityId]);
}

export function getModalityCopyByAvatarId(locale: Locale, avatarId: AvatarId): ModalityCopy {
  const modality = getModalityByAvatarId(avatarId);

  if (!modality) {
    throw new Error("unknown_avatar_id");
  }

  return getModalityCopy(locale, modality.modalityId);
}

export function getPerspectiveLabel(locale: Locale, modalityId: ModalityId) {
  return MODALITY_COPY[locale][modalityId].perspectiveLabel;
}

/**
 * Nazwy do promptów: hinty są po angielsku, więc metadane awatara też —
 * niezależnie od języka interfejsu, żeby prompt był deterministyczny.
 */
export function getModalityPromptNames(modalityId: ModalityId) {
  const copy = getModalityCopy("en", modalityId);

  return { modalityName: copy.modalityName, avatarName: copy.avatarName };
}
