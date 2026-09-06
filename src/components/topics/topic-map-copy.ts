import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";
import { plural } from "@/lib/i18n/plural";
import type { TopicFailureCode } from "@/lib/session-flow/topic-map-contract";
import type {
  DifficultyEffect,
  DifficultyEntryKind,
  DifficultyPersonState,
} from "@/lib/session-summary/topic-map-budget";

/**
 * Teksty sekcji „Mapa tematów”. Język „co padło w rozmowie”, nigdy
 * „zalecenie” ani „plan”: propozycja jest propozycją, postanowienie
 * postanowieniem, rezultat tym, co użytkownik sam powiedział.
 */
interface TopicMapCopy {
  title: string;
  intro: (firstName: string) => string;
  empty: (firstName: string) => string;
  disabled: string;
  disabledWithCards: string;
  settingsLink: string;
  readFailed: string;
  openCardSr: (label: string) => string;
  mentions: (count: number) => string;
  mentionsTitle: string;
  lastMentioned: (day: string) => string;
  archivedBadge: string;
  newSinceArchived: string;
  effects: Readonly<Record<DifficultyEffect, string>>;
  effectTitle: string;
  personsLine: (names: string) => string;
  personsTitle: string;
  personStates: Readonly<Record<DifficultyPersonState, string>>;
  pendingTitle: string;
  pendingQuestion: (label: string, name: string) => string;
  confirmLink: string;
  rejectLink: string;
  unlink: string;
  confirmUnlinkTitle: string;
  confirmUnlinkBody: string;
  confirmUnlink: string;
  relink: string;
  dialogAria: string;
  ownAccountNote: string;
  firstMentioned: (day: string) => string;
  aliasesLabel: string;
  currentStateTitle: string;
  kinds: Readonly<Record<DifficultyEntryKind, string>>;
  updatesTitle: string;
  timelineTitle: string;
  inReplyTo: string;
  withPerson: (name: string) => string;
  noEntries: string;
  provenance: (count: number) => string;
  provenanceUnknown: string;
  editedByYou: string;
  lockedNote: (firstName: string) => string;
  edit: string;
  fields: {
    label: string;
    note: string;
    archived: string;
    hint: (max: number) => string;
  };
  save: string;
  saving: string;
  saved: string;
  cancel: string;
  close: string;
  entryEdit: string;
  entryDelete: string;
  entrySave: string;
  confirmEntryDeleteTitle: string;
  confirmEntryDeleteBody: string;
  confirmEntryDelete: string;
  delete: string;
  confirmDeleteTitle: string;
  confirmDeleteBody: (firstName: string) => string;
  confirmDelete: string;
  deleting: string;
  deleted: (label: string) => string;
  archiveNudgeTitle: string;
  archiveNudgeBody: string;
  archiveNudgeAction: string;
  mergeSummary: string;
  mergeBody: string;
  mergeSelectLabel: string;
  mergeAction: (label: string) => string;
  merging: string;
  merged: (source: string, target: string) => string;
  duplicateOffer: (label: string) => string;
  viewLegend: string;
  viewMap: string;
  viewList: string;
  graphAria: string;
  youNode: string;
  nodeCounts: (entries: number, persons: number) => string;
  legendTitle: string;
  legendConfirmed: string;
  legendSuggested: string;
  legendArchived: string;
  unlinkedPeople: (count: number) => string;
  peopleLink: string;
  personNodeSr: (name: string) => string;
  personFocus: (name: string, labels: string) => string;
  showAll: string;
  talkAbout: string;
  talkAboutResume: string;
  talkAboutDraft: (label: string) => string;
  errors: Readonly<Record<TopicFailureCode, string>>;
}

const TOPIC_MAP_COPY = defineCopy<TopicMapCopy>(
  {
    title: "Topic map",
    intro: (firstName) =>
      `${firstName} notes the difficulties you say you struggle with, the people they come up with, and the ways of coping that came up. Everything comes from your own words; you can correct, merge or remove anything.`,
    empty: (firstName) =>
      `Once you talk about something you struggle with, ${firstName} will note it here, together with what came up about it.`,
    disabled: "The topic map is switched off.",
    disabledWithCards: "The topic map is switched off. The difficulties below stay until you delete them.",
    settingsLink: "Settings",
    readFailed: "We couldn't read the topic map. Refresh the dashboard in a moment.",
    openCardSr: (label) => `Open the difficulty: ${label}.`,
    mentions: (count) => plural("en", count, { one: "1 conversation", many: `${count} conversations` }),
    mentionsTitle: "How many earlier conversations touched on this difficulty",
    lastMentioned: (day) => `last on ${day}`,
    archivedBadge: "less current",
    newSinceArchived: "new entries since you marked it",
    effects: {
      better: "better",
      same: "the same",
      worse: "worse",
      resolved: "resolved",
      mixed: "mixed",
    },
    effectTitle: "How you said it is going",
    personsLine: (names) => `with ${names}`,
    personsTitle: "Comes up with",
    personStates: {
      suggested: "to confirm",
      confirmed: "confirmed",
      rejected: "not related",
    },
    pendingTitle: "To confirm",
    pendingQuestion: (label, name) => `Does “${label}” come up with ${name}?`,
    confirmLink: "Yes, it does",
    rejectLink: "No",
    unlink: "Unlink",
    confirmUnlinkTitle: "Unlink this person?",
    confirmUnlinkBody: "Entries noted with this person disappear from the card; the person's own card stays.",
    confirmUnlink: "Unlink",
    relink: "Link again",
    dialogAria: "Difficulty card",
    ownAccountNote:
      "Everything on this card comes from your own words in conversations. A proposal is noted as a proposal, never as advice to follow.",
    firstMentioned: (day) => `First mentioned on ${day}`,
    aliasesLabel: "Also called",
    currentStateTitle: "How it is now",
    kinds: {
      how: "How it shows up",
      coping: "How you cope on your own",
      update: "How it is now",
      suggested: "Proposal from a conversation",
      agreed: "Something you decided to try",
      outcome: "How it went",
    },
    updatesTitle: "How it has been going",
    timelineTitle: "Proposals, decisions and how they went",
    inReplyTo: "about:",
    withPerson: (name) => `with ${name}`,
    noEntries: "No entries yet.",
    provenance: (count) => plural("en", count, { one: "from the conversation on", many: "from the conversations on" }),
    provenanceUnknown: "from an earlier conversation",
    editedByYou: "corrected by you",
    lockedNote: (firstName) =>
      `A name you change stays as you wrote it; ${firstName} won't rename it, and the old wording is kept as another name for the same difficulty.`,
    edit: "Edit",
    fields: {
      label: "Name",
      note: "Your own note",
      archived: "Less current: keep it on the map, lower down",
      hint: (max) => `Up to ${max} characters.`,
    },
    save: "Save",
    saving: "Saving…",
    saved: "Saved.",
    cancel: "Cancel",
    close: "Close",
    entryEdit: "Correct",
    entryDelete: "Remove entry",
    entrySave: "Save entry",
    confirmEntryDeleteTitle: "Remove this entry?",
    confirmEntryDeleteBody: "The entry disappears from the card. The conversation transcript stays unchanged.",
    confirmEntryDelete: "Remove",
    delete: "Remove this difficulty",
    confirmDeleteTitle: "Remove this difficulty for good?",
    confirmDeleteBody: (firstName) =>
      `The card disappears with all its entries and links to people. People cards, conversation transcripts and the memory of earlier conversations stay. ${firstName} may note it again from new conversations.`,
    confirmDelete: "Remove",
    deleting: "Removing…",
    deleted: (label) => `The difficulty has been removed: ${label}.`,
    archiveNudgeTitle: "Mark as less current?",
    archiveNudgeBody: "You said this no longer troubles you. A less current difficulty stays on the map, lower down.",
    archiveNudgeAction: "Mark as less current",
    mergeSummary: "Merge with another difficulty",
    mergeBody:
      "Entries, people and other names move into the difficulty you choose; this card disappears. Nothing is lost.",
    mergeSelectLabel: "Merge into",
    mergeAction: (label) => `Merge into “${label}”`,
    merging: "Merging…",
    merged: (source, target) => `“${source}” has been merged into “${target}”.`,
    duplicateOffer: (label) => `This name already belongs to “${label}”. Merge the two difficulties?`,
    viewLegend: "View",
    viewMap: "Map",
    viewList: "List",
    graphAria: "Topic map: you in the middle, your difficulties around you, linked people on the edge.",
    youNode: "You",
    nodeCounts: (entries, persons) =>
      `${plural("en", entries, { one: "1 entry", many: `${entries} entries` })} · ${plural("en", persons, { one: "1 person", many: `${persons} people` })}`,
    legendTitle: "How to read the map",
    legendConfirmed: "solid line: confirmed link",
    legendSuggested: "dashed line: link to confirm",
    legendArchived: "faded: less current",
    unlinkedPeople: (count) =>
      plural("en", count, {
        one: "1 person from your conversations has no topics yet.",
        many: `${count} people from your conversations have no topics yet.`,
      }),
    peopleLink: "People cards",
    personNodeSr: (name) => `Highlight the topics that come up with ${name}`,
    personFocus: (name, labels) => `${name}: ${labels}`,
    showAll: "Show all",
    talkAbout: "Talk about this",
    talkAboutResume: "Back to the conversation, about this",
    talkAboutDraft: (label) => `I'd like to talk about this today: ${label}.`,
    errors: {
      missing_auth: "Sign in to see the topic map.",
      account_blocked: "The account is blocked.",
      account_access_unavailable: "We couldn't verify access to the account. Please try again.",
      session_data_unavailable: "The topic map is temporarily unavailable.",
      topic_map_unavailable: "The topic map is currently unavailable.",
      validation_failed: "Check the text: a name is required and each field has a length limit.",
      difficulty_not_found: "This difficulty wasn't found or has already been removed.",
      entry_not_found: "This entry wasn't found or has already been removed.",
      person_not_found: "This person wasn't found or has already been forgotten.",
      duplicate_difficulty_label: "Another difficulty already carries this name.",
      read_failed: "The topic map couldn't be read. Please try again in a moment.",
      update_failed: "The change couldn't be saved. Please try again in a moment.",
      merge_failed: "The difficulties couldn't be merged. Please try again in a moment.",
      delete_failed: "It couldn't be removed. Please try again in a moment.",
    },
  },
  {
    title: "Mapa tematów",
    intro: (firstName) =>
      `${firstName} zapisuje trudności, o których mówisz, że się z nimi mierzysz, osoby, przy których się pojawiają, i sposoby radzenia sobie, które padły w rozmowach. Wszystko pochodzi z Twoich słów; każdą rzecz możesz poprawić, scalić albo usunąć.`,
    empty: (firstName) =>
      `Gdy opowiesz o czymś, z czym się mierzysz, ${firstName} zapisze to tutaj razem z tym, co na ten temat padło.`,
    disabled: "Mapa tematów jest wyłączona.",
    disabledWithCards: "Mapa tematów jest wyłączona. Poniższe trudności zostają, dopóki ich nie usuniesz.",
    settingsLink: "Ustawienia",
    readFailed: "Nie udało się odczytać mapy tematów. Odśwież panel za chwilę.",
    openCardSr: (label) => `Otwórz trudność: ${label}.`,
    mentions: (count) => plural("pl", count, { one: "1 rozmowa", few: `${count} rozmowy`, many: `${count} rozmów` }),
    mentionsTitle: "W ilu wcześniejszych rozmowach pojawiła się ta trudność",
    lastMentioned: (day) => `ostatnio ${day}`,
    archivedBadge: "mniej aktualne",
    newSinceArchived: "nowe wpisy od oznaczenia",
    effects: {
      better: "lepiej",
      same: "tak samo",
      worse: "gorzej",
      resolved: "rozwiązane",
      mixed: "różnie",
    },
    effectTitle: "Jak według Ciebie to idzie",
    personsLine: (names) => `przy: ${names}`,
    personsTitle: "Pojawia się przy",
    personStates: {
      suggested: "do potwierdzenia",
      confirmed: "potwierdzone",
      rejected: "nie dotyczy",
    },
    pendingTitle: "Do potwierdzenia",
    pendingQuestion: (label, name) => `Czy „${label}” pojawia się przy tej osobie: ${name}?`,
    confirmLink: "Tak, dotyczy",
    rejectLink: "Nie",
    unlink: "Odłącz",
    confirmUnlinkTitle: "Odłączyć tę osobę?",
    confirmUnlinkBody: "Wpisy zapisane przy tej osobie znikną z karty; karta osoby zostaje.",
    confirmUnlink: "Odłącz",
    relink: "Połącz ponownie",
    dialogAria: "Karta trudności",
    ownAccountNote:
      "Wszystko na tej karcie pochodzi z Twoich słów w rozmowach. Propozycja jest zapisana jako propozycja, nigdy jako zalecenie.",
    firstMentioned: (day) => `Pierwsza wzmianka: ${day}`,
    aliasesLabel: "Inne nazwy",
    currentStateTitle: "Jak jest teraz",
    kinds: {
      how: "Jak to wygląda",
      coping: "Jak sobie radzisz na własną rękę",
      update: "Jak jest teraz",
      suggested: "Propozycja z rozmowy",
      agreed: "Postanowienie",
      outcome: "Jak poszło",
    },
    updatesTitle: "Jak to szło w czasie",
    timelineTitle: "Propozycje, postanowienia i jak poszło",
    inReplyTo: "dotyczy:",
    withPerson: (name) => `przy: ${name}`,
    noEntries: "Brak wpisów.",
    provenance: (count) => plural("pl", count, { one: "z rozmowy z dnia", many: "z rozmów z dni" }),
    provenanceUnknown: "z wcześniejszej rozmowy",
    editedByYou: "poprawione przez Ciebie",
    lockedNote: (firstName) =>
      `Nazwę, którą zmienisz, ${firstName} zostawi tak, jak zapiszesz, a dawne sformułowanie zostanie jako inna nazwa tej samej trudności.`,
    edit: "Edytuj",
    fields: {
      label: "Nazwa",
      note: "Twoja własna uwaga",
      archived: "Mniej aktualne: zostaje na mapie, niżej",
      hint: (max) => `Do ${max} znaków.`,
    },
    save: "Zapisz",
    saving: "Zapisywanie…",
    saved: "Zapisano.",
    cancel: "Anuluj",
    close: "Zamknij",
    entryEdit: "Popraw",
    entryDelete: "Usuń wpis",
    entrySave: "Zapisz wpis",
    confirmEntryDeleteTitle: "Usunąć ten wpis?",
    confirmEntryDeleteBody: "Wpis zniknie z karty. Zapis rozmowy zostaje bez zmian.",
    confirmEntryDelete: "Usuń",
    delete: "Usuń tę trudność",
    confirmDeleteTitle: "Usunąć tę trudność na stałe?",
    confirmDeleteBody: (firstName) =>
      `Karta zniknie razem ze wszystkimi wpisami i powiązaniami z osobami. Karty osób, zapisy rozmów i pamięć wcześniejszych rozmów zostają. ${firstName} może zapisać ją ponownie z nowych rozmów.`,
    confirmDelete: "Usuń",
    deleting: "Usuwanie…",
    deleted: (label) => `Usunięto trudność: ${label}.`,
    archiveNudgeTitle: "Oznaczyć jako mniej aktualne?",
    archiveNudgeBody: "Powiedziałeś, że to już Ci nie doskwiera. Mniej aktualna trudność zostaje na mapie, niżej.",
    archiveNudgeAction: "Oznacz jako mniej aktualne",
    mergeSummary: "Scal z inną trudnością",
    mergeBody: "Wpisy, osoby i inne nazwy przejdą do wybranej trudności, a ta karta zniknie. Nic nie ginie.",
    mergeSelectLabel: "Scal z",
    mergeAction: (label) => `Scal z „${label}”`,
    merging: "Scalanie…",
    merged: (source, target) => `Scalono „${source}” z „${target}”.`,
    duplicateOffer: (label) => `Ta nazwa należy już do trudności „${label}”. Scalić obie?`,
    viewLegend: "Widok",
    viewMap: "Mapa",
    viewList: "Lista",
    graphAria: "Mapa tematów: Ty w środku, Twoje trudności wokół, powiązane osoby na obwodzie.",
    youNode: "Ty",
    nodeCounts: (entries, persons) =>
      `${plural("pl", entries, { one: "1 wpis", few: `${entries} wpisy`, many: `${entries} wpisów` })} · ${plural("pl", persons, { one: "1 osoba", few: `${persons} osoby`, many: `${persons} osób` })}`,
    legendTitle: "Jak czytać mapę",
    legendConfirmed: "linia ciągła: potwierdzone powiązanie",
    legendSuggested: "linia kreskowana: powiązanie do potwierdzenia",
    legendArchived: "wyblakłe: mniej aktualne",
    unlinkedPeople: (count) =>
      plural("pl", count, {
        one: "1 osoba z Twoich rozmów nie ma jeszcze tematów.",
        few: `${count} osoby z Twoich rozmów nie mają jeszcze tematów.`,
        many: `${count} osób z Twoich rozmów nie ma jeszcze tematów.`,
      }),
    peopleLink: "Karty osób",
    personNodeSr: (name) => `Wyróżnij tematy przy tej osobie: ${name}`,
    personFocus: (name, labels) => `${name}: ${labels}`,
    showAll: "Pokaż wszystko",
    talkAbout: "Porozmawiaj o tym",
    talkAboutResume: "Wróć do rozmowy i porozmawiaj o tym",
    talkAboutDraft: (label) => `Dziś chcę porozmawiać o tym: ${label}.`,
    errors: {
      missing_auth: "Zaloguj się, żeby zobaczyć mapę tematów.",
      account_blocked: "Konto jest zablokowane.",
      account_access_unavailable: "Nie udało się zweryfikować dostępu do konta. Spróbuj ponownie.",
      session_data_unavailable: "Mapa tematów jest chwilowo niedostępna.",
      topic_map_unavailable: "Mapa tematów jest obecnie niedostępna.",
      validation_failed: "Sprawdź tekst: nazwa jest wymagana, a każde pole ma limit długości.",
      difficulty_not_found: "Nie znaleziono tej trudności albo została już usunięta.",
      entry_not_found: "Nie znaleziono tego wpisu albo został już usunięty.",
      person_not_found: "Nie znaleziono tej osoby albo została już zapomniana.",
      duplicate_difficulty_label: "Inna trudność ma już tę nazwę.",
      read_failed: "Nie udało się odczytać mapy tematów. Spróbuj ponownie za chwilę.",
      update_failed: "Nie udało się zapisać zmiany. Spróbuj ponownie za chwilę.",
      merge_failed: "Nie udało się scalić trudności. Spróbuj ponownie za chwilę.",
      delete_failed: "Nie udało się usunąć. Spróbuj ponownie za chwilę.",
    },
  },
);

export function getTopicMapCopy(locale: Locale): TopicMapCopy {
  return TOPIC_MAP_COPY[locale];
}
