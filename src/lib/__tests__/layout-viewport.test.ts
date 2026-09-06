/**
 * Bez `interactive-widget=resizes-content` Chromium na Androidzie zostawia
 * layout viewport pełnej wysokości pod klawiaturą ekranową i pole pisania w
 * rozmowie znika pod nią (zgłoszenia z Samsunga, 2026-09-06).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const LAYOUT_PATH = fileURLToPath(new URL("../../layouts/Layout.astro", import.meta.url));

describe("viewport meta", () => {
  it("asks Android Chromium to shrink the layout viewport under the on-screen keyboard", () => {
    const layout = readFileSync(LAYOUT_PATH, "utf8");
    const content = /<meta name="viewport" content="([^"]+)"/.exec(layout)?.[1];

    expect(content).toBeDefined();

    const directives = (content ?? "").split(",").map((directive) => directive.trim());

    expect(directives).toContain("width=device-width");
    expect(directives).toContain("initial-scale=1");
    expect(directives).toContain("interactive-widget=resizes-content");
  });
});
