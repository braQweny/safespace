import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The OpenRouter model variables are `context: "server", access: "public"` —
 * not secrets — so the CI deploy never carried them: the build step passes only
 * the Supabase pair and `.env.production` holds only the actual secrets. With
 * none of them set, `resolveOpenRouterModel()` silently fell back to
 * `OPENROUTER_DEFAULT_MODEL`, and production ran every session, safety check and
 * summary on a model nobody chose. The session turn then failed outright,
 * because that fallback has no zero-data-retention endpoint accepting the
 * `max_tokens` parameter the session path sends under `requireParameters`.
 *
 * These tests pin the deployed configuration to the documented one, so dropping
 * a model variable fails CI instead of silently degrading production.
 */

const WRANGLER_CONFIG_PATH = resolve(__dirname, "../../../../wrangler.jsonc");
const ASTRO_CONFIG_PATH = resolve(__dirname, "../../../../astro.config.mjs");
const ENV_EXAMPLE_PATH = resolve(__dirname, "../../../../.env.example");
const OPENROUTER_ENV_PATH = resolve(__dirname, "../env.ts");

/**
 * Read from source rather than imported: `openrouter/env.ts` pulls in
 * `astro:env/server`, which only exists inside an Astro build.
 */
function readDefaultModel() {
  const source = readFileSync(OPENROUTER_ENV_PATH, "utf8");
  const match = /export const OPENROUTER_DEFAULT_MODEL = "([^"]+)";/.exec(source);

  expect(match, "OPENROUTER_DEFAULT_MODEL not found in openrouter/env.ts").not.toBeNull();

  return match?.[1];
}

/** The model variables must be deployed; the API key is a secret and must not be. */
const DEPLOYED_MODEL_VARS = [
  "OPENROUTER_SAFETY_MODEL",
  "OPENROUTER_SESSION_MODEL",
  "OPENROUTER_SUMMARY_MODEL",
  "OPENROUTER_TRANSCRIPTION_MODEL",
  "OPENROUTER_SESSION_REASONING_EFFORT",
] as const;

function readWranglerVars(): Record<string, string> {
  const raw = readFileSync(WRANGLER_CONFIG_PATH, "utf8");
  const withoutComments = raw.replace(/^\s*\/\/.*$/gm, "");
  const withoutTrailingCommas = withoutComments.replace(/,(\s*[}\]])/g, "$1");
  const config = JSON.parse(withoutTrailingCommas) as { vars?: Record<string, string> };

  return config.vars ?? {};
}

function readEnvExample(): Record<string, string> {
  const entries = readFileSync(ENV_EXAMPLE_PATH, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)] as const;
    });

  return Object.fromEntries(entries);
}

describe("deployed OpenRouter model configuration", () => {
  const vars = readWranglerVars();

  it("ships every OpenRouter model variable with the worker", () => {
    for (const name of DEPLOYED_MODEL_VARS) {
      expect(vars[name], `${name} is missing from wrangler.jsonc vars`).toBeTruthy();
    }
  });

  it("never lets a deployed model silently fall back to the in-code default", () => {
    // The fallback exists so a missing variable cannot crash the worker; it is
    // not a model this product intends to serve conversations with.
    for (const name of DEPLOYED_MODEL_VARS) {
      expect(vars[name]).not.toBe(readDefaultModel());
    }
  });

  it("keeps the deployed models equal to the documented ones", () => {
    const documented = readEnvExample();

    for (const name of DEPLOYED_MODEL_VARS) {
      expect(vars[name], `${name} drifted from .env.example`).toBe(documented[name]);
    }
  });

  it("keeps the API key a secret rather than a deployed var", () => {
    expect(vars.OPENROUTER_API_KEY).toBeUndefined();
    expect(readFileSync(ASTRO_CONFIG_PATH, "utf8")).toContain(
      'OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret"',
    );
    expect(vars.OPENAI_API_KEY).toBeUndefined();
    expect(vars.AI_PROVIDER).toBe("openai");
  });

  it("declares every deployed variable in the Astro env schema", () => {
    const astroConfig = readFileSync(ASTRO_CONFIG_PATH, "utf8");

    for (const name of DEPLOYED_MODEL_VARS) {
      expect(astroConfig, `${name} is not declared in astro.config.mjs`).toContain(name);
    }
  });
});
