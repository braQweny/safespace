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

  it("declares the flag on every configuration surface with a value the parser understands", () => {
    // Production switched to `on` on 2026-09-06; the surfaces still have to agree
    // on the vocabulary, so a typo cannot silently mean off (or on).
    const wrangler = /"PEOPLE_MEMORY_MODE": "(\w+)"/.exec(readFileSync(resolve(ROOT, "wrangler.jsonc"), "utf8"));
    expect(wrangler?.[1]).toMatch(/^(on|off)$/);
    expect(readFileSync(resolve(ROOT, ".env.example"), "utf8")).toMatch(/^PEOPLE_MEMORY_MODE=(on|off)$/m);
    expect(readFileSync(resolve(ROOT, "astro.config.mjs"), "utf8")).toMatch(
      /PEOPLE_MEMORY_MODE: envField\.string\(\{ context: "server", access: "public", optional: true \}\)/,
    );
  });
});
