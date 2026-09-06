import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";
import { plural } from "@/lib/i18n/plural";
import type { PeopleFailureCode } from "@/lib/session-flow/people-contract";
import type { PeopleFactKind } from "@/lib/session-summary/people-memory-budget";

/**
 * Teksty sekcji „Osoby z Twoich rozmów”. Imion użytkownika nie odmieniamy:
 * stoją w mianowniku po dwukropku albo w nagłówku, bo forma „o Marcie” nie
 * wynika z zapisu.
 */
interface PeopleCardsCopy {
  title: string;
  intro: (firstName: string) => string;
  empty: (firstName: string) => string;
  disabled: string;
  disabledWithCards: string;
  settingsLink: string;
  readFailed: string;
  openCardSr: (name: string) => string;
  mentions: (count: number) => string;
  mentionsTitle: string;
  lastMentioned: (day: string) => string;
  relationFallback: string;
  dialogAria: string;
  ownAccountNote: string;
  firstMentioned: (day: string) => string;
  kinds: Readonly<Record<PeopleFactKind, string>>;
  /** Nagłówek osi czasu: próby i rezultaty razem, chronologicznie. */
  timelineTitle: string;
  noFacts: string;
  provenance: (count: number) => string;
  provenanceUnknown: string;
  editedByYou: string;
  lockedNote: (firstName: string) => string;
  edit: string;
  fields: {
    name: string;
    relation: string;
    note: string;
    hint: (max: number) => string;
  };
  save: string;
  saving: string;
  saved: string;
  cancel: string;
  close: string;
  factEdit: string;
  factDelete: string;
  factSave: string;
  confirmFactDeleteTitle: string;
  confirmFactDeleteBody: string;
  confirmFactDelete: string;
  forget: string;
  confirmForgetTitle: string;
  confirmForgetBody: (firstName: string, name: string) => string;
  confirmForget: string;
  forgetting: string;
  forgotten: (name: string) => string;
  talkAbout: string;
  talkAboutResume: string;
  talkAboutDraft: (name: string, relation: string | null) => string;
  errors: Readonly<Record<PeopleFailureCode, string>>;
}

const PEOPLE_CARDS_COPY = defineCopy<PeopleCardsCopy>(
  {
    title: "People from your conversations",
    intro: (firstName) =>
      `${firstName} remembers who the people you mention are to you. You can correct any card or ask to forget a person.`,
    empty: (firstName) => `Once you mention someone, ${firstName} will remember who that person is to you.`,
    disabled: "Remembering people from conversations is switched off.",
    disabledWithCards: "Remembering people is switched off. The cards below stay until you delete them.",
    settingsLink: "Settings",
    readFailed: "We couldn't read the people cards. Refresh the dashboard in a moment.",
    openCardSr: (name) => `Open the card: ${name}.`,
    mentions: (count) => plural("en", count, { one: "1 conversation", many: `${count} conversations` }),
    mentionsTitle: "How many earlier conversations mentioned this person",
    lastMentioned: (day) => `last on ${day}`,
    relationFallback: "relation not recorded",
    dialogAria: "Person card",
    ownAccountNote:
      "Everything on this card comes from your own words in conversations, not from the avatar's judgement.",
    firstMentioned: (day) => `First mentioned on ${day}`,
    kinds: {
      who: "Who they are to you",
      account: "From your account",
      feeling: "How you feel about it",
      wish: "What you'd like to change",
      attempt: "Something you agreed to try",
      outcome: "What came of it later",
    },
    timelineTitle: "Attempts and what came of them",
    noFacts: "No entries yet.",
    provenance: (count) => plural("en", count, { one: "from the conversation on", many: "from the conversations on" }),
    provenanceUnknown: "from an earlier conversation",
    editedByYou: "corrected by you",
    lockedNote: (firstName) => `A name or relation you correct stays as you wrote it; ${firstName} won't change it.`,
    edit: "Edit",
    fields: {
      name: "Name",
      relation: "Who they are to you",
      note: "Your own note",
      hint: (max) => `Up to ${max} characters.`,
    },
    save: "Save",
    saving: "Saving…",
    saved: "Saved.",
    cancel: "Cancel",
    close: "Close",
    factEdit: "Correct",
    factDelete: "Remove entry",
    factSave: "Save entry",
    confirmFactDeleteTitle: "Remove this entry?",
    confirmFactDeleteBody: "The entry disappears from the card. The conversation transcript stays unchanged.",
    confirmFactDelete: "Remove",
    forget: "Forget this person",
    confirmForgetTitle: "Forget this person for good?",
    confirmForgetBody: (firstName, name) =>
      `${firstName} will no longer remember who ${name} is: the card disappears and the memory of earlier conversations is rebuilt without this person. Conversation transcripts and their summaries stay.`,
    confirmForget: "Forget",
    forgetting: "Forgetting…",
    forgotten: (name) => `The card has been removed: ${name}.`,
    talkAbout: "Talk about this person",
    talkAboutResume: "Back to the conversation, about this person",
    talkAboutDraft: (name, relation) =>
      relation ? `I'd like to talk about ${name} (${relation}) today.` : `I'd like to talk about ${name} today.`,
    errors: {
      missing_auth: "Sign in to see the people cards.",
      account_blocked: "The account is blocked.",
      account_access_unavailable: "We couldn't verify access to the account. Please try again.",
      session_data_unavailable: "People cards are temporarily unavailable.",
      people_memory_unavailable: "Remembering people is currently unavailable.",
      validation_failed: "Check the text: a name is required and each field has a length limit.",
      person_not_found: "This card wasn't found or has already been removed.",
      fact_not_found: "This entry wasn't found or has already been removed.",
      read_failed: "The cards couldn't be read. Please try again in a moment.",
      update_failed: "The card couldn't be saved. Please try again in a moment.",
      forget_failed: "The person couldn't be forgotten. Please try again in a moment.",
      delete_failed: "The entry couldn't be removed. Please try again in a moment.",
    },
  },
  {
    title: "Osoby z Twoich rozmów",
    intro: (firstName) =>
      `${firstName} zapamiętuje, kim są dla Ciebie osoby, o których wspominasz. Każdą kartę możesz poprawić albo poprosić o zapomnienie.`,
    empty: (firstName) => `Gdy wspomnisz o kimś, ${firstName} zapamięta, kim ta osoba jest dla Ciebie.`,
    disabled: "Zapamiętywanie osób z rozmów jest wyłączone.",
    disabledWithCards: "Zapamiętywanie osób jest wyłączone. Poniższe karty zostają, dopóki ich nie usuniesz.",
    settingsLink: "Ustawienia",
    readFailed: "Nie udało się odczytać kart osób. Odśwież panel za chwilę.",
    openCardSr: (name) => `Otwórz kartę: ${name}.`,
    mentions: (count) => plural("pl", count, { one: "1 rozmowa", few: `${count} rozmowy`, many: `${count} rozmów` }),
    mentionsTitle: "W ilu wcześniejszych rozmowach pojawiła się ta osoba",
    lastMentioned: (day) => `ostatnio ${day}`,
    relationFallback: "relacja niezapisana",
    dialogAria: "Karta osoby",
    ownAccountNote: "Wszystko na tej karcie pochodzi z Twoich słów w rozmowach, nie z ocen awatara.",
    firstMentioned: (day) => `Pierwsza wzmianka: ${day}`,
    kinds: {
      who: "Kim jest dla Ciebie",
      account: "Z Twojego opisu",
      feeling: "Jak to przeżywasz",
      wish: "Co chcesz zmienić",
      attempt: "Uzgodniona próba",
      outcome: "Późniejszy rezultat",
    },
    timelineTitle: "Próby i ich rezultaty",
    noFacts: "Brak wpisów.",
    provenance: (count) => plural("pl", count, { one: "z rozmowy z dnia", many: "z rozmów z dni" }),
    provenanceUnknown: "z wcześniejszej rozmowy",
    editedByYou: "poprawione przez Ciebie",
    lockedNote: (firstName) => `Imię albo relację, którą poprawisz, ${firstName} zostawi tak, jak zapiszesz.`,
    edit: "Edytuj",
    fields: {
      name: "Imię",
      relation: "Kim jest dla Ciebie",
      note: "Twoja własna uwaga",
      hint: (max) => `Do ${max} znaków.`,
    },
    save: "Zapisz",
    saving: "Zapisywanie…",
    saved: "Zapisano.",
    cancel: "Anuluj",
    close: "Zamknij",
    factEdit: "Popraw",
    factDelete: "Usuń wpis",
    factSave: "Zapisz wpis",
    confirmFactDeleteTitle: "Usunąć ten wpis?",
    confirmFactDeleteBody: "Wpis zniknie z karty. Zapis rozmowy zostaje bez zmian.",
    confirmFactDelete: "Usuń",
    forget: "Zapomnij o tej osobie",
    confirmForgetTitle: "Zapomnieć o tej osobie na stałe?",
    confirmForgetBody: (firstName, name) =>
      `${firstName} nie będzie już pamiętać, kim jest ${name}: karta zniknie, a pamięć wcześniejszych rozmów zostanie odbudowana bez tej osoby. Zapisy rozmów i ich podsumowania zostają.`,
    confirmForget: "Zapomnij",
    forgetting: "Zapominanie…",
    forgotten: (name) => `Usunięto kartę: ${name}.`,
    talkAbout: "Porozmawiaj o tej osobie",
    talkAboutResume: "Wróć do rozmowy i porozmawiaj o tej osobie",
    talkAboutDraft: (name, relation) =>
      relation
        ? `Dziś chcę porozmawiać o tej osobie: ${name} (${relation}).`
        : `Dziś chcę porozmawiać o tej osobie: ${name}.`,
    errors: {
      missing_auth: "Zaloguj się, żeby zobaczyć karty osób.",
      account_blocked: "Konto jest zablokowane.",
      account_access_unavailable: "Nie udało się zweryfikować dostępu do konta. Spróbuj ponownie.",
      session_data_unavailable: "Karty osób są chwilowo niedostępne.",
      people_memory_unavailable: "Zapamiętywanie osób jest obecnie niedostępne.",
      validation_failed: "Sprawdź tekst: imię jest wymagane, a każde pole ma limit długości.",
      person_not_found: "Nie znaleziono tej karty albo została już usunięta.",
      fact_not_found: "Nie znaleziono tego wpisu albo został już usunięty.",
      read_failed: "Nie udało się odczytać kart. Spróbuj ponownie za chwilę.",
      update_failed: "Nie udało się zapisać karty. Spróbuj ponownie za chwilę.",
      forget_failed: "Nie udało się zapomnieć o tej osobie. Spróbuj ponownie za chwilę.",
      delete_failed: "Nie udało się usunąć wpisu. Spróbuj ponownie za chwilę.",
    },
  },
);

export function getPeopleCardsCopy(locale: Locale): PeopleCardsCopy {
  return PEOPLE_CARDS_COPY[locale];
}
