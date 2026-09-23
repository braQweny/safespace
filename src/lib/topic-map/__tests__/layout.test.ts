import { describe, expect, it } from "vitest";
import type { DifficultyCard, DifficultyPersonLink } from "@/lib/session-data/types";
import {
  buildTopicGraphLayout,
  listTopicGraphLegend,
  sortCardsForGraph,
  TOPIC_GRAPH,
  type TopicGraphBox,
  type TopicGraphLayout,
  wrapGraphLabel,
} from "../layout";

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

  it("places people without topics on the outer ring without edges, once each, deterministically", () => {
    const cards = [card("a", { persons: [person("marta")] }), card("b"), card("c")];
    const extras = [
      { id: "zofia", name: "Zofia", relation: "mama" },
      { id: "adam", name: "Adam", relation: null },
      // Osoba już powiązana i duplikat nie dostają drugiego miejsca.
      { id: "marta", name: "Marta", relation: null },
      { id: "adam", name: "Adam", relation: null },
    ];
    const layout = buildTopicGraphLayout(cards, extras);
    const again = buildTopicGraphLayout([...cards].reverse(), [...extras].reverse());
    expect(again).toEqual(layout);
    expect(layout.persons.map((node) => [node.id, node.linked])).toEqual(
      expect.arrayContaining([
        ["marta", true],
        ["adam", false],
        ["zofia", false],
      ]),
    );
    expect(layout.persons).toHaveLength(3);
    expect(layout.edges.map((edge) => edge.personId)).toEqual(["marta"]);
    for (const node of layout.persons) {
      expect(Math.hypot(node.x - layout.center.x, node.y - layout.center.y)).toBeCloseTo(layout.outerRadius, 0);
      expect(node.x).toBeGreaterThan(0);
      expect(node.x).toBeLessThan(layout.width);
      expect(node.y).toBeGreaterThan(0);
      expect(node.y).toBeLessThan(layout.height);
    }
    const unlinked = layout.persons.find((node) => node.id === "adam");
    expect(unlinked?.difficultyIds).toEqual([]);
    // Sama lista osób bez tematów też daje mapę: „Ty” w środku, osoby wokół.
    const peopleOnly = buildTopicGraphLayout([], extras.slice(0, 2));
    expect(peopleOnly.difficulties).toHaveLength(0);
    expect(peopleOnly.persons).toHaveLength(2);
    const angles = [...peopleOnly.persons].map((node) => node.angle).sort((a, b) => a - b);
    expect(angles[1] - angles[0]).toBeGreaterThanOrEqual(TOPIC_GRAPH.personSlotWidth / peopleOnly.outerRadius - 1e-9);
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
    // Osoba nad górną trudnością rozszerza obraz w górę razem ze swoim podpisem — nic nie zostaje przycięte.
    const withPerson = buildTopicGraphLayout([card("a", { persons: [person("m")] }), card("b"), card("c")]);
    const marta = withPerson.persons[0];
    expect(marta.labelBox.y).toBeCloseTo(TOPIC_GRAPH.padding, 0);
    expect(marta.labelBox.y + marta.labelBox.height).toBeLessThan(marta.y - TOPIC_GRAPH.personRadius);
    const full = buildTopicGraphLayout(Array.from({ length: 12 }, (_, index) => card(`d${index}`)));
    expect(full.height).toBeGreaterThan(2 * full.innerRadius);
  });

  it("wraps a long topic label onto a second line instead of cutting it, and keeps the full text beside it", () => {
    const layout = buildTopicGraphLayout([
      card("a", {
        label: "Nie potrafię odmówić, gdy ktoś prosi o pomoc",
        persons: [{ ...person("m"), name: "Małgorzata Anna Kowalska", relation: "koleżanka z działu obsługi klienta" }],
        currentState: { id: "e", text: "Lepiej.", effect: "better", conversationAt: null },
        archivedAt: "2026-09-06T00:00:00.000Z",
        entries: [],
      }),
      card("b", { label: "Sen" }),
    ]);
    // „Mniej aktualny” temat stoi za aktualnymi, więc szukamy po id.
    const node = layout.difficulties.find((entry) => entry.id === "a");
    const short = layout.difficulties.find((entry) => entry.id === "b");
    if (!node || !short) throw new Error("missing nodes");
    expect(node.labelLines).toEqual(["Nie potrafię odmówić,", "gdy ktoś prosi o pomoc"]);
    expect(node.height).toBe(TOPIC_GRAPH.difficultyHeight + TOPIC_GRAPH.difficultyLineHeight);
    expect(short.labelLines).toEqual(["Sen"]);
    expect(short.height).toBe(TOPIC_GRAPH.difficultyHeight);
    expect(node.label).toBe("Nie potrafię odmówić, gdy ktoś prosi o pomoc");
    expect(node.archived).toBe(true);
    expect(node.effect).toBe("better");
    expect(layout.persons[0].shortName).toBe("Małgorzata An…");
    expect(layout.persons[0].shortRelation).toBe("koleżanka z dział…");
    expect(layout.persons[0].relation).toBe("koleżanka z działu obsługi klienta");
    expect(layout.persons[0].initial).toBe("M");
  });
});

describe("wrapGraphLabel", () => {
  it("breaks at words, cuts only the last line and splits a word longer than a line", () => {
    expect(wrapGraphLabel("nie mogę zasnąć po krytyce", 22, 2)).toEqual(["nie mogę zasnąć po", "krytyce"]);
    expect(wrapGraphLabel("  Sen  ", 22, 2)).toEqual(["Sen"]);
    // Ostatni wiersz kończy się na całym słowie (bez wiszącego przecinka), dopiero potem „…”.
    expect(wrapGraphLabel("Nie potrafię odmówić, gdy ktoś prosi o pomoc, nawet gdy nie mam siły", 22, 2)).toEqual([
      "Nie potrafię odmówić,",
      "gdy ktoś prosi o…",
    ]);
    expect(wrapGraphLabel("Kłótnie o pieniądze, obowiązki domowe", 22, 1)).toEqual(["Kłótnie o pieniądze…"]);
    expect(wrapGraphLabel("Przepracowywanienadgodzinamiwweekendy", 22, 2)).toEqual([
      "Przepracowywanienadgod",
      "zinamiwweekendy",
    ]);
    for (const line of wrapGraphLabel("a ".repeat(40), 22, 2)) {
      expect(Array.from(line).length).toBeLessThanOrEqual(22);
    }
  });
});

describe("person labels and edges", () => {
  function overlaps(a: TopicGraphBox, b: TopicGraphBox) {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  }

  function circleTouchesBox(cx: number, cy: number, radius: number, box: TopicGraphBox) {
    const nearestX = Math.max(box.x, Math.min(cx, box.x + box.width));
    const nearestY = Math.max(box.y, Math.min(cy, box.y + box.height));
    return Math.hypot(cx - nearestX, cy - nearestY) < radius;
  }

  /** Odcinek kontra prostokąt (Liang–Barsky): czy linia przechodzi przez podpis. */
  function segmentCrossesBox(edge: { x1: number; y1: number; x2: number; y2: number }, box: TopicGraphBox) {
    let enter = 0;
    let exit = 1;
    const dx = edge.x2 - edge.x1;
    const dy = edge.y2 - edge.y1;
    const sides: [number, number][] = [
      [-dx, edge.x1 - box.x],
      [dx, box.x + box.width - edge.x1],
      [-dy, edge.y1 - box.y],
      [dy, box.y + box.height - edge.y1],
    ];
    for (const [direction, distance] of sides) {
      if (direction === 0) {
        if (distance < 0) return false;
        continue;
      }
      const t = distance / direction;
      if (direction < 0) enter = Math.max(enter, t);
      else exit = Math.min(exit, t);
      if (enter > exit) return false;
    }
    return true;
  }

  function difficultyBox(node: TopicGraphLayout["difficulties"][number]): TopicGraphBox {
    return {
      x: node.x - TOPIC_GRAPH.difficultyWidth / 2,
      y: node.y - node.height / 2,
      width: TOPIC_GRAPH.difficultyWidth,
      height: node.height,
    };
  }

  /** Zbiera wszystkie kolizje naraz, żeby porażka mówiła, co z czym się zderzyło. */
  function expectReadableLayout(layout: TopicGraphLayout) {
    const problems: string[] = [];
    const topics = layout.difficulties.map((node) => ({ id: node.id, box: difficultyBox(node) }));
    layout.persons.forEach((person, index) => {
      const label = person.labelBox;
      for (const edge of layout.edges) {
        if (segmentCrossesBox(edge, label)) problems.push(`edge ${edge.id} crosses the label of ${person.id}`);
      }
      for (const other of layout.persons.slice(index + 1)) {
        if (overlaps(label, other.labelBox)) problems.push(`labels of ${person.id} and ${other.id} overlap`);
      }
      for (const topic of topics) {
        if (overlaps(label, topic.box)) problems.push(`label of ${person.id} covers topic ${topic.id}`);
      }
      for (const node of layout.persons) {
        if (circleTouchesBox(node.x, node.y, TOPIC_GRAPH.personRadius, label)) {
          problems.push(`label of ${person.id} covers the circle of ${node.id}`);
        }
      }
      if (circleTouchesBox(layout.center.x, layout.center.y, TOPIC_GRAPH.youRadius, label)) {
        problems.push(`label of ${person.id} covers you`);
      }
      if (
        label.x < 0 ||
        label.y < 0 ||
        label.x + label.width > layout.width ||
        label.y + label.height > layout.height
      ) {
        problems.push(`label of ${person.id} leaves the picture`);
      }
    });
    topics.forEach((topic, index) => {
      for (const other of topics.slice(index + 1)) {
        if (overlaps(topic.box, other.box)) problems.push(`topics ${topic.id} and ${other.id} overlap`);
      }
      for (const node of layout.persons) {
        if (circleTouchesBox(node.x, node.y, TOPIC_GRAPH.personRadius, topic.box)) {
          problems.push(`topic ${topic.id} covers the circle of ${node.id}`);
        }
      }
    });
    expect(problems).toEqual([]);
  }

  it("keeps the label of a person above a topic clear of the edge that reaches them from below", () => {
    // Zgłoszenie z 2026-09-23: jeden temat i „Tomek · szef” nad nim; linia szła przez podpis pod kółkiem.
    const layout = buildTopicGraphLayout([
      card("sleep", {
        label: "nie mogę zasnąć po krytyce",
        persons: [{ ...person("tomek"), name: "Tomek", relation: "szef" }],
      }),
    ]);
    const [tomek] = layout.persons;
    const [edge] = layout.edges;
    const [topic] = layout.difficulties;
    expect(topic.labelLines).toEqual(["nie mogę zasnąć po", "krytyce"]);
    expect(edge.y1).toBeGreaterThan(edge.y2);
    // Podpis stoi nad kółkiem, wyśrodkowany, po stronie odwróconej od tematu.
    expect(tomek.labelBox.y + tomek.labelBox.height).toBeLessThanOrEqual(tomek.y - TOPIC_GRAPH.personRadius);
    expect(tomek.labelBox.x + tomek.labelBox.width / 2).toBeCloseTo(tomek.x, 0);
    expect(segmentCrossesBox(edge, tomek.labelBox)).toBe(false);
    // Dawne miejsce podpisu (92 × 36 pod kółkiem) leżało dokładnie na drodze tej krawędzi.
    const oldLabel = { x: tomek.x - 46, y: tomek.y + TOPIC_GRAPH.personRadius, width: 92, height: 36 };
    expect(segmentCrossesBox(edge, oldLabel)).toBe(true);
    expectReadableLayout(layout);
  });

  it("puts labels outside the ring on every side: above at the top, beside at the sides, below at the bottom", () => {
    const layout = buildTopicGraphLayout(
      [],
      ["n", "e", "s", "w"].map((id) => ({ id, name: id.toUpperCase(), relation: "brat" })),
    );
    for (const node of layout.persons) {
      const dx = Math.cos(node.angle);
      const dy = Math.sin(node.angle);
      // Najbliższy środka mapy róg podpisu leży za styczną do kółka.
      const nearest = Math.min(
        ...[
          [node.labelBox.x, node.labelBox.y],
          [node.labelBox.x + node.labelBox.width, node.labelBox.y],
          [node.labelBox.x, node.labelBox.y + node.labelBox.height],
          [node.labelBox.x + node.labelBox.width, node.labelBox.y + node.labelBox.height],
        ].map(([x, y]) => (x - node.x) * dx + (y - node.y) * dy),
      );
      expect(nearest).toBeGreaterThanOrEqual(TOPIC_GRAPH.personRadius + TOPIC_GRAPH.personLabelGap - 0.05);
    }
    const bottom = layout.persons.find((node) => Math.abs(node.angle - Math.PI / 2) < 1e-6);
    expect(bottom?.labelBox.y).toBeGreaterThan((bottom?.y ?? 0) + TOPIC_GRAPH.personRadius);
    const right = layout.persons.find(
      (node) => Math.abs(node.angle) < 1e-6 || Math.abs(node.angle - 2 * Math.PI) < 1e-6,
    );
    expect(right?.labelBox.x).toBeGreaterThan((right?.x ?? 0) + TOPIC_GRAPH.personRadius);
    expect((right?.labelBox.y ?? 0) + (right?.labelBox.height ?? 0) / 2).toBeCloseTo(right?.y ?? 0, 0);
    expectReadableLayout(layout);
  });

  it("never lets an edge cross a label or two labels collide, from a handful of cards to the limits", () => {
    const longPeople = Array.from({ length: 40 }, (_, index) => ({
      ...person(`p${String(index).padStart(2, "0")}`),
      name: `Osoba z długim imieniem ${index}`,
      relation: index % 3 === 0 ? null : "koleżanka z działu obsługi klienta",
    }));
    const limits = Array.from({ length: 30 }, (_, index) =>
      card(`d${String(index).padStart(2, "0")}`, {
        label: "Temat o bardzo długiej nazwie, która nie mieści się w jednym wierszu",
        persons: longPeople.slice((index * 3) % 40, ((index * 3) % 40) + 4),
      }),
    );
    expectReadableLayout(buildTopicGraphLayout(limits));
    // Czterdzieści osób bez tematów stoi gęsto na samym obwodzie.
    expectReadableLayout(
      buildTopicGraphLayout(
        [],
        longPeople.map((entry) => ({ id: entry.personId, name: entry.name, relation: entry.relation })),
      ),
    );

    // Deterministyczny „losowy” przegląd: różne liczby tematów, osób, powiązań i długości podpisów.
    let seed = 7;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let round = 0; round < 150; round += 1) {
      const people = Array.from({ length: Math.floor(random() * 41) }, (_, index) => ({
        ...person(`r${index}`),
        name: "M".repeat(1 + Math.floor(random() * 20)),
        relation: random() < 0.3 ? null : "w".repeat(1 + Math.floor(random() * 24)),
        state: random() < 0.3 ? ("suggested" as const) : ("confirmed" as const),
      }));
      const density = random() * 0.2;
      const cards = Array.from({ length: Math.floor(random() * 31) }, (_, index) =>
        card(`t${index}`, {
          label: Array.from({ length: 1 + Math.floor(random() * 8) }, () =>
            "x".repeat(1 + Math.floor(random() * 12)),
          ).join(" "),
          persons: people.filter(() => random() < density),
        }),
      );
      expectReadableLayout(
        buildTopicGraphLayout(
          cards,
          people.map((entry) => ({ id: entry.personId, name: entry.name, relation: entry.relation })),
        ),
      );
    }
  });
});

describe("listTopicGraphLegend", () => {
  it("explains only what the map shows, and nothing when solid lines are all there is", () => {
    const confirmedOnly = buildTopicGraphLayout([card("a", { persons: [person("m")] })]);
    expect(listTopicGraphLegend(confirmedOnly)).toEqual([]);
    expect(listTopicGraphLegend(buildTopicGraphLayout([card("a")]))).toEqual([]);

    const withSuggested = buildTopicGraphLayout([card("a", { persons: [person("m"), person("k", "suggested")] })]);
    expect(listTopicGraphLegend(withSuggested)).toEqual(["confirmed", "suggested"]);

    const onlySuggested = buildTopicGraphLayout([card("a", { persons: [person("k", "suggested")] })]);
    expect(listTopicGraphLegend(onlySuggested)).toEqual(["suggested"]);

    const withUnlinked = buildTopicGraphLayout(
      [card("a", { persons: [person("m")] })],
      [{ id: "o", name: "Ola", relation: null }],
    );
    expect(listTopicGraphLegend(withUnlinked)).toEqual(["confirmed", "unlinked"]);

    const everything = buildTopicGraphLayout(
      [
        card("a", { persons: [person("m"), person("k", "suggested")] }),
        card("b", { archivedAt: "2026-09-06T00:00:00.000Z" }),
      ],
      [{ id: "o", name: "Ola", relation: null }],
    );
    expect(listTopicGraphLegend(everything)).toEqual(["confirmed", "suggested", "unlinked", "archived"]);
    expect(
      listTopicGraphLegend(buildTopicGraphLayout([card("b", { archivedAt: "2026-09-06T00:00:00.000Z" })])),
    ).toEqual(["archived"]);
  });
});
