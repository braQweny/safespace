import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const env = vi.hoisted((): { TOPIC_MAP_MODE: string | undefined } => ({ TOPIC_MAP_MODE: "on" }));
vi.mock("astro:env/server", () => env);

import { isTopicMapEnabled, parseTopicMapMode } from "../topic-map-mode";

const ROOT = resolve(__dirname, "../../../..");

describe("topic map mode", () => {
  it("treats only a literal `on` as enabled", () => {
    expect(parseTopicMapMode("on")).toBe("on");
    expect(parseTopicMapMode(" ON ")).toBe("on");
    for (const value of ["off", "", undefined, null, "true", "1", "yes"]) {
      expect(parseTopicMapMode(value)).toBe("off");
    }
  });

  it("reads the flag from the server environment and defaults to off when it cannot", () => {
    expect(isTopicMapEnabled()).toBe(true);
    env.TOPIC_MAP_MODE = "off";
    expect(isTopicMapEnabled()).toBe(false);
    env.TOPIC_MAP_MODE = undefined;
    expect(isTopicMapEnabled()).toBe(false);
  });

  it("declares the flag on every configuration surface with a value the parser understands", () => {
    const wrangler = /"TOPIC_MAP_MODE": "(\w+)"/.exec(readFileSync(resolve(ROOT, "wrangler.jsonc"), "utf8"));
    expect(wrangler?.[1]).toMatch(/^(on|off)$/);
    expect(readFileSync(resolve(ROOT, ".env.example"), "utf8")).toMatch(/^TOPIC_MAP_MODE=(on|off)$/m);
    expect(readFileSync(resolve(ROOT, "astro.config.mjs"), "utf8")).toMatch(
      /TOPIC_MAP_MODE: envField\.string\(\{ context: "server", access: "public", optional: true \}\)/,
    );
  });
});
