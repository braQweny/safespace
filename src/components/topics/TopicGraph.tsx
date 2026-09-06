import { useRef, useState, type KeyboardEvent } from "react";
import { useLocale } from "@/components/hooks/useLocale";
import type { DifficultyCard } from "@/lib/session-data/types";
import { buildTopicGraphLayout, TOPIC_GRAPH } from "@/lib/topic-map/layout";
import { cn } from "@/lib/utils";
import { getOpenDifficultyButtonId } from "./TopicList";
import { getTopicMapCopy } from "./topic-map-copy";

interface TopicGraphProps {
  cards: readonly DifficultyCard[];
  /** Wyspa hydratuje się z opóźnieniem; do tego czasu węzły nie są przyciskami. */
  isInteractive: boolean;
  onOpen: (difficultyId: string) => void;
  /** Liczba kart osób tej perspektywy; `null` = karty osób wyłączone, zdanie o osobach bez tematów znika. */
  peopleCardCount: number | null;
}

const RELATION_MAX_CHARS = 18;

function shortRelation(relation: string) {
  const chars = Array.from(relation);
  return chars.length > RELATION_MAX_CHARS
    ? `${chars
        .slice(0, RELATION_MAX_CHARS - 1)
        .join("")
        .trimEnd()}…`
    : relation;
}

/**
 * Czysty SVG bez zależności: „Ty” w środku, trudności w pierścieniu, osoby na
 * obwodzie (`buildTopicGraphLayout`). Węzły są przyciskami: trudność otwiera ten
 * sam dialog co lista, osoba wyróżnia swoje tematy. Strzałki przechodzą między
 * węzłami, Enter i spacja aktywują. Lista obok jest równoważnym widokiem, więc
 * graf nie musi opisywać krawędzi w tekście. Same tokeny motywu, żadnych
 * twardych kolorów; kontener przewija się w bok, ciało strony nigdy.
 */
export default function TopicGraph({ cards, isInteractive, onOpen, peopleCardCount }: TopicGraphProps) {
  const copy = getTopicMapCopy(useLocale());
  const layout = buildTopicGraphLayout(cards);
  const [focusedPersonId, setFocusedPersonId] = useState<string | null>(null);
  const nodeRefs = useRef(new Map<string, SVGGElement>());
  const focusedPerson = focusedPersonId ? (layout.persons.find((node) => node.id === focusedPersonId) ?? null) : null;
  const nodeOrder = [
    ...layout.difficulties.map((node) => node.id),
    ...layout.persons.map((node) => `person:${node.id}`),
  ];
  const unlinkedPeople = peopleCardCount === null ? 0 : Math.max(0, peopleCardCount - layout.persons.length);
  const labelById = new Map(layout.difficulties.map((node) => [node.id, node.label]));

  function registerNode(key: string) {
    return (element: SVGGElement | null) => {
      if (element) nodeRefs.current.set(key, element);
      else nodeRefs.current.delete(key);
    };
  }

  function focusNode(index: number) {
    const key = nodeOrder[(index + nodeOrder.length) % nodeOrder.length];
    nodeRefs.current.get(key)?.focus();
  }

  function handleNodeKey(event: KeyboardEvent<SVGGElement>, index: number, activate: () => void) {
    switch (event.key) {
      case "Enter":
      case " ":
        event.preventDefault();
        activate();
        return;
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusNode(index + 1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusNode(index - 1);
        return;
      case "Home":
        event.preventDefault();
        focusNode(0);
        return;
      case "End":
        event.preventDefault();
        focusNode(nodeOrder.length - 1);
        return;
      default:
    }
  }

  function isDifficultyDimmed(difficultyId: string) {
    return focusedPerson !== null && !focusedPerson.difficultyIds.includes(difficultyId);
  }

  const nodeClass = (dimmed: boolean) =>
    cn(
      "focus:outline-none [&:focus-visible>.focus-ring]:opacity-100",
      isInteractive ? "cursor-pointer" : "cursor-default",
      dimmed && "opacity-40",
    );
  const { difficultyWidth: w, difficultyHeight: h, personRadius: r, youRadius } = TOPIC_GRAPH;

  return (
    <div data-topic-graph>
      <div className="overflow-x-auto overscroll-x-contain">
        <svg
          role="group"
          aria-label={copy.graphAria}
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="mx-auto block max-w-none select-none"
        >
          {layout.difficulties.map((node) => (
            <line
              key={`you:${node.id}`}
              x1={layout.center.x}
              y1={layout.center.y}
              x2={node.x}
              y2={node.y}
              strokeWidth={1}
              className={cn("stroke-line-strong", isDifficultyDimmed(node.id) && "opacity-30")}
            />
          ))}
          {layout.edges.map((edge) => {
            const dimmed = focusedPerson !== null && edge.personId !== focusedPerson.id;
            return (
              <line
                key={edge.id}
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                strokeWidth={edge.state === "confirmed" ? 2 : 1.5}
                strokeDasharray={edge.state === "suggested" ? "6 5" : undefined}
                strokeLinecap="round"
                className={cn(edge.state === "confirmed" ? "stroke-brand" : "stroke-ink-muted", dimmed && "opacity-30")}
              />
            );
          })}

          <g aria-hidden="true" transform={`translate(${layout.center.x} ${layout.center.y})`}>
            <circle r={youRadius} strokeWidth={1.5} className="fill-brand-soft stroke-brand" />
            <text textAnchor="middle" dominantBaseline="central" className="fill-brand-deep text-[14px] font-semibold">
              {copy.youNode}
            </text>
          </g>

          {layout.difficulties.map((node, index) => {
            const dimmed = isDifficultyDimmed(node.id);
            const counts = node.effect
              ? `${copy.nodeCounts(node.entryCount, node.personCount)} · ${copy.effects[node.effect]}`
              : copy.nodeCounts(node.entryCount, node.personCount);
            return (
              <g
                key={node.id}
                id={getOpenDifficultyButtonId(node.id)}
                ref={registerNode(node.id)}
                role="button"
                tabIndex={isInteractive ? 0 : -1}
                aria-disabled={isInteractive ? undefined : true}
                aria-label={copy.openCardSr(node.label)}
                transform={`translate(${node.x - w / 2} ${node.y - h / 2})`}
                onClick={() => {
                  if (isInteractive) onOpen(node.id);
                }}
                onKeyDown={(event) => {
                  handleNodeKey(event, index, () => {
                    if (isInteractive) onOpen(node.id);
                  });
                }}
                className={cn(nodeClass(dimmed), node.archived && !dimmed && "opacity-60")}
              >
                <title>{node.label}</title>
                <rect
                  x={-4}
                  y={-4}
                  width={w + 8}
                  height={h + 8}
                  rx={18}
                  strokeWidth={2}
                  className="focus-ring stroke-brand-ring fill-none opacity-0"
                />
                <rect
                  width={w}
                  height={h}
                  rx={14}
                  strokeWidth={node.archived ? 1 : 1.5}
                  strokeDasharray={node.archived ? "5 4" : undefined}
                  className="fill-surface stroke-line-accent"
                />
                <text
                  x={w / 2}
                  y={19}
                  textAnchor="middle"
                  className={cn("text-[13px] font-semibold", node.archived ? "fill-ink-muted" : "fill-ink")}
                >
                  {node.shortLabel}
                </text>
                <text x={w / 2} y={35} textAnchor="middle" className="fill-ink-muted text-[11px]">
                  {counts}
                </text>
              </g>
            );
          })}

          {layout.persons.map((node, index) => {
            const isFocused = focusedPersonId === node.id;
            const dimmed = focusedPerson !== null && !isFocused;
            const toggle = () => {
              if (isInteractive) setFocusedPersonId((current) => (current === node.id ? null : node.id));
            };
            return (
              <g
                key={node.id}
                ref={registerNode(`person:${node.id}`)}
                role="button"
                tabIndex={isInteractive ? 0 : -1}
                aria-disabled={isInteractive ? undefined : true}
                aria-pressed={isFocused}
                aria-label={copy.personNodeSr(node.name)}
                transform={`translate(${node.x} ${node.y})`}
                onClick={toggle}
                onKeyDown={(event) => {
                  handleNodeKey(event, layout.difficulties.length + index, toggle);
                }}
                className={nodeClass(dimmed)}
              >
                <title>{node.relation ? `${node.name} · ${node.relation}` : node.name}</title>
                <circle r={r + 4} strokeWidth={2} className="focus-ring stroke-brand-ring fill-none opacity-0" />
                <circle
                  r={r}
                  strokeWidth={1.5}
                  className={isFocused ? "fill-brand-tint stroke-brand" : "fill-surface-soft stroke-line-accent"}
                />
                <text textAnchor="middle" dominantBaseline="central" className="fill-ink text-[14px] font-semibold">
                  {node.initial}
                </text>
                <text y={r + 15} textAnchor="middle" className="fill-ink text-[12px] font-medium">
                  {node.shortName}
                </text>
                {node.relation ? (
                  <text y={r + 28} textAnchor="middle" className="fill-ink-muted text-[10px]">
                    {shortRelation(node.relation)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {focusedPerson ? (
        <p role="status" className="text-ink mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-6">
          <span>
            {copy.personFocus(
              focusedPerson.name,
              focusedPerson.difficultyIds.map((id) => labelById.get(id) ?? "").join(", "),
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              setFocusedPersonId(null);
            }}
            className="text-brand hover:text-brand-deep focus-visible:ring-brand-ring rounded font-medium underline underline-offset-4 focus:outline-none focus-visible:ring-2"
          >
            {copy.showAll}
          </button>
        </p>
      ) : null}

      <p className="text-ink-muted mt-3 text-xs leading-5">
        {copy.legendTitle}: {copy.legendConfirmed} · {copy.legendSuggested} · {copy.legendArchived}
      </p>

      {unlinkedPeople > 0 ? (
        <p className="text-ink-muted mt-1 text-xs leading-5" data-topic-unlinked-people>
          {copy.unlinkedPeople(unlinkedPeople)}{" "}
          <a
            href="#people-title"
            className="text-brand hover:text-brand-deep focus-visible:ring-brand-ring rounded font-medium underline underline-offset-4 focus:outline-none focus-visible:ring-2"
          >
            {copy.peopleLink}
          </a>
        </p>
      ) : null}
    </div>
  );
}
