import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Sekcja mapy tematów stoi pod sekcją osób i przed blokiem pomocy, siatka
 * dostaje tyle wierszy, ile sekcji jest pod kartą startu, a wszystko zależy od
 * tej samej flagi, którą czyta ekstrakcja.
 */
const DASHBOARD_PATH = fileURLToPath(new URL("../../dashboard.astro", import.meta.url));
const SESSION_PAGE_PATH = fileURLToPath(new URL("../session.astro", import.meta.url));

describe("dashboard topic map section", () => {
  const page = readFileSync(DASHBOARD_PATH, "utf8");

  it("mounts the island lazily between the people section and the help block, behind its own flag", () => {
    expect(page).toContain('import TopicMap from "@/components/topics/TopicMap"');
    expect(page).toContain("const topicMapMode = isTopicMapEnabled()");
    expect(page).toContain("const showsTopicSection = currentSelection !== null && topicMapMode");
    const people = page.indexOf("<PeopleCards");
    const topics = page.indexOf("<TopicMap");
    const help = page.indexOf("<aside");
    expect(people).toBeGreaterThan(0);
    expect(topics).toBeGreaterThan(people);
    expect(help).toBeGreaterThan(topics);
    expect(page.slice(topics, page.indexOf("/>", topics))).toContain("client:visible");
  });

  it("reads the difficulties and the preference in the same round trip and sizes the grid by the sections shown", () => {
    expect(page).toContain("listOwnedDifficultyCards(sessionContext.data, currentAvatarChoice.selected.avatarId)");
    expect(page).toContain("readOwnedTopicMapEnabled(sessionContext.data)");
    expect(page).toContain("lg:grid-rows-[auto_auto_auto_1fr]");
    expect(page).toContain('"lg:row-end-3", "lg:row-end-4", "lg:row-end-5"');
    expect(page).toContain("lg:col-start-1 lg:row-start-4");
    expect(page).toContain('? "mt-0 lg:col-start-1 lg:row-start-3"\n  : "mt-0 lg:col-start-1 lg:row-start-2"');
    expect(page).toContain("topicMapEnabled={topicMapEnabled}");
    expect(page).toContain("resumeSessionId={resumeSessionId}");
  });
});

describe("session page prefill from a difficulty", () => {
  const page = readFileSync(SESSION_PAGE_PATH, "utf8");

  it("accepts only a UUID under its own parameter, after a person card, with the same guards", () => {
    expect(page).toContain('parseSessionIdParam(Astro.url.searchParams.get("topic") ?? undefined)');
    expect(page).toContain("initialDraft === null && aboutDifficultyId && topicMapMode && acceptsPrefill");
    expect(page).toContain("difficulty.data?.avatarId === avatarChoice.data.selected.avatarId");
    expect(page).toContain("talkAboutDraft(difficulty.data.label)");
    expect(page).toContain("prepareCards={peopleMemoryMode || topicMapMode}");
  });
});
