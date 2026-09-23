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
  /** Wysokość węzła z jednowierszową etykietą; każdy kolejny wiersz dokłada `difficultyLineHeight`. */
  difficultyHeight: 46,
  difficultyLineHeight: 16,
  /** Odstęp między trudnościami na pierścieniu, liczony po obwodzie. */
  difficultyGap: 28,
  personRadius: 20,
  /**
   * Odstęp między osobami po obwodzie. Podpis stoi na zewnątrz okręgu, więc
   * sąsiednie podpisy (najszerszy ma ok. 108 px) muszą się zmieścić obok siebie.
   */
  personSlotWidth: 116,
  /** Odstęp między kółkiem osoby a jej podpisem. */
  personLabelGap: 6,
  /** Szacunek szerokości znaku z zapasem (Source Sans 3: imię 12 px, relacja 10 px). */
  personNameCharWidth: 7.2,
  personRelationCharWidth: 6,
  /** Wysokość podpisu: samo imię albo imię z relacją. */
  personNameHeight: 15,
  personLabelHeight: 29,
  youRadius: 26,
  innerRingMin: 120,
  ringGap: 108,
  padding: 28,
  /** Etykieta tematu łamie się po słowach; „…” dopiero na końcu ostatniego wiersza. */
  labelMaxChars: 22,
  labelMaxLines: 2,
  nameMaxChars: 14,
  relationMaxChars: 18,
} as const;

/**
 * Jak szybko podpis osoby „skręca” w bok wraz z kątem: przy 2 podpis na
 * godzinie 12 stoi dokładnie nad kółkiem, 30° od pionu jest już cały z boku,
 * a na godzinie 3 stoi obok kółka, wyśrodkowany w pionie.
 */
const LABEL_SLANT = 2;

export type TopicGraphEdgeState = Exclude<DifficultyPersonState, "rejected">;

/** Prostokąt w układzie współrzędnych obrazu (lewy górny róg, szerokość, wysokość). */
export interface TopicGraphBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TopicGraphDifficultyNode {
  kind: "difficulty";
  id: string;
  label: string;
  /**
   * Etykieta złamana po słowach na co najwyżej `labelMaxLines` wierszy; „…”
   * dopiero na końcu ostatniego. Pełna zostaje w `label` (podpis i aria).
   */
  labelLines: string[];
  /** Wysokość węzła: rośnie o wiersz, gdy etykieta zajmuje dwa. */
  height: number;
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
  shortRelation: string | null;
  initial: string;
  angle: number;
  x: number;
  y: number;
  /**
   * Podpis (imię i relacja) po stronie odwróconej od środka mapy. Cały leży
   * poza okręgiem osób, a każda krawędź biegnie wewnątrz tego okręgu — żadna
   * linia nie przecina więc żadnego podpisu.
   */
  labelBox: TopicGraphBox;
  difficultyIds: string[];
  /** `false` dla osoby z kart bez żadnego powiązania: stoi na obwodzie bez linii. */
  linked: boolean;
}

/** Osoba z kart, której nie łączy z tematami żadna krawędź; mapa i tak ją pokazuje. */
export interface TopicGraphUnlinkedPerson {
  id: string;
  name: string;
  relation: string | null;
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

/** Wpis legendy pod mapą; kolejność tablicy to kolejność na ekranie. */
export type TopicGraphLegendEntry = "confirmed" | "suggested" | "unlinked" | "archived";

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

function charCount(text: string) {
  return Array.from(text).length;
}

/** Jak `truncate`, ale kończy na całym słowie (bez wiszącego przecinka), gdy w wierszu jest ich kilka. */
function truncateAtWord(text: string, maxChars: number) {
  const chars = Array.from(text.trim());
  if (chars.length <= maxChars) return chars.join("");
  const cut = chars.slice(0, maxChars - 1).join("");
  const atBoundary = /\s/u.test(chars[maxChars - 1]) || /\s$/u.test(cut);
  const lastSpace = cut.trimEnd().lastIndexOf(" ");
  const base = atBoundary || lastSpace <= 0 ? cut : cut.slice(0, lastSpace);
  return `${base.trimEnd().replace(/[,;:]+$/u, "")}…`;
}

/**
 * Łamie etykietę po słowach na wiersze do `maxChars` znaków; słowo dłuższe niż
 * wiersz tnie twardo. Gdy wierszy wyszłoby więcej niż `maxLines`, ostatni
 * pokazuje resztę tekstu przyciętą na całym słowie z „…”.
 */
export function wrapGraphLabel(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.trim().split(/\s+/u)) {
    const chars = Array.from(word);
    for (let index = 0; index < chars.length; index += maxChars) {
      const chunk = chars.slice(index, index + maxChars).join("");
      if (!current) current = chunk;
      else if (charCount(current) + 1 + charCount(chunk) <= maxChars) current = `${current} ${chunk}`;
      else {
        lines.push(current);
        current = chunk;
      }
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines - 1), truncateAtWord(lines.slice(maxLines - 1).join(" "), maxChars)];
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

function clampUnit(value: number) {
  return Math.min(1, Math.max(-1, value));
}

/**
 * Podpis osoby względem środka jej kółka. Najbliższy środka mapy róg podpisu
 * leży dokładnie na prostej stycznej do kółka, odsuniętej o `personLabelGap`,
 * więc cały podpis jest na zewnątrz okręgu osób: krawędzie (odcinki między
 * punktami wewnątrz tego okręgu) nigdy go nie przecinają, a kółka sąsiadów
 * i węzły tematów leżą po drugiej stronie tej prostej. Na godzinie 12 podpis
 * stoi nad kółkiem, na godzinie 3 obok niego, a pomiędzy przesuwa się płynnie.
 */
function placePersonLabel(angle: number, width: number, height: number): TopicGraphBox {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const slantX = clampUnit(LABEL_SLANT * cos);
  const slantY = clampUnit(LABEL_SLANT * sin);
  // Póki podpis nie wysunął się jeszcze całym bokiem na zewnątrz, odsuwamy go
  // po promieniu dokładnie o tyle, ile brakuje do stycznej.
  const push = (width / 2) * (Math.abs(cos) - slantX * cos) + (height / 2) * (Math.abs(sin) - slantY * sin);
  const distance = TOPIC_GRAPH.personRadius + TOPIC_GRAPH.personLabelGap + push;
  const centerX = distance * cos + (width / 2) * slantX;
  const centerY = distance * sin + (height / 2) * slantY;
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

/**
 * `unlinkedPeople` to karty osób bez powiązania z żadnym tematem: dostają
 * miejsce na tym samym obwodzie, bez krawędzi, rozłożone równo od dołu mapy,
 * a potem rozsuwane razem z osobami powiązanymi. Dzięki temu widok pamięci
 * pokazuje wszystkie osoby w jednym obrazie, bez zdania „N osób bez tematów”.
 */
export function buildTopicGraphLayout(
  cards: readonly DifficultyCard[],
  unlinkedPeople: readonly TopicGraphUnlinkedPerson[] = [],
): TopicGraphLayout {
  const ordered = sortCardsForGraph(cards);
  const count = ordered.length;
  const innerRadius = Math.max(
    TOPIC_GRAPH.innerRingMin,
    (count * (TOPIC_GRAPH.difficultyWidth + TOPIC_GRAPH.difficultyGap)) / TWO_PI,
  );
  const difficultyDrafts = ordered.map((card, index) => {
    const labelLines = wrapGraphLabel(card.label, TOPIC_GRAPH.labelMaxChars, TOPIC_GRAPH.labelMaxLines);
    return {
      card,
      angle: normalizeAngle(-Math.PI / 2 + (TWO_PI * index) / Math.max(count, 1)),
      labelLines,
      height: TOPIC_GRAPH.difficultyHeight + TOPIC_GRAPH.difficultyLineHeight * Math.max(labelLines.length - 1, 0),
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

  // Osoby bez powiązań: deterministycznie po imieniu i id, bez duplikatów i bez
  // tych, które i tak stoją na mapie dzięki krawędzi.
  const seenUnlinked = new Set<string>();
  const extras = unlinkedPeople
    .filter((person) => {
      if (personDrafts.has(person.id) || seenUnlinked.has(person.id)) return false;
      seenUnlinked.add(person.id);
      return true;
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const personCount = personDrafts.size + extras.length;
  const outerRadius = Math.max(innerRadius + TOPIC_GRAPH.ringGap, (personCount * TOPIC_GRAPH.personSlotWidth) / TWO_PI);
  const minSeparation = TOPIC_GRAPH.personSlotWidth / outerRadius;
  const personsByAngle = [
    ...[...personDrafts].map(([id, draft]) => ({ id, ...draft, angle: meanAngle(draft.angles), linked: true })),
    // Równo po obwodzie od dołu mapy (godzina 6), z dala od pierwszej trudności na godzinie 12.
    ...extras.map((person, index) => ({
      id: person.id,
      name: person.name,
      relation: person.relation,
      difficultyIds: [] as string[],
      angles: [] as number[],
      angle: normalizeAngle(Math.PI / 2 + (TWO_PI * index) / extras.length),
      linked: false,
    })),
  ].sort((a, b) => a.angle - b.angle || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
  const personPoints = personsByAngle.map((person, index) => {
    const angle = normalizeAngle(spreadPersonAngles[index]);
    const shortName = truncate(person.name, TOPIC_GRAPH.nameMaxChars);
    const shortRelation = person.relation ? truncate(person.relation, TOPIC_GRAPH.relationMaxChars) : null;
    const labelWidth = Math.ceil(
      Math.max(
        charCount(shortName) * TOPIC_GRAPH.personNameCharWidth,
        shortRelation ? charCount(shortRelation) * TOPIC_GRAPH.personRelationCharWidth : 0,
      ),
    );
    const labelHeight = shortRelation ? TOPIC_GRAPH.personLabelHeight : TOPIC_GRAPH.personNameHeight;
    return {
      angle,
      x: outerRadius * Math.cos(angle),
      y: outerRadius * Math.sin(angle),
      shortName,
      shortRelation,
      label: placePersonLabel(angle, labelWidth, labelHeight),
    };
  });
  const bounds: { minX: number; maxX: number; minY: number; maxY: number } = {
    minX: -TOPIC_GRAPH.youRadius,
    maxX: TOPIC_GRAPH.youRadius,
    minY: -TOPIC_GRAPH.youRadius,
    maxY: TOPIC_GRAPH.youRadius,
  };
  const extend = (left: number, top: number, right: number, bottom: number) => {
    bounds.minX = Math.min(bounds.minX, left);
    bounds.maxX = Math.max(bounds.maxX, right);
    bounds.minY = Math.min(bounds.minY, top);
    bounds.maxY = Math.max(bounds.maxY, bottom);
  };
  const halfDifficultyWidth = TOPIC_GRAPH.difficultyWidth / 2;
  difficultyPoints.forEach((point, index) => {
    const halfHeight = difficultyDrafts[index].height / 2;
    extend(point.x - halfDifficultyWidth, point.y - halfHeight, point.x + halfDifficultyWidth, point.y + halfHeight);
  });
  const radius = TOPIC_GRAPH.personRadius;
  for (const point of personPoints) {
    extend(point.x - radius, point.y - radius, point.x + radius, point.y + radius);
    const labelLeft = point.x + point.label.x;
    const labelTop = point.y + point.label.y;
    extend(labelLeft, labelTop, labelLeft + point.label.width, labelTop + point.label.height);
  }
  const offsetX = TOPIC_GRAPH.padding - bounds.minX;
  const offsetY = TOPIC_GRAPH.padding - bounds.minY;
  const width = Math.round(bounds.maxX - bounds.minX + TOPIC_GRAPH.padding * 2);
  const height = Math.round(bounds.maxY - bounds.minY + TOPIC_GRAPH.padding * 2);
  const center = { x: round(offsetX), y: round(offsetY) };

  const difficulties: TopicGraphDifficultyNode[] = difficultyDrafts.map((draft, index) => ({
    kind: "difficulty",
    id: draft.card.id,
    label: draft.card.label,
    labelLines: draft.labelLines,
    height: draft.height,
    archived: draft.card.archivedAt !== null,
    effect: draft.card.currentState?.effect ?? null,
    entryCount: draft.card.entries.length,
    personCount: draft.personCount,
    angle: draft.angle,
    x: round(difficultyPoints[index].x + offsetX),
    y: round(difficultyPoints[index].y + offsetY),
  }));

  const persons: TopicGraphPersonNode[] = personsByAngle.map((person, index) => {
    const point = personPoints[index];
    return {
      kind: "person",
      id: person.id,
      name: person.name,
      shortName: point.shortName,
      relation: person.relation,
      shortRelation: point.shortRelation,
      initial: Array.from(person.name.trim())[0]?.toLocaleUpperCase() ?? "?",
      angle: point.angle,
      x: round(point.x + offsetX),
      y: round(point.y + offsetY),
      labelBox: {
        x: round(point.x + point.label.x + offsetX),
        y: round(point.y + point.label.y + offsetY),
        width: point.label.width,
        height: point.label.height,
      },
      difficultyIds: person.difficultyIds,
      linked: person.linked,
    };
  });

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

/**
 * Legenda opisuje tylko to, co widać na tej mapie. Same ciągłe linie nie
 * potrzebują objaśnienia, więc legenda pojawia się dopiero wtedy, gdy jest co
 * odróżnić: linię do potwierdzenia, osobę bez linii albo wyblakły temat.
 */
export function listTopicGraphLegend(layout: TopicGraphLayout): TopicGraphLegendEntry[] {
  const hasSuggested = layout.edges.some((edge) => edge.state === "suggested");
  const hasUnlinked = layout.persons.some((node) => !node.linked);
  const hasArchived = layout.difficulties.some((node) => node.archived);
  if (!hasSuggested && !hasUnlinked && !hasArchived) return [];

  const entries: TopicGraphLegendEntry[] = [];
  if (layout.edges.some((edge) => edge.state === "confirmed")) entries.push("confirmed");
  if (hasSuggested) entries.push("suggested");
  if (hasUnlinked) entries.push("unlinked");
  if (hasArchived) entries.push("archived");
  return entries;
}
