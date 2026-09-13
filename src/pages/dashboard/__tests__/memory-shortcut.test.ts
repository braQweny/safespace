import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Strony Astro nie renderują się w vitest, więc pilnujemy tekstu źródła: panel
 * to start i historia, a osoby, tematy i podsumowanie mają własny widok pod
 * `/dashboard/memory`. Na panelu zostaje wiersz-skrót z liczbami, liczonymi z
 * tych samych odczytów, którymi wcześniej karmione były dwie sekcje.
 */
const DASHBOARD_PATH = fileURLToPath(new URL("../../dashboard.astro", import.meta.url));
const MEMORY_PAGE_PATH = fileURLToPath(new URL("../memory.astro", import.meta.url));
const SESSION_PAGE_PATH = fileURLToPath(new URL("../session.astro", import.meta.url));

describe("dashboard memory shortcut", () => {
  const page = readFileSync(DASHBOARD_PATH, "utf8");

  it("keeps the dashboard to the start card, the history and the help block", () => {
    expect(page).not.toContain("PeopleCards");
    expect(page).not.toContain("<TopicMap");
    expect(page).not.toContain("getOwnedAvatarMemoryPreview");
    expect(page).toContain('"lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:grid-rows-[auto_1fr]"');
    expect(page).toContain('className: "mt-0 lg:col-start-2 lg:row-start-1 lg:row-end-3"');
    expect(page).toContain('currentSelection && "lg:col-start-1 lg:row-start-2"');
    // Blok pomocy to same numery: o rozmowie w toku mówią pigułka w nagłówku i karta.
    expect(page).not.toContain("activeInProgress");
    expect(page).not.toContain("remainingAbout");
    const history = page.indexOf("<DashboardSessionHistory client:visible");
    const help = page.indexOf("<aside");
    expect(history).toBeGreaterThan(0);
    expect(help).toBeGreaterThan(history);
  });

  it("links to the memory view from the start card with counts from the same round trip, behind the flags", () => {
    expect(page).toContain('href="/dashboard/memory"');
    expect(page).toContain("data-memory-shortcut");
    expect(page).toContain("const peopleMemoryMode = isPeopleMemoryEnabled()");
    expect(page).toContain("const topicMapMode = isTopicMapEnabled()");
    expect(page).toContain("listOwnedPersonCards(sessionContext.data, currentAvatarChoice.selected.avatarId)");
    expect(page).toContain("listOwnedDifficultyCards(sessionContext.data, currentAvatarChoice.selected.avatarId)");
    expect(page).toContain("readOwnedTopicMapEnabled(sessionContext.data)");
    expect(page).toContain("const memoryPeopleCount = peopleMemoryMode ? (personCards?.length ?? 0) : null");
    expect(page).toContain("const memoryTopicCount = topicMapMode ? (difficultyCards?.length ?? 0) : null");
    expect(page).toContain("listPendingLinks(difficultyCards).length");
    expect(page).toContain("copy.memoryPendingCount(memoryPendingCount)");
    expect(page).toContain("copy.memorySummaryOnly");
  });

  it("shows the dashboard intro only before the first conversation", () => {
    expect(page).toContain(
      "const showsIntro = currentSelection === null || (startPageState?.sessionQuota?.usedSessions ?? 0) === 0",
    );
    expect(page).toContain("{showsIntro ? <p");
  });
});

describe("memory page", () => {
  const page = readFileSync(MEMORY_PAGE_PATH, "utf8");

  it("renders the island eagerly for the saved perspective and returns to the dashboard without one", () => {
    expect(page).toContain('import MemoryView from "@/components/memory/MemoryView"');
    expect(page).toContain("<MemoryView\n            client:load");
    expect(page).toContain('return Astro.redirect("/dashboard")');
    expect(page).toContain("readCurrentAvatarChoice(sessionContext.data)");
    expect(page).toContain("<Layout title={copy.pageTitle(firstName)}>");
  });

  it("reads cards, preferences, the summary and the active badge in one round trip, each part behind its flag", () => {
    expect(page).toContain("peopleMemoryMode ? listOwnedPersonCards(sessionContext.data, selection.avatarId) : null");
    expect(page).toContain("peopleMemoryMode ? readOwnedPeopleMemoryEnabled(sessionContext.data) : null");
    expect(page).toContain("topicMapMode ? listOwnedDifficultyCards(sessionContext.data, selection.avatarId) : null");
    expect(page).toContain("topicMapMode ? readOwnedTopicMapEnabled(sessionContext.data) : null");
    expect(page).toContain("getOwnedAvatarMemoryPreview(sessionContext.data, selection.avatarId)");
    expect(page).toContain("readActiveSessionBadge(sessionContext.data)");
    expect(page).toContain("activeSession?.avatarId === selection.avatarId ? activeSession.sessionId : null");
    expect(page).toContain("memoryPreview={memoryPreview.ok ? memoryPreview.data : null}");
    expect(page).toContain('href="/account/security#memory"');
    expect(page).toContain('href="/dashboard"');
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

describe("session page prefill from a topic", () => {
  const page = readFileSync(SESSION_PAGE_PATH, "utf8");

  it("accepts only a UUID under its own parameter, after a person card, with the same guards", () => {
    expect(page).toContain('parseSessionIdParam(Astro.url.searchParams.get("topic") ?? undefined)');
    expect(page).toContain("initialDraft === null && aboutDifficultyId && topicMapMode && acceptsPrefill");
    expect(page).toContain("difficulty.data?.avatarId === avatarChoice.data.selected.avatarId");
    expect(page).toContain("talkAboutDraft(difficulty.data.label)");
  });
});
