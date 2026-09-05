/**
 * Favicon jest znakiem marki (łuk drzwi z nagłówka), nie ikoną ze startera.
 * Trzy pliki w `public/` powstają z jednego źródła SVG; ten test pilnuje, że
 * istnieją, są lekkie i że layout wskazuje na wszystkie trzy.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PUBLIC_DIR = fileURLToPath(new URL("../../../public/", import.meta.url));
const LAYOUT_PATH = fileURLToPath(new URL("../../layouts/Layout.astro", import.meta.url));

describe("favicon assets", () => {
  it.each([
    ["favicon.svg", 4 * 1024],
    ["favicon.png", 8 * 1024],
    ["apple-touch-icon.png", 16 * 1024],
  ])("ships %s under the size cap", (fileName, maxBytes) => {
    const filePath = `${PUBLIC_DIR}${fileName}`;

    expect(existsSync(filePath), `brak pliku public/${fileName}`).toBe(true);
    expect(statSync(filePath).size).toBeLessThanOrEqual(maxBytes);
  });

  it("draws the brand arch on the brand tile, not the starter rocket", () => {
    const svg = readFileSync(`${PUBLIC_DIR}favicon.svg`, "utf8");

    expect(svg).toContain('fill="#2d6a5e"');
    expect(svg).toContain('d="M14 52V26a18 18 0 0 1 36 0v26Z"');
    expect(svg).not.toContain("<image");
  });

  it("is referenced from the layout in every format", () => {
    const layout = readFileSync(LAYOUT_PATH, "utf8");

    expect(layout).toContain('href="/favicon.svg"');
    expect(layout).toContain('href="/favicon.png"');
    expect(layout).toContain('rel="apple-touch-icon"');
  });
});
