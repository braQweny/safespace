import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const env = vi.hoisted((): { SESSION_LENS_MODE: string | undefined } => ({ SESSION_LENS_MODE: "on" }));
vi.mock("astro:env/server", () => env);

import { isSessionLensEnabled, parseSessionLensMode } from "../session-lens-mode";

const ROOT = resolve(__dirname, "../../../..");

describe("session lens mode", () => {
  it("treats only a literal `on` as enabled", () => {
    expect(parseSessionLensMode("on")).toBe("on");
    expect(parseSessionLensMode(" ON ")).toBe("on");
    for (const value of ["off", "", undefined, null, "true", "1", "yes"]) {
      expect(parseSessionLensMode(value)).toBe("off");
    }
  });

  it("reads the flag from the server environment and defaults to off when it cannot", () => {
    expect(isSessionLensEnabled()).toBe(true);
    env.SESSION_LENS_MODE = "off";
    expect(isSessionLensEnabled()).toBe(false);
    env.SESSION_LENS_MODE = undefined;
    expect(isSessionLensEnabled()).toBe(false);
  });

  it("ships dark: every configuration surface declares the flag as off", () => {
    expect(readFileSync(resolve(ROOT, "wrangler.jsonc"), "utf8")).toContain('"SESSION_LENS_MODE": "off"');
    expect(readFileSync(resolve(ROOT, ".env.example"), "utf8")).toContain("SESSION_LENS_MODE=off");
    expect(readFileSync(resolve(ROOT, "astro.config.mjs"), "utf8")).toMatch(
      /SESSION_LENS_MODE: envField\.string\(\{ context: "server", access: "public", optional: true \}\)/,
    );
  });
});
