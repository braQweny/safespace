import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Strony Astro nie renderują się w vitest, więc pilnujemy źródła: zapamiętane
 * wybory „Pisana | Głosowa” i „Mapa | Lista” czyta serwer z ciasteczka i podaje
 * wyspom, żeby pierwszy render był już tym wybranym — bez przeskoku po hydratacji.
 */
const DASHBOARD_PATH = fileURLToPath(new URL("../../dashboard.astro", import.meta.url));
const MEMORY_PAGE_PATH = fileURLToPath(new URL("../memory.astro", import.meta.url));

describe("remembered choices on the server", () => {
  it("renders the start card in the mode read from its cookie", () => {
    const page = readFileSync(DASHBOARD_PATH, "utf8");
    expect(page).toContain("parseStartMode(Astro.cookies.get(START_MODE_COOKIE)?.value)");
    expect(page).toMatch(/<SessionStartCard[\s\S]*?initialMode=\{initialStartMode\}[\s\S]*?\/>/);
  });

  it("renders the memory view in the view read from its cookie", () => {
    const page = readFileSync(MEMORY_PAGE_PATH, "utf8");
    expect(page).toContain("parseTopicMapView(Astro.cookies.get(TOPIC_MAP_VIEW_COOKIE)?.value)");
    expect(page).toMatch(/<MemoryView[\s\S]*?initialView=\{initialTopicView\}[\s\S]*?\/>/);
  });
});
