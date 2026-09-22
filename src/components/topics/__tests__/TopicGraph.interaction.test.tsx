// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/components/LocaleProvider";
import type { DifficultyCard, DifficultyPersonLink } from "@/lib/session-data/types";
import { buildTopicGraphLayout } from "@/lib/topic-map/layout";
import TopicGraph from "../TopicGraph";
import { getTopicMapCopy } from "../topic-map-copy";

const copy = getTopicMapCopy("en");

function person(id: string, name: string): DifficultyPersonLink {
  return { personId: id, name, relation: null, state: "confirmed", userDecided: false };
}

function card(id: string, label: string, persons: DifficultyPersonLink[] = []): DifficultyCard {
  return {
    id,
    avatarId: "cbt-guide",
    label,
    labelLocked: false,
    userNote: "",
    archivedAt: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    aliases: [],
    persons,
    firstMentionedAt: null,
    lastMentionedAt: null,
    mentionCount: 0,
    currentState: null,
    hasNewEntriesSinceArchived: false,
    entries: [],
  };
}

// Marta comes up with two topics, the third topic has nobody; Ola has a card but no topic.
const cards = [
  card("work", "Saying no at work", [person("marta", "Marta")]),
  card("sleep", "Sleep", [person("marta", "Marta")]),
  card("mother", "Talks with mother"),
];
const unlinkedPeople = [{ id: "ola", name: "Ola", relation: null }];
const layout = buildTopicGraphLayout(cards, unlinkedPeople);
const difficultyLabels = layout.difficulties.map((node) => node.label);
const personNames = layout.persons.map((node) => node.name);

function renderGraph(props: { isInteractive?: boolean; onOpenPerson?: (id: string) => void } = {}) {
  const onOpen = vi.fn();
  render(
    <LocaleProvider locale="en">
      <TopicGraph
        cards={cards}
        unlinkedPeople={unlinkedPeople}
        isInteractive={props.isInteractive ?? true}
        onOpen={onOpen}
        onOpenPerson={props.onOpenPerson}
      />
    </LocaleProvider>,
  );
  return { onOpen, user: userEvent.setup() };
}

function difficultyNode(label: string) {
  return screen.getByRole("button", { name: copy.openCardSr(label) });
}

function personNode(name: string) {
  return screen.getByRole("button", { name: copy.personNodeSr(name) });
}

afterEach(() => {
  cleanup();
});

describe("TopicGraph keyboard navigation", () => {
  it("walks every node with the arrow keys in list order, wraps around, and jumps with Home and End", async () => {
    const { user } = renderGraph();
    const order = [
      ...difficultyLabels.map((label) => difficultyNode(label)),
      ...personNames.map((name) => personNode(name)),
    ];
    expect(order).toHaveLength(5);

    order[0].focus();
    expect(document.activeElement).toBe(order[0]);

    for (const next of order.slice(1)) {
      await user.keyboard("{ArrowRight}");
      expect(document.activeElement).toBe(next);
    }

    // Past the last person back to the first topic, and backwards across the seam.
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(order[0]);
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(order[order.length - 1]);
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(order[order.length - 2]);

    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(order[0]);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(order[order.length - 1]);
  });

  it("opens a topic with Enter or Space, the same dialog a click opens", async () => {
    const { onOpen, user } = renderGraph();

    difficultyNode("Sleep").focus();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenLastCalledWith("sleep");

    difficultyNode("Talks with mother").focus();
    await user.keyboard(" ");
    expect(onOpen).toHaveBeenLastCalledWith("mother");
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("highlights a person's topics on Enter, offers their card, and clears on a second press", async () => {
    const onOpenPerson = vi.fn();
    const { onOpen, user } = renderGraph({ onOpenPerson });
    const marta = personNode("Marta");

    marta.focus();
    await user.keyboard("{Enter}");

    expect(marta.getAttribute("aria-pressed")).toBe("true");
    expect(onOpen).not.toHaveBeenCalled();
    // Her two topics stay lit, the third one and the other person dim.
    expect(difficultyNode("Saying no at work").getAttribute("class")).not.toContain("opacity-40");
    expect(difficultyNode("Sleep").getAttribute("class")).not.toContain("opacity-40");
    expect(difficultyNode("Talks with mother").getAttribute("class")).toContain("opacity-40");
    expect(personNode("Ola").getAttribute("class")).toContain("opacity-40");
    const status = screen.getByRole("status");
    const martaLabels = (layout.persons.find((node) => node.id === "marta")?.difficultyIds ?? [])
      .map((id) => layout.difficulties.find((node) => node.id === id)?.label)
      .join(", ");
    expect(martaLabels.split(", ").sort()).toEqual(["Saying no at work", "Sleep"]);
    expect(status.textContent).toContain(copy.personFocus("Marta", martaLabels));

    await user.click(screen.getByRole("button", { name: copy.openPersonCard }));
    expect(onOpenPerson).toHaveBeenCalledWith("marta");

    marta.focus();
    await user.keyboard(" ");
    expect(marta.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("status")).toBeNull();
    expect(difficultyNode("Talks with mother").getAttribute("class")).not.toContain("opacity-40");
  });

  it("says a person without topics has none yet, and Show all clears the highlight", async () => {
    const { user } = renderGraph();

    personNode("Ola").focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("status").textContent).toContain(copy.personNoTopics("Ola"));

    await user.click(screen.getByRole("button", { name: copy.showAll }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(personNode("Ola").getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps nodes out of the tab order and inert until the island is interactive", async () => {
    const { onOpen, user } = renderGraph({ isInteractive: false });
    const sleep = difficultyNode("Sleep");

    expect(sleep.getAttribute("tabindex")).toBe("-1");
    expect(sleep.getAttribute("aria-disabled")).toBe("true");
    sleep.focus();
    await user.keyboard("{Enter}");
    await user.click(personNode("Marta"));
    expect(onOpen).not.toHaveBeenCalled();
    expect(personNode("Marta").getAttribute("aria-pressed")).toBe("false");
  });
});
