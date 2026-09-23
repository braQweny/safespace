// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTopicMapCopy } from "@/components/topics/topic-map-copy";
import { resetTopicMapViewForTests } from "@/components/topics/topic-map-view";
import { MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";
import type { DifficultyCard, PersonCard } from "@/lib/session-data/types";
import MemoryView from "../MemoryView";

const captured = vi.hoisted(() => ({
  onCardsUpdated: null as (() => void) | null,
  onDifficultyDeleted: null as ((difficultyId: string) => void) | null,
  people: [] as unknown[],
  topics: [] as unknown[],
}));

vi.mock("@/components/hooks/usePeopleMemoryPreparation", () => ({
  usePeopleMemoryPreparation: (_avatar: unknown, _enabled: boolean, onCardsUpdated: () => void) => {
    captured.onCardsUpdated = onCardsUpdated;
  },
}));

vi.mock("@/lib/api-client", () => ({
  requestApiJson: vi.fn((url: string) =>
    Promise.resolve({
      kind: "json",
      status: 200,
      body: url.startsWith("/api/session/people")
        ? { ok: true, type: "people_list", cards: captured.people }
        : { ok: true, type: "topic_list", cards: captured.topics },
    }),
  ),
}));

vi.mock("@/components/hooks/useDifficultyMutations", () => ({
  useDifficultyMutations: (options: { onDeleted: (difficultyId: string) => void }) => {
    captured.onDifficultyDeleted = options.onDeleted;
    return {
      savingDifficultyId: null,
      savingEntryId: null,
      pendingDeleteId: null,
      deletingId: null,
      pendingDeleteEntryId: null,
      decidingPersonId: null,
      mergingId: null,
      updateDifficulty: vi.fn(),
      updateEntry: vi.fn(),
      requestDeleteEntry: vi.fn(),
      cancelDeleteEntry: vi.fn(),
      confirmDeleteEntry: vi.fn(),
      requestDelete: vi.fn(),
      cancelDelete: vi.fn(),
      confirmDelete: vi.fn(),
      decidePerson: vi.fn(),
      merge: vi.fn(),
    };
  },
}));

const topicCopy = getTopicMapCopy("pl");
const avatar = toSelectedModalityAvatar(MVP_MODALITIES.find((m) => m.modalityId === "cbt") ?? MVP_MODALITIES[1]);

function personCard(id: string, name: string): PersonCard {
  return {
    id,
    avatarId: "cbt-guide",
    name,
    nameLocked: false,
    relation: null,
    relationLocked: false,
    userNote: "",
    createdAt: "2026-09-01T10:00:00.000Z",
    firstMentionedAt: null,
    lastMentionedAt: null,
    mentionCount: 1,
    facts: [],
  };
}

function topicCard(id: string, label: string): DifficultyCard {
  return {
    id,
    avatarId: "cbt-guide",
    label,
    labelLocked: false,
    userNote: "",
    archivedAt: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    aliases: [],
    persons: [],
    firstMentionedAt: null,
    lastMentionedAt: null,
    mentionCount: 1,
    currentState: null,
    hasNewEntriesSinceArchived: false,
    entries: [],
  };
}

const tomek = personCard("a1b2c3d4-0000-4000-8000-000000000001", "Tomek");
const ola = personCard("a1b2c3d4-0000-4000-8000-000000000002", "Ola");
const sleep = topicCard("topic-sleep", "nie mogę zasnąć po krytyce");
const work = topicCard("topic-work", "Odmawianie w pracy");

function renderView(people: PersonCard[], topics: DifficultyCard[]) {
  render(
    <MemoryView
      locale="pl"
      avatar={avatar}
      peopleMemoryMode
      topicMapMode
      initialPersonCards={people}
      initialDifficultyCards={topics}
      peopleMemoryEnabled
      topicMapEnabled
      memoryPreview={null}
      // Zapamiętany wybór „Mapa” — poniżej progu i tak nic nie znaczy.
      initialView="graph"
    />,
  );
  return userEvent.setup();
}

function mapSwitch() {
  return screen.queryByRole("button", { name: topicCopy.viewMap });
}

function graph() {
  return screen.queryByRole("group", { name: topicCopy.graphAria });
}

const HINT = "Mapa pojawi się, gdy Marek zapamięta więcej osób i tematów.";

beforeEach(() => {
  captured.onCardsUpdated = null;
  captured.onDifficultyDeleted = null;
});

afterEach(() => {
  cleanup();
  resetTopicMapViewForTests();
});

describe("MemoryView when cards cross the map threshold", () => {
  it("keeps the list when new cards arrive mid-visit, offers the switch and shows the map only on request", async () => {
    const user = renderView([tomek], [sleep]);
    expect(graph()).toBeNull();
    expect(mapSwitch()).toBeNull();
    expect(screen.getByText(HINT)).toBeTruthy();

    // Partia w tle dopisała karty: teraz są cztery.
    captured.people = [tomek, ola];
    captured.topics = [sleep, work];
    await act(async () => {
      captured.onCardsUpdated?.();
      await Promise.resolve();
    });

    expect(screen.getByText("Osoby · 2")).toBeTruthy();
    expect(screen.queryByText(HINT)).toBeNull();
    // Widok nie przeskakuje na mapę sam: lista zostaje wciśnięta.
    expect(graph()).toBeNull();
    expect(screen.getByRole("button", { name: topicCopy.viewList }).getAttribute("aria-pressed")).toBe("true");

    const toMap = mapSwitch();
    if (!toMap) throw new Error("map switch missing");
    await user.click(toMap);
    expect(graph()).not.toBeNull();
    expect(mapSwitch()?.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Osoby · 2")).toBeNull();
  });

  it("falls back to the list alone when a deletion leaves fewer than four cards", async () => {
    renderView([tomek, ola], [sleep, work]);
    expect(graph()).not.toBeNull();
    expect(mapSwitch()?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      captured.onDifficultyDeleted?.(work.id);
      await Promise.resolve();
    });

    expect(graph()).toBeNull();
    expect(mapSwitch()).toBeNull();
    expect(screen.getByText("Tematy · 1")).toBeTruthy();
    expect(screen.getByText(HINT)).toBeTruthy();
  });
});
