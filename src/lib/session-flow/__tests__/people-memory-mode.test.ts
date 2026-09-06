import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const env = vi.hoisted((): { PEOPLE_MEMORY_MODE: string | undefined } => ({ PEOPLE_MEMORY_MODE: "on" }));
vi.mock("astro:env/server", () => env);

import { isPeopleMemoryEnabled, parsePeopleMemoryMode } from "../people-memory-mode";

const ROOT = resolve(__dirname, "../../../..");

describe("people memory mode", () => {
  it("treats only a literal `on` as enabled", () => {
    expect(parsePeopleMemoryMode("on")).toBe("on");
    expect(parsePeopleMemoryMode(" ON ")).toBe("on");
    for (const value of ["off", "", undefined, null, "true", "1", "yes"]) {
      expect(parsePeopleMemoryMode(value)).toBe("off");
    }
  });

  it("reads the flag from the server environment and defaults to off when it cannot", () => {
    expect(isPeopleMemoryEnabled()).toBe(true);
    env.PEOPLE_MEMORY_MODE = "off";
    expect(isPeopleMemoryEnabled()).toBe(false);
    env.PEOPLE_MEMORY_MODE = undefined;
    expect(isPeopleMemoryEnabled()).toBe(false);
  });

  it("ships dark: every configuration surface declares the flag as off", () => {
    expect(readFileSync(resolve(ROOT, "wrangler.jsonc"), "utf8")).toContain('"PEOPLE_MEMORY_MODE": "off"');
    expect(readFileSync(resolve(ROOT, ".env.example"), "utf8")).toContain("PEOPLE_MEMORY_MODE=off");
    expect(readFileSync(resolve(ROOT, "astro.config.mjs"), "utf8")).toMatch(
      /PEOPLE_MEMORY_MODE: envField\.string\(\{ context: "server", access: "public", optional: true \}\)/,
    );
  });
});
