import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIVACY_SECTION_IDS } from "@/lib/page-copy/privacy-copy";

/**
 * Proza strony prywatności żyje w dwóch partialach Astro. Spis treści i linki
 * z innych stron (`/privacy#ai`) używają neutralnych id, więc oba partiale
 * muszą mieć dokładnie ten sam zestaw sekcji w tej samej kolejności.
 */
function readSectionIds(fileName: string) {
  const source = readFileSync(resolve(__dirname, "..", fileName), "utf8");

  return [...source.matchAll(/<section id="([a-z-]+)"/g)].map((match) => match[1]);
}

describe("privacy page partials", () => {
  it.each(["PrivacyContentPl.astro", "PrivacyContentEn.astro"])("%s carries every section id in order", (fileName) => {
    expect(readSectionIds(fileName)).toEqual([...PRIVACY_SECTION_IDS]);
  });

  it.each(["PrivacyContentPl.astro", "PrivacyContentEn.astro"])(
    "%s describes people cards behind the same flag that ships them: one paragraph in #ai and one deletion bullet",
    (fileName) => {
      const source = readFileSync(resolve(__dirname, "..", fileName), "utf8");

      expect(source).toContain('import { isPeopleMemoryEnabled } from "@/lib/session-flow/people-memory-mode"');
      expect(source.match(/data-people-memory/g)).toHaveLength(2);
      expect(source).toMatch(/<p class="text-ink-soft mt-3" data-people-memory>/);
      expect(source).toMatch(/<li data-people-memory>/);
    },
  );

  it.each(["PrivacyContentPl.astro", "PrivacyContentEn.astro"])(
    "%s describes the topic map behind its own flag: one paragraph beside the people cards and one deletion bullet",
    (fileName) => {
      const source = readFileSync(resolve(__dirname, "..", fileName), "utf8");

      expect(source).toContain('import { isTopicMapEnabled } from "@/lib/session-flow/topic-map-mode"');
      expect(source.match(/data-topic-map/g)).toHaveLength(2);
      expect(source).toMatch(/<p class="text-ink-soft mt-3" data-topic-map>/);
      expect(source).toMatch(/<li data-topic-map>/);
      // Mapa stoi tuż za kartami osób w obu miejscach.
      expect(source.indexOf("data-people-memory>")).toBeLessThan(source.indexOf("data-topic-map>"));
    },
  );

  it("keeps the English partial free of Polish letters outside comments", () => {
    const source = readFileSync(resolve(__dirname, "..", "PrivacyContentEn.astro"), "utf8");
    const markup = source.slice(source.lastIndexOf("---") + 3);

    expect(markup).not.toMatch(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/);
  });
});
