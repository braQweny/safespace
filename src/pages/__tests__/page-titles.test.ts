/**
 * Tytuł strony trafia do karty przeglądarki i do `og:title`, więc musi iść za
 * językiem żądania jak każdy inny tekst. Strona rozmowy miała go kiedyś jako
 * polski literał — jedyna strona bez klucza `pageTitle` w module kopii.
 */
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGES_ROOT = resolve(__dirname, "..");

function listPages() {
  return readdirSync(PAGES_ROOT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".astro"))
    .map((entry) => resolve(entry.parentPath, entry.name));
}

describe("page titles", () => {
  it("reads every <Layout title> from a copy module instead of a string literal", () => {
    const offenders = listPages()
      .filter((path) => /<Layout\b[^>]*\btitle="/.test(readFileSync(path, "utf8")))
      .map((path) => relative(PAGES_ROOT, path));

    expect(offenders).toEqual([]);
  });
});
