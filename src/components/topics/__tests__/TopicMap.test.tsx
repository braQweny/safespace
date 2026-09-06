import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";
import type { DifficultyCard } from "@/lib/session-data/types";
import { buildDifficultySections, buildTalkAboutTopicHref, findDifficultyByLabel } from "../DifficultyDialog";
import { listPendingLinks } from "../PendingLinks";
import TopicMap from "../TopicMap";
import { getTopicMapCopy } from "../topic-map-copy";

vi.mock("@/components/hooks/useLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/hooks/useLocale")>()),
  useLocale: () => "pl",
}));

const hookState = vi.hoisted(() => ({
  pendingDeleteId: null as string | null,
  pendingDeleteEntryId: null as string | null,
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

const sourceA = { sessionId: SESSION_A, conversationAt: "2026-09-01T09:00:00.000Z" };
const sourceB = { sessionId: SESSION_B, conversationAt: "2026-09-05T09:00:00.000Z" };

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
    // Rezultat wpisany przed propozycją: oś czasu ma sortować po dacie rozmowy.
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

function render(props: Partial<Parameters<typeof TopicMap>[0]> = {}) {
  return renderToStaticMarkup(
    <TopicMap locale="pl" avatar={avatar} initialCards={[odmawianie, spanie, archived]} topicMapEnabled {...props} />,
  );
}

beforeEach(() => {
  hookState.pendingDeleteId = null;
  hookState.pendingDeleteEntryId = null;
});

describe("TopicMap", () => {
  it("lists every difficulty as one row button with people, effect chip and mentions, never an entry's text", () => {
    const html = render();
    expect(html).toContain("Mapa tematów");
    expect(html).toContain("Marek zapisuje trudności, o których mówisz");
    expect(html).toContain('id="topic-card-open-difficulty-odmawianie"');
    expect(html).toContain('id="topic-card-open-difficulty-spanie"');
    expect(html).toContain("przy: Marta, Ola");
    expect(html).toContain('title="W ilu wcześniejszych rozmowach pojawiła się ta trudność"');
    expect(html).toContain("2 rozmowy");
    expect(html).toContain("1 rozmowa");
    expect(html).toContain("ostatnio 5 wrz 2026");
    expect(html).toContain("Otwórz trudność: Odmawianie.");
    expect(html).toContain(">lepiej<");
    expect(html).toContain(">rozwiązane<");
    expect(html).toContain("mniej aktualne");
    expect(html).toContain("nowe wpisy od oznaczenia");
    expect(html).not.toContain("Zgadzam się na wszystko");
    expect(html).not.toContain("dzień do namysłu");
    expect(html).not.toContain("<dialog");
  });

  it("asks to confirm only the uncertain person links, above the list", () => {
    const html = render();
    expect(html).toContain("Do potwierdzenia");
    expect(html).toContain("Czy „Odmawianie” pojawia się przy tej osobie: Ola?");
    expect(html).not.toContain("pojawia się przy tej osobie: Marta");
    expect(html.indexOf("Do potwierdzenia")).toBeLessThan(html.indexOf('id="topic-card-open-difficulty-odmawianie"'));
    expect(listPendingLinks([odmawianie, spanie])).toEqual([{ card: odmawianie, person: odmawianie.persons[1] }]);
    expect(render({ topicMapEnabled: false })).not.toContain("Do potwierdzenia");
  });

  it("explains the empty, disabled and failed states with the avatar's first name", () => {
    expect(render({ initialCards: [] })).toContain("Gdy opowiesz o czymś, z czym się mierzysz, Marek zapisze to tutaj");
    const disabled = render({ topicMapEnabled: false });
    expect(disabled).toContain("Mapa tematów jest wyłączona. Poniższe trudności zostają");
    expect(disabled).toContain('href="/account/security#topic-map"');
    expect(render({ initialCards: [], topicMapEnabled: false })).toContain("Mapa tematów jest wyłączona.");
    expect(render({ initialCards: null })).toContain("Nie udało się odczytać mapy tematów.");
  });

  it("opens a labelled native dialog with the user's own words, people, current state and a conversation as the main action", () => {
    const html = render({ initialSelectedDifficultyId: "difficulty-odmawianie" });
    expect(html).toContain('<dialog aria-label="Karta trudności" tabindex="-1"');
    expect(html).toContain("Propozycja jest zapisana jako propozycja, nigdy jako zalecenie.");
    expect(html).toContain("Inne nazwy: nie umiem powiedzieć nie");
    expect(html).toContain("Pierwsza wzmianka: 1 wrz 2026");
    expect(html).toContain("Jak jest teraz");
    expect(html).toContain("Trochę lżej.");
    expect(html).toContain("Pojawia się przy");
    expect(html).toContain("koleżanka z pracy");
    expect(html).toContain("do potwierdzenia");
    expect(html).toContain("Tak, dotyczy");
    expect(html).toContain("Odłącz");
    expect(html).toContain("Jak to wygląda");
    expect(html).toContain("przy: Marta");
    expect(html).toContain("Jak sobie radzisz na własną rękę");
    expect(html).toContain("poprawione przez Ciebie");
    expect(html).toContain(`href="/dashboard?session=${SESSION_A}"`);
    expect(html).toContain(`href="/dashboard?session=${SESSION_B}"`);
    expect(html).toContain("z rozmów z dni");
    expect(html).toContain("Moja własna uwaga.");
    expect(html).toContain("Usuń tę trudność");
    expect(html).toContain("Popraw");
    expect(html).toContain("Usuń wpis");
    expect(html).toContain("Scal z inną trudnością");
    expect(html).toContain("<option");
    expect(html).toContain(">Zasypianie</option>");
    expect(html).not.toContain(">Odmawianie</option>");
    expect(html).toContain('href="/dashboard?start=now&amp;topic=difficulty-odmawianie"');
    expect(html).toContain("Porozmawiaj o tym");
    expect(html).not.toContain("Usunąć tę trudność na stałe?");
    expect(html).not.toContain("Oznaczyć jako mniej aktualne?");
  });

  it("shows proposals, decisions and outcomes as one chronological timeline with the answered proposal named", () => {
    const html = render({ initialSelectedDifficultyId: "difficulty-odmawianie" });
    expect(html).toContain("Propozycje, postanowienia i jak poszło");
    expect(html).toContain(">Propozycja z rozmowy</p>");
    expect(html).toContain(">Jak poszło</p>");
    expect(html.indexOf("Poprosić o dzień do namysłu")).toBeLessThan(
      html.indexOf("Powiedziałem nie i było w porządku."),
    );
    expect(html).toContain("dotyczy: „Poprosić o dzień do namysłu, zanim się zgodzę.”");
    const updates = html.slice(html.indexOf("Jak to szło w czasie"));
    expect(updates.indexOf("Bez zmian.")).toBeLessThan(updates.indexOf("Trochę lżej."));
    expect(html).toContain(">tak samo<");
    const sections = buildDifficultySections(odmawianie.entries, getTopicMapCopy("pl"));
    expect(sections.map((section) => section.key)).toEqual(["how", "coping", "updates", "timeline"]);
    expect(sections[3].entries.map((entry) => entry.id)).toEqual(["entry-suggested", "entry-outcome"]);
  });

  it("nudges to mark a resolved difficulty as less current, only while it is not", () => {
    expect(render({ initialSelectedDifficultyId: "difficulty-spanie" })).toContain("Oznaczyć jako mniej aktualne?");
    expect(render({ initialSelectedDifficultyId: "difficulty-archived" })).not.toContain(
      "Oznaczyć jako mniej aktualne?",
    );
    expect(render({ initialSelectedDifficultyId: "difficulty-archived" })).toContain("Poranki");
  });

  it("returns to an ongoing conversation of the same perspective instead of starting a new one", () => {
    const html = render({ initialSelectedDifficultyId: "difficulty-odmawianie", resumeSessionId: SESSION_B });
    expect(html).toContain(`href="/dashboard/session?sessionId=${SESSION_B}&amp;topic=difficulty-odmawianie"`);
    expect(html).toContain("Wróć do rozmowy i porozmawiaj o tym");
    expect(buildTalkAboutTopicHref("d", null)).toBe("/dashboard?start=now&topic=d");
  });

  it("confirms removal of the difficulty and of an entry inside the dialog, naming the avatar", () => {
    hookState.pendingDeleteId = "difficulty-odmawianie";
    const deleting = render({ initialSelectedDifficultyId: "difficulty-odmawianie" });
    expect(deleting).toContain("Usunąć tę trudność na stałe?");
    expect(deleting).toContain("Marek może zapisać ją ponownie z nowych rozmów.");
    hookState.pendingDeleteId = null;
    hookState.pendingDeleteEntryId = "entry-how";
    const deletingEntry = render({ initialSelectedDifficultyId: "difficulty-odmawianie" });
    expect(deletingEntry).toContain("Usunąć ten wpis?");
    expect(deletingEntry.match(/Usunąć ten wpis\?/g)).toHaveLength(1);
  });

  it("offers the map/list switch only when there are cards and renders the list before hydration", () => {
    const html = render();
    expect(html).toContain("Widok");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Lista<\/button>/);
    expect(html).toContain("<ol");
    expect(html).not.toContain("data-topic-graph");
    expect(render({ initialCards: [] })).not.toContain(">Mapa</button>");
  });

  it("renders the map: you in the middle, difficulties and people as nodes, edges by state, legend and people without topics", () => {
    const html = render({ forcedView: "graph", peopleCardCount: 4 });
    expect(html).toContain(
      'role="group" aria-label="Mapa tematów: Ty w środku, Twoje trudności wokół, powiązane osoby na obwodzie."',
    );
    expect(html).toContain(">Ty</text>");
    expect(html).not.toContain("<ol");
    expect(html).toMatch(
      /<g id="topic-card-open-difficulty-odmawianie"[^>]*role="button"[^>]*aria-label="Otwórz trudność: Odmawianie\."/,
    );
    expect(html).toContain("6 wpisów · 2 osoby · lepiej");
    expect(html).toContain("0 wpisów · 0 osób · rozwiązane");
    expect(html).toContain('aria-label="Wyróżnij tematy przy tej osobie: Marta"');
    expect(html).toContain('aria-label="Wyróżnij tematy przy tej osobie: Ola"');
    expect(html).toContain("koleżanka z pracy");
    expect(html.match(/stroke-dasharray="6 5"/g)).toHaveLength(1);
    expect(html.match(/class="stroke-brand"/g)).toHaveLength(1);
    // Trudność „mniej aktualna” jest wyblakła i kreskowana.
    expect(html).toContain('stroke-dasharray="5 4"');
    expect(html).toContain("Jak czytać mapę: linia ciągła: potwierdzone powiązanie");
    expect(html).toContain("2 osoby z Twoich rozmów nie mają jeszcze tematów.");
    expect(html).toContain('href="#people-title"');
    // Węzły nie są przyciskami przed hydratacją, ale wciąż są opisane.
    expect(html).toContain('tabindex="-1"');
    expect(html).not.toContain("Zgadzam się na wszystko");
  });

  it("hides the sentence about people without topics when people cards are off or everyone is on the map", () => {
    expect(render({ forcedView: "graph", peopleCardCount: null })).not.toContain("nie ma jeszcze tematów");
    expect(render({ forcedView: "graph", peopleCardCount: 2 })).not.toContain("nie mają jeszcze tematów");
  });

  it("shows a card without entries honestly and finds a merge target by label or alias", () => {
    const html = render({ initialSelectedDifficultyId: "difficulty-spanie" });
    expect(html).toContain("Brak wpisów.");
    expect(html).not.toContain("z rozmowy z dnia");
    expect(findDifficultyByLabel("  odmawianie ", [odmawianie, spanie], spanie.id)?.id).toBe(odmawianie.id);
    expect(findDifficultyByLabel("Nie umiem powiedzieć NIE", [odmawianie, spanie], spanie.id)?.id).toBe(odmawianie.id);
    expect(findDifficultyByLabel("Odmawianie", [odmawianie, spanie], odmawianie.id)).toBeNull();
    expect(findDifficultyByLabel("", [odmawianie], spanie.id)).toBeNull();
  });
});
