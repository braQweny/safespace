import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SECURITY_PATH = fileURLToPath(new URL("../security.astro", import.meta.url));
const PEOPLE_TOGGLE_PATH = fileURLToPath(
  new URL("../../../components/account/PeopleMemoryToggle.astro", import.meta.url),
);
const TOPIC_TOGGLE_PATH = fileURLToPath(new URL("../../../components/account/TopicMapToggle.astro", import.meta.url));

/**
 * Jedna karta „Pamięć rozmów” zamiast dwóch bliźniaczych: wiersz osób i wiersz
 * tematów z własnymi przełącznikami (za flagą), jedno usuwanie z wyborem
 * zakresu. Kotwice `#people-memory` i `#topic-map` zostają, bo trasy
 * przełączników wracają pod nie.
 */
describe("account page: conversation memory settings", () => {
  const page = readFileSync(SECURITY_PATH, "utf8");
  const peopleToggle = readFileSync(PEOPLE_TOGGLE_PATH, "utf8");
  const topicToggle = readFileSync(TOPIC_TOGGLE_PATH, "utf8");

  it("shows one card whenever either part is on or holds saved rows, even with the flags off", () => {
    expect(page).toContain("const showsPeopleRow = peopleMemoryMode || hasPeopleRows");
    expect(page).toContain("const showsTopicRow = topicMapMode || hasDifficultyRows");
    expect(page).toContain("const showsMemoryCard = showsPeopleRow || showsTopicRow");
    expect(page).toContain('id="memory"');
    expect(page).toContain('id="people-memory"');
    expect(page).toContain('id="topic-map"');
    expect(page.indexOf('id="memory"')).toBeLessThan(page.indexOf('id="people-memory"'));
    expect(page.indexOf('id="people-memory"')).toBeLessThan(page.indexOf('id="topic-map"'));
    expect(page).toContain("hasOwnedPeopleRows(sessionContext.data)");
    expect(page).toContain("hasOwnedDifficultyRows(sessionContext.data)");
    expect(page).toContain("peopleMemoryMode ? readOwnedPeopleMemoryEnabled(sessionContext.data) : null");
    expect(page).toContain("topicMapMode ? readOwnedTopicMapEnabled(sessionContext.data) : null");
    expect(page).toContain("!peopleMemoryMode ? (");
    expect(page).toContain("memoryCopy.modeOffIntro");
    expect(page).toContain('href="/dashboard/memory"');
  });

  it("deletes through one native form with a scope choice and a required confirmation", () => {
    expect(page).toContain('action="/api/session/memory/delete-all"');
    expect(page).toContain('name="scope"');
    expect(page).toContain("MEMORY_DELETE_SCOPES");
    expect(page).toContain("shown: showsPeopleRow && showsTopicRow");
    expect(page).toContain('<input type="checkbox" name="confirm" value="1" required');
    expect(page).not.toContain("/api/session/people/delete-all");
    expect(page).not.toContain("/api/session/topics/delete-all");
  });

  it("renders both toggles as native forms with a pressed state, a hidden legend and no inline script", () => {
    for (const toggle of [peopleToggle, topicToggle]) {
      expect(toggle).toContain('name="enabled"');
      expect(toggle).toContain("aria-pressed={option.pressed}");
      expect(toggle).toContain('hideLegend ? "sr-only"');
      expect(toggle).not.toContain("<script");
    }
    expect(peopleToggle).toContain('action="/api/profile/people-memory"');
    expect(topicToggle).toContain('action="/api/profile/topic-map"');
    expect(page).toContain("<PeopleMemoryToggle enabled={peopleMemoryEnabled} hideLegend />");
    expect(page).toContain("<TopicMapToggle enabled={topicMapEnabled} hideLegend />");
  });

  it("reports every redirect status without trusting arbitrary query values", () => {
    expect(page).toContain("isPeopleSettingsStatusCode(peopleStatus) ? peopleCopy.status[peopleStatus] : null");
    expect(page).toContain("isTopicSettingsStatusCode(topicStatus) ? topicCopy.status[topicStatus] : null");
    expect(page).toContain("isMemorySettingsStatusCode(memoryStatus) ? memoryCopy.status[memoryStatus] : null");
  });
});
