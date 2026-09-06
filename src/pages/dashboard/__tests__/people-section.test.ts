import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Strony Astro nie renderują się w vitest, więc pilnujemy tekstu źródła:
 * sekcja osób stoi między historią a blokiem pomocy (kolejność źródła jest
 * kolejnością na telefonie), siatka dostaje trzeci wiersz, a wszystko zależy
 * od tej samej flagi, którą czyta ekstrakcja.
 */
const DASHBOARD_PATH = fileURLToPath(new URL("../../dashboard.astro", import.meta.url));
const SESSION_PAGE_PATH = fileURLToPath(new URL("../session.astro", import.meta.url));

describe("dashboard people section", () => {
  const page = readFileSync(DASHBOARD_PATH, "utf8");

  it("mounts the island lazily between the history and the help block, behind the feature flag", () => {
    expect(page).toContain('import PeopleCards from "@/components/people/PeopleCards"');
    expect(page).toContain("const peopleMemoryMode = isPeopleMemoryEnabled()");
    expect(page).toContain("const showsPeopleSection = currentSelection !== null && peopleMemoryMode");
    const history = page.indexOf("<DashboardSessionHistory client:visible");
    const people = page.indexOf("<PeopleCards");
    const help = page.indexOf("<aside");
    expect(history).toBeGreaterThan(0);
    expect(people).toBeGreaterThan(history);
    expect(help).toBeGreaterThan(people);
    expect(page.slice(people, page.indexOf("/>", people))).toContain("client:visible");
  });

  it("reads the cards and the preference in the same round trip as the other dashboard reads", () => {
    expect(page).toContain("listOwnedPersonCards(sessionContext.data, currentAvatarChoice.selected.avatarId)");
    expect(page).toContain("readOwnedPeopleMemoryEnabled(sessionContext.data)");
    expect(page).toContain("lg:grid-rows-[auto_auto_1fr]");
    expect(page).toContain('className="mt-0 lg:col-start-1 lg:row-start-2"');
    expect(page).toContain("lg:row-end-4");
  });

  it("offers a way back into an ongoing conversation only for the same perspective", () => {
    expect(page).toContain("anyOwnedActiveSession.avatarId === currentSelection?.avatarId");
    expect(page).toContain("resumeSessionId={resumeSessionId}");
  });
});

describe("session page prefill from a person card", () => {
  const page = readFileSync(SESSION_PAGE_PATH, "utf8");

  it("accepts only a UUID, only for an active conversation of the same perspective, only before the first user message", () => {
    expect(page).toContain('parseSessionIdParam(Astro.url.searchParams.get("about") ?? undefined)');
    expect(page).toContain('pageState.kind === "active"');
    expect(page).toContain('!pageState.messages.some((message) => message.role === "user")');
    expect(page).toContain("card.data?.avatarId === avatarChoice.data.selected.avatarId");
    expect(page).toContain("talkAboutDraft(card.data.name, card.data.relation)");
    expect(page).toContain("initialDraft={initialDraft}");
    expect(page).toContain("prepareCards={peopleMemoryMode || topicMapMode}");
  });
});
