import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `Layout.astro` nie renderuje się w vitest, więc pilnujemy źródła: pliki
 * łacińskie rozszerzone (polskie znaki) są ładowane z góry tylko przy polskim
 * interfejsie, łacińskie — zawsze.
 */
const LAYOUT_PATH = fileURLToPath(new URL("../layouts/Layout.astro", import.meta.url));

describe("Layout font preloads", () => {
  const layout = readFileSync(LAYOUT_PATH, "utf8");
  const preloadList = /const preloadedFontUrls =([\s\S]*?);\n/.exec(layout)?.[1] ?? "";

  it("preloads the extended Latin files only for the Polish interface", () => {
    const [polishBranch = "", englishBranch = ""] = preloadList.split(":");

    expect(preloadList).toContain('lang === "pl"');
    expect(polishBranch).toContain("newsreaderLatinExtUrl");
    expect(polishBranch).toContain("sourceSansLatinExtUrl");
    expect(englishBranch).not.toContain("LatinExtUrl");
    expect(englishBranch).toContain("newsreaderLatinUrl");
    expect(englishBranch).toContain("sourceSansLatinUrl");
  });
});
