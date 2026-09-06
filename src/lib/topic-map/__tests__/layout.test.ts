import { describe, expect, it } from "vitest";
import type { DifficultyCard, DifficultyPersonLink } from "@/lib/session-data/types";
import { buildTopicGraphLayout, sortCardsForGraph, TOPIC_GRAPH } from "../layout";

function person(id: string, state: DifficultyPersonLink["state"] = "confirmed"): DifficultyPersonLink {
  return { personId: id, name: id.toUpperCase(), relation: null, state, userDecided: false };
}

function card(id: string, overrides: Partial<DifficultyCard> = {}): DifficultyCard {
  return {
    id,
    avatarId: "cbt-guide",
    label: `Trudność ${id}`,
    labelLocked: false,
    userNote: "",
    archivedAt: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    aliases: [],
    persons: [],
    firstMentionedAt: null,
    lastMentionedAt: null,
    mentionCount: 0,
    currentState: null,
    hasNewEntriesSinceArchived: false,
    entries: [],
    ...overrides,
  };
}

function angularDistance(a: number, b: number) {
  const diff = Math.abs(a - b) % (Math.PI * 2);
  return Math.min(diff, Math.PI * 2 - diff);
}

describe("buildTopicGraphLayout", () => {
  it("is deterministic and puts you in the middle with difficulties on one ring", () => {
    const cards = [card("a", { persons: [person("m")] }), card("b"), card("c")];
    const first = buildTopicGraphLayout(cards);
    const second = buildTopicGraphLayout([...cards].reverse());
    expect(second).toEqual(first);
    // Obraz jest przycięty do narysowanych węzłów: „Ty” leży wewnątrz, nie musi być w geometrycznym środku.
    expect(first.center.x).toBeGreaterThan(0);
    expect(first.center.x).toBeLessThan(first.width);
    expect(first.center.y).toBeGreaterThan(0);
    expect(first.center.y).toBeLessThan(first.height);
    for (const node of first.difficulties) {
      expect(Math.hypot(node.x - first.center.x, node.y - first.center.y)).toBeCloseTo(first.innerRadius, 0);
    }
    expect(first.difficulties.map((node) => node.id)).toEqual(["a", "b", "c"]);
  });

  it("orders current difficulties before less current ones, by last mention", () => {
    const sorted = sortCardsForGraph([
      card("old", { lastMentionedAt: "2026-09-01T00:00:00.000Z" }),
      card("archived", { lastMentionedAt: "2026-09-06T00:00:00.000Z", archivedAt: "2026-09-06T00:00:00.000Z" }),
      card("new", { lastMentionedAt: "2026-09-05T00:00:00.000Z" }),
      card("never"),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["new", "old", "never", "archived"]);
  });

  it("places a person next to their difficulties, on the outer ring, and skips unlinked and rejected people", () => {
    const layout = buildTopicGraphLayout([
      card("a", { persons: [person("marta"), person("ola", "rejected")] }),
      card("b", { persons: [person("marta"), person("kuba", "suggested")] }),
      card("c"),
    ]);
    const marta = layout.persons.find((node) => node.id === "marta");
    const [a, b] = layout.difficulties;
    expect(marta).toBeDefined();
    expect(marta?.difficultyIds).toEqual(["a", "b"]);
    // Średnia na okręgu, nie arytmetyczna: pierwsza trudność stoi na godzinie 12, czyli tuż za zerem kąta.
    const expectedAngle = Math.atan2(Math.sin(a.angle) + Math.sin(b.angle), Math.cos(a.angle) + Math.cos(b.angle));
    expect(angularDistance(marta?.angle ?? 0, expectedAngle)).toBeLessThan(0.05);
    expect(Math.hypot((marta?.x ?? 0) - layout.center.x, (marta?.y ?? 0) - layout.center.y)).toBeCloseTo(
      layout.outerRadius,
      0,
    );
    expect(layout.persons.map((node) => node.id)).not.toContain("ola");
    expect(layout.edges.map((edge) => [edge.difficultyId, edge.personId, edge.state])).toEqual([
      ["a", "marta", "confirmed"],
      ["b", "marta", "confirmed"],
      ["b", "kuba", "suggested"],
    ]);
    expect(layout.difficulties.map((node) => node.personCount)).toEqual([1, 2, 0]);
  });

  it("keeps nodes apart at the limits: thirty difficulties and forty linked people", () => {
    const people = Array.from({ length: 40 }, (_, index) => person(`p${String(index).padStart(2, "0")}`));
    const cards = Array.from({ length: 30 }, (_, index) =>
      card(`d${String(index).padStart(2, "0")}`, {
        persons: people.slice((index * 3) % 40, ((index * 3) % 40) + 4),
      }),
    );
    const layout = buildTopicGraphLayout(cards);
    expect(layout.difficulties).toHaveLength(30);
    expect(layout.persons).toHaveLength(40);
    for (let index = 1; index < layout.difficulties.length; index += 1) {
      const previous = layout.difficulties[index - 1];
      const current = layout.difficulties[index];
      expect(Math.hypot(current.x - previous.x, current.y - previous.y)).toBeGreaterThan(
        TOPIC_GRAPH.difficultyWidth * 0.95,
      );
    }
    const angles = [...layout.persons].map((node) => node.angle).sort((a, b) => a - b);
    for (let index = 1; index < angles.length; index += 1) {
      expect(angles[index] - angles[index - 1]).toBeGreaterThanOrEqual(
        TOPIC_GRAPH.personSlotWidth / layout.outerRadius - 1e-9,
      );
    }
    expect(angles[0] + Math.PI * 2 - angles[angles.length - 1]).toBeGreaterThanOrEqual(
      TOPIC_GRAPH.personSlotWidth / layout.outerRadius - 1e-9,
    );
    expect(layout.outerRadius).toBeGreaterThan(layout.innerRadius);
    // Wszystko mieści się w obrazku, łącznie z podpisami osób.
    for (const node of [...layout.difficulties, ...layout.persons]) {
      expect(node.x).toBeGreaterThan(0);
      expect(node.x).toBeLessThan(layout.width);
      expect(node.y).toBeGreaterThan(0);
      expect(node.y).toBeLessThan(layout.height);
    }
  });

  it("crops the picture to what is drawn, so three difficulties at the bottom leave no empty band above", () => {
    const three = buildTopicGraphLayout([card("a"), card("b"), card("c")]);
    const topmost = Math.min(...three.difficulties.map((node) => node.y - TOPIC_GRAPH.difficultyHeight / 2));
    expect(topmost).toBeCloseTo(TOPIC_GRAPH.padding, 0);
    expect(three.height).toBeLessThan(2 * (three.outerRadius + TOPIC_GRAPH.padding));
    // Osoba nad górną trudnością rozszerza obraz w górę — nic nie zostaje przycięte.
    const withPerson = buildTopicGraphLayout([card("a", { persons: [person("m")] }), card("b"), card("c")]);
    const marta = withPerson.persons[0];
    expect(marta.y - TOPIC_GRAPH.personRadius).toBeCloseTo(TOPIC_GRAPH.padding, 0);
    const full = buildTopicGraphLayout(Array.from({ length: 12 }, (_, index) => card(`d${index}`)));
    expect(full.height).toBeGreaterThan(2 * full.innerRadius);
  });

  it("shortens long labels and names for the node and keeps the full text beside them", () => {
    const layout = buildTopicGraphLayout([
      card("a", {
        label: "Nie potrafię odmówić, gdy ktoś prosi o pomoc",
        persons: [{ ...person("m"), name: "Małgorzata Anna Kowalska" }],
        currentState: { id: "e", text: "Lepiej.", effect: "better", conversationAt: null },
        archivedAt: "2026-09-06T00:00:00.000Z",
        entries: [],
      }),
    ]);
    const [node] = layout.difficulties;
    expect(node.shortLabel).toBe("Nie potrafię odmówić,…");
    expect(node.label).toBe("Nie potrafię odmówić, gdy ktoś prosi o pomoc");
    expect(node.archived).toBe(true);
    expect(node.effect).toBe("better");
    expect(layout.persons[0].shortName).toBe("Małgorzata An…");
    expect(layout.persons[0].initial).toBe("M");
  });
});
