import type { DifficultyCard } from "@/lib/session-data/types";
import type { DifficultyEffect, DifficultyPersonState } from "@/lib/session-summary/topic-map-budget";

/**
 * Deterministyczny układ mapy tematów: „Ty” w środku, trudności w pierścieniu
 * posortowane po ostatniej wzmiance, osoby z powiązaniami na obwodzie, każda
 * najbliżej swoich trudności (kąt = średnia kątów powiązanych trudności).
 * Czysta funkcja bez fizyki i bez losowości: ten sam zestaw kart daje ten sam
 * obraz, więc mapa nie „pływa” po odświeżeniu listy w tle.
 */
export const TOPIC_GRAPH = {
  difficultyWidth: 148,
  difficultyHeight: 46,
  /** Odstęp między trudnościami na pierścieniu, liczony po obwodzie. */
  difficultyGap: 28,
  personRadius: 20,
  /** Szerokość miejsca na osobę razem z podpisem — pilnuje odstępów na obwodzie. */
  personSlotWidth: 92,
  personLabelHeight: 36,
  youRadius: 26,
  innerRingMin: 120,
  ringGap: 108,
  padding: 28,
  labelMaxChars: 22,
  nameMaxChars: 14,
} as const;

export type TopicGraphEdgeState = Exclude<DifficultyPersonState, "rejected">;

export interface TopicGraphDifficultyNode {
  kind: "difficulty";
  id: string;
  label: string;
  /** Etykieta przycięta do węzła; pełna zostaje w `label` (podpis i aria). */
  shortLabel: string;
  archived: boolean;
  effect: DifficultyEffect | null;
  entryCount: number;
  personCount: number;
  angle: number;
  x: number;
  y: number;
}

export interface TopicGraphPersonNode {
  kind: "person";
  id: string;
  name: string;
  shortName: string;
  relation: string | null;
  initial: string;
  angle: number;
  x: number;
  y: number;
  difficultyIds: string[];
}

export interface TopicGraphEdge {
  id: string;
  difficultyId: string;
  personId: string;
  state: TopicGraphEdgeState;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TopicGraphLayout {
  width: number;
  height: number;
  center: { x: number; y: number };
  innerRadius: number;
  outerRadius: number;
  difficulties: TopicGraphDifficultyNode[];
  persons: TopicGraphPersonNode[];
  edges: TopicGraphEdge[];
}

const TWO_PI = Math.PI * 2;

function truncate(text: string, maxChars: number) {
  const chars = Array.from(text.trim());
  return chars.length > maxChars
    ? `${chars
        .slice(0, maxChars - 1)
        .join("")
        .trimEnd()}…`
    : chars.join("");
}

function timeOf(value: string | null) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/** Aktualne przed „mniej aktualnymi”, potem po ostatniej wzmiance, dacie utworzenia i id. */
export function sortCardsForGraph(cards: readonly DifficultyCard[]) {
  return [...cards].sort((a, b) => {
    if ((a.archivedAt !== null) !== (b.archivedAt !== null)) return a.archivedAt !== null ? 1 : -1;
    const lastA = timeOf(a.lastMentionedAt);
    const lastB = timeOf(b.lastMentionedAt);
    if (lastA !== lastB) {
      if (lastA === null) return 1;
      if (lastB === null) return -1;
      return lastB - lastA;
    }
    const createdA = timeOf(a.createdAt) ?? 0;
    const createdB = timeOf(b.createdAt) ?? 0;
    if (createdA !== createdB) return createdB - createdA;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function normalizeAngle(angle: number) {
  const wrapped = angle % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

/** Średnia kątów na okręgu; przy przeciwległych trudnościach wygrywa pierwsza z nich. */
function meanAngle(angles: readonly number[]) {
  const x = angles.reduce((sum, angle) => sum + Math.cos(angle), 0);
  const y = angles.reduce((sum, angle) => sum + Math.sin(angle), 0);
  if (Math.hypot(x, y) < 1e-6) return normalizeAngle(angles[0]);
  return normalizeAngle(Math.atan2(y, x));
}

/**
 * Rozsuwa kąty tak, żeby sąsiedzi na obwodzie trzymali `minSeparation`.
 * Zakłada, że wszystkie miejsca mieszczą się na okręgu (promień jest dobrany
 * wcześniej), więc przebieg w przód i w tył zawsze kończy się poprawnym układem.
 */
function spreadAngles(angles: number[], minSeparation: number) {
  if (angles.length < 2) return angles;
  const spread = [...angles];
  for (let index = 1; index < spread.length; index += 1) {
    if (spread[index] - spread[index - 1] < minSeparation) spread[index] = spread[index - 1] + minSeparation;
  }
  const last = spread.length - 1;
  if (spread[0] + TWO_PI - spread[last] < minSeparation) {
    spread[last] = spread[0] + TWO_PI - minSeparation;
    for (let index = last; index > 0; index -= 1) {
      if (spread[index] - spread[index - 1] < minSeparation) spread[index - 1] = spread[index] - minSeparation;
    }
  }
  return spread;
}

export function buildTopicGraphLayout(cards: readonly DifficultyCard[]): TopicGraphLayout {
  const ordered = sortCardsForGraph(cards);
  const count = ordered.length;
  const innerRadius = Math.max(
    TOPIC_GRAPH.innerRingMin,
    (count * (TOPIC_GRAPH.difficultyWidth + TOPIC_GRAPH.difficultyGap)) / TWO_PI,
  );
  const difficultyAngles = new Map<string, number>();
  const difficultyDrafts = ordered.map((card, index) => {
    const angle = normalizeAngle(-Math.PI / 2 + (TWO_PI * index) / Math.max(count, 1));
    difficultyAngles.set(card.id, angle);
    return {
      card,
      angle,
      personCount: card.persons.filter((person) => person.state !== "rejected").length,
    };
  });

  // Osoby z co najmniej jednym nieodrzuconym powiązaniem, w kolejności pierwszego pojawienia się.
  const personDrafts = new Map<
    string,
    { name: string; relation: string | null; difficultyIds: string[]; angles: number[] }
  >();
  const edgeDrafts: { difficultyId: string; personId: string; state: TopicGraphEdgeState }[] = [];
  for (const { card, angle } of difficultyDrafts) {
    for (const person of card.persons) {
      if (person.state === "rejected") continue;
      const draft = personDrafts.get(person.personId) ?? {
        name: person.name,
        relation: person.relation,
        difficultyIds: [],
        angles: [],
      };
      draft.difficultyIds.push(card.id);
      draft.angles.push(angle);
      personDrafts.set(person.personId, draft);
      edgeDrafts.push({ difficultyId: card.id, personId: person.personId, state: person.state });
    }
  }

  const personCount = personDrafts.size;
  const outerRadius = Math.max(innerRadius + TOPIC_GRAPH.ringGap, (personCount * TOPIC_GRAPH.personSlotWidth) / TWO_PI);
  const minSeparation = TOPIC_GRAPH.personSlotWidth / outerRadius;
  const personsByAngle = [...personDrafts]
    .map(([id, draft]) => ({ id, ...draft, angle: meanAngle(draft.angles) }))
    .sort((a, b) => a.angle - b.angle || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const spreadPersonAngles = spreadAngles(
    personsByAngle.map((person) => person.angle),
    minSeparation,
  );

  // Współrzędne najpierw wokół (0, 0); potem obraz jest przycinany do tego, co
  // faktycznie narysowano — trzy trudności na dole pierścienia nie zostawiają
  // pustego pasa nad mapą, a przy komplecie węzłów obraz i tak jest pełnym kołem.
  const round = (value: number) => Math.round(value * 100) / 100;
  const difficultyPoints = difficultyDrafts.map(({ angle }) => ({
    x: innerRadius * Math.cos(angle),
    y: innerRadius * Math.sin(angle),
  }));
  const personPoints = personsByAngle.map((_, index) => {
    const angle = normalizeAngle(spreadPersonAngles[index]);
    return { angle, x: outerRadius * Math.cos(angle), y: outerRadius * Math.sin(angle) };
  });
  const bounds: { minX: number; maxX: number; minY: number; maxY: number } = {
    minX: -TOPIC_GRAPH.youRadius,
    maxX: TOPIC_GRAPH.youRadius,
    minY: -TOPIC_GRAPH.youRadius,
    maxY: TOPIC_GRAPH.youRadius,
  };
  const extend = (x: number, y: number, left: number, right: number, top: number, bottom: number) => {
    bounds.minX = Math.min(bounds.minX, x - left);
    bounds.maxX = Math.max(bounds.maxX, x + right);
    bounds.minY = Math.min(bounds.minY, y - top);
    bounds.maxY = Math.max(bounds.maxY, y + bottom);
  };
  const halfDifficultyWidth = TOPIC_GRAPH.difficultyWidth / 2;
  const halfDifficultyHeight = TOPIC_GRAPH.difficultyHeight / 2;
  for (const point of difficultyPoints) {
    extend(point.x, point.y, halfDifficultyWidth, halfDifficultyWidth, halfDifficultyHeight, halfDifficultyHeight);
  }
  const halfSlot = TOPIC_GRAPH.personSlotWidth / 2;
  for (const point of personPoints) {
    extend(
      point.x,
      point.y,
      halfSlot,
      halfSlot,
      TOPIC_GRAPH.personRadius,
      TOPIC_GRAPH.personRadius + TOPIC_GRAPH.personLabelHeight,
    );
  }
  const offsetX = TOPIC_GRAPH.padding - bounds.minX;
  const offsetY = TOPIC_GRAPH.padding - bounds.minY;
  const width = Math.round(bounds.maxX - bounds.minX + TOPIC_GRAPH.padding * 2);
  const height = Math.round(bounds.maxY - bounds.minY + TOPIC_GRAPH.padding * 2);
  const center = { x: round(offsetX), y: round(offsetY) };

  const difficulties: TopicGraphDifficultyNode[] = difficultyDrafts.map(
    ({ card, angle, personCount: linked }, index) => ({
      kind: "difficulty",
      id: card.id,
      label: card.label,
      shortLabel: truncate(card.label, TOPIC_GRAPH.labelMaxChars),
      archived: card.archivedAt !== null,
      effect: card.currentState?.effect ?? null,
      entryCount: card.entries.length,
      personCount: linked,
      angle,
      x: round(difficultyPoints[index].x + offsetX),
      y: round(difficultyPoints[index].y + offsetY),
    }),
  );

  const persons: TopicGraphPersonNode[] = personsByAngle.map((person, index) => ({
    kind: "person",
    id: person.id,
    name: person.name,
    shortName: truncate(person.name, TOPIC_GRAPH.nameMaxChars),
    relation: person.relation,
    initial: Array.from(person.name.trim())[0]?.toLocaleUpperCase() ?? "?",
    angle: personPoints[index].angle,
    x: round(personPoints[index].x + offsetX),
    y: round(personPoints[index].y + offsetY),
    difficultyIds: person.difficultyIds,
  }));

  const difficultyById = new Map(difficulties.map((node) => [node.id, node]));
  const personById = new Map(persons.map((node) => [node.id, node]));
  const edges: TopicGraphEdge[] = edgeDrafts.flatMap((edge) => {
    const from = difficultyById.get(edge.difficultyId);
    const to = personById.get(edge.personId);
    if (!from || !to) return [];
    return [{ id: `${edge.difficultyId}:${edge.personId}`, ...edge, x1: from.x, y1: from.y, x2: to.x, y2: to.y }];
  });

  return { width, height, center, innerRadius, outerRadius, difficulties, persons, edges };
}
