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

  it("keeps the English partial free of Polish letters outside comments", () => {
    const source = readFileSync(resolve(__dirname, "..", "PrivacyContentEn.astro"), "utf8");
    const markup = source.slice(source.lastIndexOf("---") + 3);

    expect(markup).not.toMatch(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/);
  });
});
