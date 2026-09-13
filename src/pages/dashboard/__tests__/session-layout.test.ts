/**
 * Strona rozmowy jest jedynym ekranem o stałej wysokości. Elementy `sr-only`
 * (position: absolute) w zapisie i pod polem pisania muszą mieć containing block
 * wewnątrz przyciętego `main` — bez `relative` wypadały poza obszar rozmowy,
 * rozciągały dokument i telefon pozwalał przeciągnąć całą rozmowę w górę.
 * `clip` dodatkowo blokuje przewijanie całej ramki przez fokus dialogu.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SESSION_PAGE_PATH = fileURLToPath(new URL("../session.astro", import.meta.url));

describe("session page layout", () => {
  it("clips helpers without allowing the fixed-height conversation box to scroll", () => {
    const page = readFileSync(SESSION_PAGE_PATH, "utf8");
    const mainClasses = /<main class="([^"]+)"/.exec(page)?.[1]?.split(/\s+/) ?? [];

    expect(mainClasses).toContain("relative");
    expect(mainClasses).toContain("overflow-clip");
    expect(page).toContain("h-[100dvh]");
  });
});
