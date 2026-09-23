import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";
import type { DifficultyCard, PersonCard } from "@/lib/session-data/types";
import { buildTalkAboutHref } from "@/components/people/PersonCardDialog";
import {
  buildDifficultySections,
  buildTalkAboutTopicHref,
  findDifficultyByLabel,
} from "@/components/topics/DifficultyDialog";
import { listPendingLinks } from "@/components/topics/PendingLinks";
import TopicGraph from "@/components/topics/TopicGraph";
import { getTopicMapCopy } from "@/components/topics/topic-map-copy";
import MemoryView, { listUnlinkedPeople } from "../MemoryView";

vi.mock("@/components/hooks/useLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/hooks/useLocale")>()),
  useLocale: () => "pl",
}));

const hookState = vi.hoisted(() => ({
  pendingForgetId: null as string | null,
  pendingDeleteFactId: null as string | null,
  pendingDeleteId: null as string | null,
  pendingDeleteEntryId: null as string | null,
}));

vi.mock("@/components/hooks/usePersonMutations", () => ({
  usePersonMutations: () => ({
    savingPersonId: null,
    savingFactId: null,
    pendingForgetId: hookState.pendingForgetId,
    forgettingId: null,
    pendingDeleteFactId: hookState.pendingDeleteFactId,
    updatePerson: vi.fn(() => Promise.resolve(true)),
    updateFact: vi.fn(() => Promise.resolve(true)),
    requestDeleteFact: vi.fn(),
    cancelDeleteFact: vi.fn(),
    confirmDeleteFact: vi.fn(() => Promise.resolve()),
    requestForget: vi.fn(),
    cancelForget: vi.fn(),
    confirmForget: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock("@/components/hooks/useDifficultyMutations", () => ({
  useDifficultyMutations: () => ({
    savingDifficultyId: null,
    savingEntryId: null,
    pendingDeleteId: hookState.pendingDeleteId,
    deletingId: null,
    pendingDeleteEntryId: hookState.pendingDeleteEntryId,
    decidingPersonId: null,
    mergingId: null,
    updateDifficulty: vi.fn(() => Promise.resolve(null)),
    updateEntry: vi.fn(() => Promise.resolve(true)),
    requestDeleteEntry: vi.fn(),
    cancelDeleteEntry: vi.fn(),
    confirmDeleteEntry: vi.fn(() => Promise.resolve()),
    requestDelete: vi.fn(),
    cancelDelete: vi.fn(),
    confirmDelete: vi.fn(() => Promise.resolve()),
    decidePerson: vi.fn(() => Promise.resolve(true)),
    merge: vi.fn(() => Promise.resolve(true)),
  }),
}));

vi.mock("@/components/hooks/usePeopleMemoryPreparation", () => ({
  usePeopleMemoryPreparation: vi.fn(),
}));

const avatar = toSelectedModalityAvatar(MVP_MODALITIES.find((m) => m.modalityId === "cbt") ?? MVP_MODALITIES[1]);
const SESSION_A = "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a";
const SESSION_B = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const PERSON_MARTA = "7a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";
const PERSON_OLA = "8b2c3d4e-5f6a-4b7c-9d0e-1f2a3b4c5d6e";
const PERSON_KUBA = "9c3d4e5f-6a7b-4c8d-0e1f-2a3b4c5d6e7f";

const sourceA = { sessionId: SESSION_A, conversationAt: "2026-09-01T09:00:00.000Z" };
const sourceB = { sessionId: SESSION_B, conversationAt: "2026-09-05T09:00:00.000Z" };

const marta: PersonCard = {
  id: PERSON_MARTA,
  avatarId: "cbt-guide",
  name: "Marta",
  nameLocked: false,
  relation: "koleżanka z pracy",
  relationLocked: true,
  userNote: "Moja własna uwaga.",
  createdAt: "2026-09-01T10:00:00.000Z",
  firstMentionedAt: "2026-09-01T10:00:00.000Z",
  lastMentionedAt: "2026-09-05T10:00:00.000Z",
  mentionCount: 2,
  facts: [
    {
      id: "fact-who",
      kind: "who",
      text: "Koleżanka z tego samego zespołu.",
      userEdited: false,
      createdAt: "2026-09-01T10:00:00.000Z",
      sources: [sourceA],
    },
    {
      id: "fact-account",
      kind: "account",
      text: "Skomentowała pomysł przy całym zespole.",
      userEdited: true,
      createdAt: "2026-09-05T10:00:00.000Z",
      sources: [sourceA, sourceB],
    },
    // Rezultat wpisany przed próbą: oś czasu ma sortować po dacie rozmowy.
    {
      id: "fact-outcome",
      kind: "outcome",
      text: "Rozmowa się odbyła, było spokojnie.",
      userEdited: false,
      createdAt: "2026-09-05T10:00:00.000Z",
      sources: [sourceB],
    },
    {
      id: "fact-attempt",
      kind: "attempt",
      text: "Porozmawiać z nią w cztery oczy.",
      userEdited: false,
      createdAt: "2026-09-05T10:00:01.000Z",
      sources: [sourceA],
    },
  ],
};

const ola: PersonCard = {
  ...marta,
  id: PERSON_OLA,
  name: "Ola",
  relation: null,
  userNote: "",
  mentionCount: 1,
  lastMentionedAt: null,
  facts: [],
};

const kuba: PersonCard = { ...ola, id: PERSON_KUBA, name: "Kuba", relation: "brat" };

const odmawianie: DifficultyCard = {
  id: "difficulty-odmawianie",
  avatarId: "cbt-guide",
  label: "Odmawianie",
  labelLocked: false,
  userNote: "Moja własna uwaga.",
  archivedAt: null,
  createdAt: "2026-09-01T10:00:00.000Z",
  aliases: [{ id: "alias-1", alias: "nie umiem powiedzieć nie" }],
  persons: [
    { personId: PERSON_MARTA, name: "Marta", relation: "koleżanka z pracy", state: "confirmed", userDecided: false },
    { personId: PERSON_OLA, name: "Ola", relation: null, state: "suggested", userDecided: false },
  ],
  firstMentionedAt: "2026-09-01T10:00:00.000Z",
  lastMentionedAt: "2026-09-05T10:00:00.000Z",
  mentionCount: 2,
  currentState: {
    id: "entry-update-2",
    text: "Trochę lżej.",
    effect: "better",
    conversationAt: sourceB.conversationAt,
  },
  hasNewEntriesSinceArchived: false,
  entries: [
    {
      id: "entry-how",
      kind: "how",
      text: "Zgadzam się na wszystko w pracy.",
      effect: null,
      personId: PERSON_MARTA,
      parentEntryId: null,
      userEdited: false,
      createdAt: "2026-09-01T10:00:00.000Z",
      sources: [sourceA],
    },
    {
      id: "entry-coping",
      kind: "coping",
      text: "Odkładam odpowiedź na później.",
      effect: null,
      personId: null,
      parentEntryId: null,
      userEdited: true,
      createdAt: "2026-09-01T10:00:01.000Z",
      sources: [sourceA, sourceB],
    },
    {
      id: "entry-outcome",
      kind: "outcome",
      text: "Powiedziałem nie i było w porządku.",
      effect: "better",
      personId: null,
      parentEntryId: "entry-suggested",
      userEdited: false,
      createdAt: "2026-09-05T10:00:00.000Z",
      sources: [sourceB],
    },
    {
      id: "entry-suggested",
      kind: "suggested",
      text: "Poprosić o dzień do namysłu, zanim się zgodzę.",
      effect: null,
      personId: null,
      parentEntryId: null,
      userEdited: false,
      createdAt: "2026-09-05T10:00:01.000Z",
      sources: [sourceA],
    },
    {
      id: "entry-update-2",
      kind: "update",
      text: "Trochę lżej.",
      effect: "better",
      personId: null,
      parentEntryId: null,
      userEdited: false,
      createdAt: "2026-09-05T10:00:02.000Z",
      sources: [sourceB],
    },
    {
      id: "entry-update-1",
      kind: "update",
      text: "Bez zmian.",
      effect: "same",
      personId: null,
      parentEntryId: null,
      userEdited: false,
      createdAt: "2026-09-05T10:00:03.000Z",
      sources: [sourceA],
    },
  ],
};

const spanie: DifficultyCard = {
  ...odmawianie,
  id: "difficulty-spanie",
  label: "Zasypianie",
  userNote: "",
  aliases: [],
  persons: [],
  mentionCount: 1,
  lastMentionedAt: null,
  currentState: { id: "entry-x", text: "Już nie problem.", effect: "resolved", conversationAt: null },
  entries: [],
};

const archived: DifficultyCard = {
  ...spanie,
  id: "difficulty-archived",
  label: "Poranki",
  archivedAt: "2026-09-03T10:00:00.000Z",
  hasNewEntriesSinceArchived: true,
  currentState: null,
};

const PEOPLE = [marta, ola, kuba];
const TOPICS = [odmawianie, spanie, archived];

function render(props: Partial<Parameters<typeof MemoryView>[0]> = {}) {
  return renderToStaticMarkup(
    <MemoryView
      locale="pl"
      avatar={avatar}
      peopleMemoryMode
      topicMapMode
      initialPersonCards={PEOPLE}
      initialDifficultyCards={TOPICS}
      peopleMemoryEnabled
      topicMapEnabled
      memoryPreview="Rozmawialiśmy o pracy i o tym, jak trudno odmawiać."
      initialView="list"
      {...props}
    />,
  );
}

beforeEach(() => {
  hookState.pendingForgetId = null;
  hookState.pendingDeleteFactId = null;
  hookState.pendingDeleteId = null;
  hookState.pendingDeleteEntryId = null;
});

describe("MemoryView list", () => {
  it("lists people and topics as two groups of row buttons, never an entry's text", () => {
    const html = render();
    expect(html).toContain("Osoby · 3");
    expect(html).toContain("Tematy · 3");
    expect(html.indexOf('data-memory-group="people"')).toBeLessThan(html.indexOf('data-memory-group="topics"'));
    expect(html).toContain(`id="people-card-open-${PERSON_MARTA}"`);
    expect(html).toContain("koleżanka z pracy");
    expect(html).toContain("relacja niezapisana");
    expect(html).toContain('title="W ilu wcześniejszych rozmowach pojawiła się ta osoba"');
    expect(html).toContain("Otwórz kartę: Marta.");
    expect(html).toContain('id="topic-card-open-difficulty-odmawianie"');
    expect(html).toContain("przy: Marta, Ola");
    expect(html).toContain('title="W ilu wcześniejszych rozmowach pojawił się ten temat"');
    expect(html).toContain("Otwórz temat: Odmawianie.");
    expect(html).toContain(">lepiej<");
    expect(html).toContain(">rozwiązane<");
    expect(html).toContain("mniej aktualne");
    expect(html).toContain("nowe wpisy od oznaczenia");
    expect(html).toContain("ostatnio 5 wrz 2026");
    // Sekcja nie tłumaczy się wstępem: nagłówek i wstęp należą do strony.
    expect(html).not.toContain("Osoby z Twoich rozmów");
    expect(html).not.toContain("Mapa tematów</h2>");
    expect(html).not.toContain("Skomentowała pomysł");
    expect(html).not.toContain("Zgadzam się na wszystko");
    expect(html).not.toContain("<dialog");
  });

  it("asks to confirm only the uncertain person links, before the view switch and the list", () => {
    const html = render();
    expect(html).toContain("Do potwierdzenia");
    expect(html).toContain("Czy „Odmawianie” pojawia się przy tej osobie: Ola?");
    expect(html).not.toContain("pojawia się przy tej osobie: Marta");
    expect(html.indexOf("Do potwierdzenia")).toBeLessThan(html.indexOf(">Mapa</button>"));
    expect(listPendingLinks([odmawianie, spanie])).toEqual([{ card: odmawianie, person: odmawianie.persons[1] }]);
    expect(render({ topicMapEnabled: false })).not.toContain("Do potwierdzenia");
  });

  it("carries the summary the avatar reads before a conversation, collapsed, at the end", () => {
    const html = render();
    expect(html).toContain("<details");
    expect(html).toContain("Podsumowanie, które Marek czyta przed rozmową");
    expect(html).toContain("Rozmawialiśmy o pracy i o tym, jak trudno odmawiać.");
    expect(html.indexOf('data-memory-group="topics"')).toBeLessThan(html.indexOf("data-memory-summary"));
    expect(render({ memoryPreview: null })).toContain("Powstanie po pierwszej zakończonej rozmowie.");
  });

  it("explains the empty, disabled and failed states with the avatar's first name and one settings link", () => {
    expect(render({ initialPersonCards: [], initialDifficultyCards: [] })).toContain(
      "Gdy wspomnisz o kimś albo opowiesz o czymś, z czym się mierzysz, Marek zapisze to tutaj.",
    );
    const disabled = render({ peopleMemoryEnabled: false, topicMapEnabled: false });
    expect(disabled).toContain("Zapamiętywanie osób jest wyłączone. Poniższe karty zostają");
    expect(disabled).toContain("Zapisywanie tematów z rozmów jest wyłączone. Poniższe tematy zostają");
    expect(disabled.match(/href="\/account\/security#memory"/g)).toHaveLength(2);
    expect(render({ initialPersonCards: null })).toContain("Nie udało się odczytać kart osób.");
    expect(render({ initialDifficultyCards: null })).toContain("Nie udało się odczytać tematów.");
    // Wyłączona flaga chowa część w całości, także jej karty i jej notę.
    const peopleOff = render({ peopleMemoryMode: false, peopleMemoryEnabled: false });
    expect(peopleOff).not.toContain("Osoby · ");
    expect(peopleOff).not.toContain("Zapamiętywanie osób");
    expect(peopleOff).toContain("Tematy · 3");
    const topicsOff = render({ topicMapMode: false, initialDifficultyCards: null });
    expect(topicsOff).toContain("Osoby · 3");
    expect(topicsOff).not.toContain("Tematy · ");
    expect(topicsOff).not.toContain("Nie udało się odczytać tematów.");
    // Same osoby też mają mapę: „Ty” w środku, osoby na obwodzie.
    expect(topicsOff).toContain(">Mapa</button>");
  });

  it("offers the map/list switch only with cards", () => {
    expect(render()).toContain("Widok");
    expect(render()).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Lista<\/button>/);
    expect(render({ initialPersonCards: [], initialDifficultyCards: [] })).not.toContain(">Mapa</button>");
  });

  it("renders the remembered view on the server, so hydration never flips it", () => {
    const list = render({ initialView: "list" });
    expect(list).toContain('data-topic-view="list"');
    expect(list).not.toContain('data-topic-view="graph"');
    expect(list).not.toContain("md:hidden");

    const graph = render({ initialView: "graph" });
    expect(graph).toContain('data-topic-view="graph"');
    expect(graph).not.toContain('data-topic-view="list"');
    expect(graph).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Mapa<\/button>/);
  });

  it("lets the width decide through CSS until someone chooses, without a flip after hydration", () => {
    // Bez ciasteczka serwer nie zna szerokości ekranu: stoją oba widoki i oba
    // przełączniki, a `md:` (48rem) pokazuje mapę na szerokim ekranie i listę poniżej.
    const html = render({ initialView: null });
    expect(html).toMatch(/<div class="hidden md:block" data-topic-view="graph">/);
    expect(html).toMatch(/<div class="flex flex-col gap-5 md:hidden" data-topic-view="list">/);
    expect(html).toMatch(/<fieldset class="[^"]*md:hidden"[\s\S]*?aria-pressed="true"[^>]*>Lista<\/button>/);
    expect(html).toMatch(/<fieldset class="[^"]*hidden md:block"[\s\S]*?aria-pressed="true"[^>]*>Mapa<\/button>/);
  });

  it("keeps every id unique while both views stand before hydration or without JS", () => {
    const html = render({ initialView: null });
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    // Cel powrotu fokusu stoi raz — na przycisku listy.
    expect(ids.filter((id) => id === "topic-card-open-difficulty-odmawianie")).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*id="topic-card-open-difficulty-odmawianie"/);
  });
});

describe("MemoryView map", () => {
  it("renders you in the middle, topics and every person as nodes, edges by state and a legend", () => {
    const html = render({ initialView: "graph" });
    expect(html).toContain(
      'role="group" aria-label="Mapa tematów: Ty w środku, Twoje tematy wokół, osoby na obwodzie."',
    );
    expect(html).toContain(">Ty</text>");
    expect(html).not.toContain("<ol");
    // Przed hydratacją węzeł nie niesie id (nosi je lista); patrz test grafu po hydratacji niżej.
    expect(html).toMatch(/<g role="button"[^>]*aria-label="Otwórz temat: Odmawianie\."/);
    expect(html).toContain("6 wpisów · 2 osoby · lepiej");
    expect(html).toContain("0 wpisów · 0 osób · rozwiązane");
    expect(html).toContain('aria-label="Wyróżnij tematy przy tej osobie: Marta"');
    expect(html).toContain('aria-label="Wyróżnij tematy przy tej osobie: Ola"');
    // Osoba bez tematów też stoi na obwodzie — bez linii, bez osobnego zdania.
    expect(html).toContain('aria-label="Wyróżnij tematy przy tej osobie: Kuba"');
    expect(html).toMatch(/data-person-node="unlinked"[^>]*>[\s\S]*?Kuba/);
    expect(html.match(/data-person-node="linked"/g)).toHaveLength(2);
    expect(html).not.toContain("nie ma jeszcze tematów");
    expect(html.match(/stroke-dasharray="6 5"/g)).toHaveLength(1);
    expect(html.match(/class="stroke-brand"/g)).toHaveLength(1);
    expect(html).toContain('stroke-dasharray="5 4"');
    expect(html).toContain("Jak czytać mapę: linia ciągła: potwierdzone powiązanie");
    expect(html).toContain("bez linii: osoba jeszcze bez tematów");
    expect(html).toContain('tabindex="-1"');
    expect(html).not.toContain("Zgadzam się na wszystko");
  });

  it("lists people without topics for the map only from the people part", () => {
    expect(listUnlinkedPeople(PEOPLE, TOPICS).map((person) => person.id)).toEqual([PERSON_KUBA]);
    expect(listUnlinkedPeople(PEOPLE, [])).toHaveLength(3);
    const rejected = { ...spanie, persons: [{ ...odmawianie.persons[0], state: "rejected" as const }] };
    expect(listUnlinkedPeople([marta], [rejected]).map((person) => person.id)).toEqual([PERSON_MARTA]);
  });
});

describe("MemoryView person card", () => {
  it("opens a labelled native dialog with the user's own account, provenance links and a conversation as the main action", () => {
    const html = render({ initialSelectedPersonId: PERSON_MARTA });
    expect(html).toContain('<dialog aria-label="Karta osoby" tabindex="-1"');
    expect(html).toContain("Wszystko na tej karcie pochodzi z Twoich słów w rozmowach, nie z ocen awatara.");
    expect(html).toContain("Kim jest dla Ciebie");
    expect(html).toContain("Koleżanka z tego samego zespołu.");
    expect(html).toContain(`href="/dashboard?session=${SESSION_A}"`);
    expect(html).toContain("z rozmów z dni");
    expect(html).toContain("poprawione przez Ciebie");
    expect(html).toContain("Pierwsza wzmianka: 1 wrz 2026");
    expect(html).toContain("Zapomnij o tej osobie");
    expect(html).toContain(`href="/dashboard?start=now&amp;about=${PERSON_MARTA}"`);
    expect(html).toContain("Porozmawiaj o tej osobie");
    expect(html).toContain("Próby i ich rezultaty");
    expect(html.indexOf("Porozmawiać z nią w cztery oczy.")).toBeLessThan(
      html.indexOf("Rozmowa się odbyła, było spokojnie."),
    );
    expect(html).not.toContain("Zapomnieć o tej osobie na stałe?");
    expect(html).not.toContain('aria-label="Karta tematu"');
  });

  it("returns to an ongoing conversation of the same perspective and confirms forgetting inside the dialog", () => {
    const resume = render({ initialSelectedPersonId: PERSON_MARTA, resumeSessionId: SESSION_B });
    expect(resume).toContain(`href="/dashboard/session?sessionId=${SESSION_B}&amp;about=${PERSON_MARTA}"`);
    expect(buildTalkAboutHref("p", null)).toBe("/dashboard?start=now&about=p");
    hookState.pendingForgetId = PERSON_MARTA;
    const forgetting = render({ initialSelectedPersonId: PERSON_MARTA });
    expect(forgetting).toContain("Zapomnieć o tej osobie na stałe?");
    expect(forgetting).toContain("Marek nie będzie już pamiętać, kim jest Marta");
    expect(render({ initialSelectedPersonId: PERSON_OLA })).toContain("Brak wpisów.");
  });
});

describe("MemoryView topic card", () => {
  it("opens a labelled native dialog with the user's own words, people, current state and a conversation as the main action", () => {
    const html = render({ initialSelectedDifficultyId: "difficulty-odmawianie" });
    expect(html).toContain('<dialog aria-label="Karta tematu" tabindex="-1"');
    expect(html).toContain("Propozycja jest zapisana jako propozycja, nigdy jako zalecenie.");
    expect(html).toContain("Inne nazwy: nie umiem powiedzieć nie");
    expect(html).toContain("Jak jest teraz");
    expect(html).toContain("Trochę lżej.");
    expect(html).toContain("Pojawia się przy");
    expect(html).toContain("Tak, dotyczy");
    expect(html).toContain("Odłącz");
    expect(html).toContain("Jak sobie radzisz na własną rękę");
    expect(html).toContain(`href="/dashboard?session=${SESSION_B}"`);
    expect(html).toContain("Usuń ten temat");
    expect(html).toContain("Scal z innym tematem");
    expect(html).toContain(">Zasypianie</option>");
    expect(html).toContain('href="/dashboard?start=now&amp;topic=difficulty-odmawianie"');
    expect(html).toContain("Porozmawiaj o tym");
    expect(html).toContain("Propozycje, postanowienia i jak poszło");
    expect(html.indexOf("Poprosić o dzień do namysłu")).toBeLessThan(
      html.indexOf("Powiedziałem nie i było w porządku."),
    );
    expect(html).not.toContain("Usunąć ten temat na stałe?");
    expect(html).not.toContain('aria-label="Karta osoby"');
    const sections = buildDifficultySections(odmawianie.entries, getTopicMapCopy("pl"));
    expect(sections.map((section) => section.key)).toEqual(["how", "coping", "updates", "timeline"]);
  });

  it("nudges, confirms removal and finds a merge target the same way as before", () => {
    expect(render({ initialSelectedDifficultyId: "difficulty-spanie" })).toContain("Oznaczyć jako mniej aktualne?");
    expect(render({ initialSelectedDifficultyId: "difficulty-archived" })).not.toContain(
      "Oznaczyć jako mniej aktualne?",
    );
    const resume = render({ initialSelectedDifficultyId: "difficulty-odmawianie", resumeSessionId: SESSION_B });
    expect(resume).toContain(`href="/dashboard/session?sessionId=${SESSION_B}&amp;topic=difficulty-odmawianie"`);
    expect(buildTalkAboutTopicHref("d", null)).toBe("/dashboard?start=now&topic=d");
    hookState.pendingDeleteId = "difficulty-odmawianie";
    const deleting = render({ initialSelectedDifficultyId: "difficulty-odmawianie" });
    expect(deleting).toContain("Usunąć ten temat na stałe?");
    expect(deleting).toContain("Marek może zapisać ten temat ponownie z nowych rozmów.");
    hookState.pendingDeleteId = null;
    hookState.pendingDeleteEntryId = "entry-how";
    expect(render({ initialSelectedDifficultyId: "difficulty-odmawianie" }).match(/Usunąć ten wpis\?/g)).toHaveLength(
      1,
    );
    expect(findDifficultyByLabel("Nie umiem powiedzieć NIE", [odmawianie, spanie], spanie.id)?.id).toBe(odmawianie.id);
  });
});

describe("TopicGraph after hydration", () => {
  it("gives each topic node the id focus returns to once it is the only view", () => {
    const interactive = renderToStaticMarkup(
      <TopicGraph cards={TOPICS} unlinkedPeople={[]} isInteractive onOpen={vi.fn()} />,
    );
    const inert = renderToStaticMarkup(
      <TopicGraph cards={TOPICS} unlinkedPeople={[]} isInteractive={false} onOpen={vi.fn()} />,
    );

    expect(interactive).toMatch(
      /<g id="topic-card-open-difficulty-odmawianie"[^>]*role="button"[^>]*aria-label="Otwórz temat: Odmawianie\."/,
    );
    expect(inert).not.toContain('id="topic-card-open-difficulty-');
  });
});
