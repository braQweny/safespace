import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DifficultyMutations } from "@/components/hooks/useDifficultyMutations";
import type { DifficultyCard } from "@/lib/session-data/types";
import DifficultyEditForm from "../DifficultyEditForm";
import DifficultyEntryTimeline from "../DifficultyEntryTimeline";
import DifficultyMergeForm from "../DifficultyMergeForm";
import DifficultyPersons from "../DifficultyPersons";

vi.mock("@/components/hooks/useLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/hooks/useLocale")>()),
  useLocale: () => "pl",
}));

const PERSON_MARTA = "7a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";
const PERSON_OLA = "8b2c3d4e-5f6a-4b7c-9d0e-1f2a3b4c5d6e";
const PERSON_KUBA = "9c3d4e5f-6a7b-4c8d-0e1f-2a3b4c5d6e7f";
const SESSION_A = "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a";

const card: DifficultyCard = {
  id: "difficulty-odmawianie",
  avatarId: "cbt-guide",
  label: "Odmawianie",
  labelLocked: false,
  userNote: "Moja własna uwaga.",
  archivedAt: null,
  createdAt: "2026-09-01T10:00:00.000Z",
  aliases: [],
  persons: [
    { personId: PERSON_MARTA, name: "Marta", relation: "koleżanka z pracy", state: "confirmed", userDecided: false },
    { personId: PERSON_OLA, name: "Ola", relation: null, state: "suggested", userDecided: false },
    { personId: PERSON_KUBA, name: "Kuba", relation: "brat", state: "rejected", userDecided: true },
  ],
  firstMentionedAt: "2026-09-01T10:00:00.000Z",
  lastMentionedAt: "2026-09-05T10:00:00.000Z",
  mentionCount: 2,
  currentState: null,
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
      sources: [{ sessionId: SESSION_A, conversationAt: "2026-09-01T09:00:00.000Z" }],
    },
  ],
};

function mutations(overrides: Partial<DifficultyMutations> = {}): DifficultyMutations {
  return {
    savingDifficultyId: null,
    savingEntryId: null,
    pendingDeleteId: null,
    deletingId: null,
    pendingDeleteEntryId: null,
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
    ...overrides,
  };
}

describe("DifficultyEditForm", () => {
  it("opens with what the card holds now", () => {
    const html = renderToStaticMarkup(
      <DifficultyEditForm
        card={{ ...card, archivedAt: "2026-09-03T10:00:00.000Z" }}
        cards={[card]}
        avatarFirstName="Marek"
        mutations={mutations()}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(html).toMatch(/<input id="topic-card-label"[^>]*value="Odmawianie"/);
    expect(html).toContain(">Moja własna uwaga.</textarea>");
    expect(html).toMatch(/<input type="checkbox"[^>]*checked=""/);
    expect(html).toContain("Marek");
    expect(html).not.toContain('role="alert"');
  });
});

describe("DifficultyPersons", () => {
  it("offers the decision that fits each link and nothing without people", () => {
    const html = renderToStaticMarkup(<DifficultyPersons card={card} mutations={mutations()} />);

    expect(html).toContain("data-topic-persons");
    expect(html).toContain("Odłącz");
    expect(html).toContain("Tak, dotyczy");
    expect(html).not.toContain('role="group"');
    expect(renderToStaticMarkup(<DifficultyPersons card={{ ...card, persons: [] }} mutations={mutations()} />)).toBe(
      "",
    );
  });

  it("disables a person's actions while their decision is saving", () => {
    const html = renderToStaticMarkup(
      <DifficultyPersons card={card} mutations={mutations({ decidingPersonId: PERSON_OLA })} />,
    );

    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});

describe("DifficultyEntryTimeline", () => {
  it("lists entries with their provenance and asks in place before deleting one", () => {
    const idle = renderToStaticMarkup(<DifficultyEntryTimeline card={card} mutations={mutations()} />);
    const confirming = renderToStaticMarkup(
      <DifficultyEntryTimeline card={card} mutations={mutations({ pendingDeleteEntryId: "entry-how" })} />,
    );

    expect(idle).toContain("Zgadzam się na wszystko w pracy.");
    expect(idle).toContain(`href="/dashboard?session=${SESSION_A}"`);
    expect(idle).not.toContain('role="group"');
    expect(confirming).toContain('role="group" aria-labelledby="topic-card-entry-delete-heading"');
    expect(
      renderToStaticMarkup(<DifficultyEntryTimeline card={{ ...card, entries: [] }} mutations={mutations()} />),
    ).toContain("<p");
  });
});

describe("DifficultyMergeForm", () => {
  it("renders only when there is another topic to merge with", () => {
    const other = { ...card, id: "difficulty-spanie", label: "Zasypianie" };

    expect(renderToStaticMarkup(<DifficultyMergeForm card={card} otherCards={[]} mutations={mutations()} />)).toBe("");
    const html = renderToStaticMarkup(<DifficultyMergeForm card={card} otherCards={[other]} mutations={mutations()} />);
    expect(html).toContain("data-topic-merge");
    expect(html).toContain('<option value="difficulty-spanie" selected="">Zasypianie</option>');
  });
});
