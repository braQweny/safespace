import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const env = vi.hoisted((): { VOICE_SESSION_MODE: string | undefined; VOICE_MONTHLY_MINUTES: string | undefined } => ({
  VOICE_SESSION_MODE: "on",
  VOICE_MONTHLY_MINUTES: "90",
}));
vi.mock("astro:env/server", () => env);

import {
  getVoiceMonthlyMinutes,
  isVoiceSessionEnabled,
  parseVoiceMonthlyMinutes,
  parseVoiceSessionMode,
} from "../voice-session-mode";
import { DEFAULT_VOICE_MONTHLY_MINUTES } from "@/lib/session-data/voice-quota";

const ROOT = resolve(__dirname, "../../../..");

describe("voice session mode", () => {
  it("treats only a literal `on` as enabled", () => {
    expect(parseVoiceSessionMode("on")).toBe("on");
    expect(parseVoiceSessionMode(" ON ")).toBe("on");
    for (const value of ["off", "", undefined, null, "true", "1", "yes"]) {
      expect(parseVoiceSessionMode(value)).toBe("off");
    }
  });

  it("reads the flag from the server environment and defaults to off when it cannot", () => {
    expect(isVoiceSessionEnabled()).toBe(true);
    env.VOICE_SESSION_MODE = "off";
    expect(isVoiceSessionEnabled()).toBe(false);
    env.VOICE_SESSION_MODE = undefined;
    expect(isVoiceSessionEnabled()).toBe(false);
  });

  it("accepts only a positive integer number of minutes and falls back to the default otherwise", () => {
    expect(parseVoiceMonthlyMinutes("120")).toBe(120);
    expect(parseVoiceMonthlyMinutes(" 45 ")).toBe(45);
    for (const value of ["0", "-5", "12.5", "abc", "", undefined, null, "1e3"]) {
      expect(parseVoiceMonthlyMinutes(value)).toBe(DEFAULT_VOICE_MONTHLY_MINUTES);
    }
    expect(getVoiceMonthlyMinutes()).toBe(90);
    env.VOICE_MONTHLY_MINUTES = undefined;
    expect(getVoiceMonthlyMinutes()).toBe(DEFAULT_VOICE_MONTHLY_MINUTES);
  });

  it("declares both variables on every configuration surface with values the parsers understand", () => {
    const wrangler = readFileSync(resolve(ROOT, "wrangler.jsonc"), "utf8");
    expect(/"VOICE_SESSION_MODE": "(\w+)"/.exec(wrangler)?.[1]).toMatch(/^(on|off)$/);
    expect(/"VOICE_MONTHLY_MINUTES": "(\d+)"/.exec(wrangler)?.[1]).toMatch(/^[1-9]\d*$/);
    const example = readFileSync(resolve(ROOT, ".env.example"), "utf8");
    expect(example).toMatch(/^VOICE_SESSION_MODE=(on|off)$/m);
    expect(example).toMatch(/^VOICE_MONTHLY_MINUTES=[1-9]\d*$/m);
    const astroConfig = readFileSync(resolve(ROOT, "astro.config.mjs"), "utf8");
    expect(astroConfig).toMatch(
      /VOICE_SESSION_MODE: envField\.string\(\{ context: "server", access: "public", optional: true \}\)/,
    );
    expect(astroConfig).toMatch(
      /VOICE_MONTHLY_MINUTES: envField\.string\(\{ context: "server", access: "public", optional: true \}\)/,
    );
  });
});
