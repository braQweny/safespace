import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SECURITY_PATH = fileURLToPath(new URL("../security.astro", import.meta.url));
const TOGGLE_PATH = fileURLToPath(new URL("../../../components/account/TopicMapToggle.astro", import.meta.url));

describe("account page: topic map settings", () => {
  const page = readFileSync(SECURITY_PATH, "utf8");
  const toggle = readFileSync(TOGGLE_PATH, "utf8");

  it("keeps the delete form and the card visible whenever saved difficulties exist, even with the flag off", () => {
    expect(page).toContain("const showsTopicCard = topicMapMode || hasDifficultyRows");
    expect(page).toContain('id="topic-map"');
    expect(page).toContain('action="/api/session/topics/delete-all"');
    expect(page).toContain("topicMapMode ? topicCopy.intro : topicCopy.modeOffIntro");
    expect(page).toContain("hasOwnedDifficultyRows(sessionContext.data)");
    expect(page).toContain("topicMapMode ? readOwnedTopicMapEnabled(sessionContext.data) : null");
    // Osobna karta pod kartą osób: każda ma własny przełącznik i własne usuwanie.
    expect(page.indexOf('id="people-memory"')).toBeLessThan(page.indexOf('id="topic-map"'));
  });

  it("renders the toggle as a native form with a pressed state and no inline script", () => {
    expect(toggle).toContain('action="/api/profile/topic-map"');
    expect(toggle).toContain('name="enabled"');
    expect(toggle).toContain("aria-pressed={option.pressed}");
    expect(toggle).not.toContain("<script");
    expect(page).toContain("<TopicMapToggle enabled={topicMapEnabled} />");
  });

  it("reports the redirect status without trusting arbitrary query values", () => {
    expect(page).toContain("isTopicSettingsStatusCode(topicStatus) ? topicCopy.status[topicStatus] : null");
  });
});
