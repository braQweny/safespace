import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseOpenRouterReasoningEffort } from "../env";
import { buildOpenRouterSessionRequest } from "@/lib/session-ai/openrouter-session-response";
import { buildOpenRouterSummaryRequest } from "@/lib/session-summary/openrouter-summary";
import { buildOpenRouterSafetyRequest } from "@/lib/session-safety/openrouter-classifier";
import type { GenerateSessionResponseInput } from "@/lib/session-ai/types";
import type { GenerateSessionSummaryInput } from "@/lib/session-summary/types";

vi.mock("astro:env/server", () => ({
  OPENROUTER_API_KEY: undefined,
  OPENROUTER_SAFETY_MODEL: undefined,
  OPENROUTER_SESSION_MODEL: undefined,
  OPENROUTER_SESSION_REASONING_EFFORT: undefined,
  OPENROUTER_SUMMARY_MODEL: undefined,
  OPENROUTER_TRANSCRIPTION_MODEL: undefined,
}));

/**
 * `deployed-model-config.test.ts` pins *which* models ship. This test runs
 * those very models through the three request builders, so a model that is
 * budgeted on one path but not another (the way Gemini 3.7 Flash summaries
 * once failed with `finish_reason: "length"`) fails CI instead of production.
 */

const WRANGLER_CONFIG_PATH = resolve(__dirname, "../../../../wrangler.jsonc");

// Below these caps a model that thinks before it writes returns nothing visible.
const MIN_REASONING_SESSION_TOKENS = 1_600;
const MIN_REASONING_SUMMARY_TOKENS = 1_600;
const MIN_REASONING_SAFETY_TOKENS = 256;

function readWranglerVars(): Partial<Record<string, string>> {
  const raw = readFileSync(WRANGLER_CONFIG_PATH, "utf8");
  const withoutComments = raw.replace(/^\s*\/\/.*$/gm, "");
  const withoutTrailingCommas = withoutComments.replace(/,(\s*[}\]])/g, "$1");
  const config = JSON.parse(withoutTrailingCommas) as { vars?: Record<string, string> };

  return config.vars ?? {};
}

function tokenCap(request: { maxCompletionTokens?: number; maxTokens?: number }) {
  return request.maxCompletionTokens ?? request.maxTokens ?? 0;
}

const sessionInput: GenerateSessionResponseInput = {
  currentUserMessage: "Chce uporzadkowac mysli.",
  modality: {
    modalityName: "Podejście poznawczo-behawioralne",
    avatarName: "Marek",
    sessionStyleHint: "Avatar: Marek.",
  },
  locale: "pl",
};

const summaryInput: GenerateSessionSummaryInput = {
  locale: "pl",
  messages: [
    { role: "user", content: "Czuje napiecie przed rozmowa w pracy.", sequenceIndex: 0 },
    { role: "assistant", content: "Zatrzymajmy sie przy tym.", sequenceIndex: 1 },
  ],
};

describe("deployed OpenRouter models through every request builder", () => {
  const vars = readWranglerVars();
  const sessionModel = vars.OPENROUTER_SESSION_MODEL ?? "";
  const summaryModel = vars.OPENROUTER_SUMMARY_MODEL ?? sessionModel;
  const safetyModel = vars.OPENROUTER_SAFETY_MODEL ?? "";
  const sessionEffort = parseOpenRouterReasoningEffort(vars.OPENROUTER_SESSION_REASONING_EFFORT);

  it("gives the session model a reasoning budget that fits the configured effort", () => {
    const request = buildOpenRouterSessionRequest(sessionInput, sessionModel, { reasoningEffort: sessionEffort });

    if (vars.OPENROUTER_SESSION_REASONING_EFFORT) {
      expect(sessionEffort, "configured effort is not one OpenRouter understands").toBeDefined();
      expect(request.reasoning).toEqual({ effort: sessionEffort });
    }

    if (request.reasoning) {
      expect(tokenCap(request)).toBeGreaterThanOrEqual(MIN_REASONING_SESSION_TOKENS);
    }
  });

  it("budgets the summary model for hidden reasoning on its own path", () => {
    const request = buildOpenRouterSummaryRequest(summaryInput, summaryModel);

    // A deployed model has to be known to the summary path explicitly — the
    // plain 320-token chat cap is only safe for a model that does not think.
    expect(request.reasoning, `${summaryModel} has no summary reasoning branch`).toBeDefined();
    expect(tokenCap(request)).toBeGreaterThanOrEqual(MIN_REASONING_SUMMARY_TOKENS);
  });

  it("gives the safety classifier room for a reasoning model's hidden tokens", () => {
    const request = buildOpenRouterSafetyRequest({ currentUserMessage: "Czesc." }, safetyModel);

    if (request.reasoning) {
      expect(request.maxCompletionTokens).toBeGreaterThanOrEqual(MIN_REASONING_SAFETY_TOKENS);
    }
  });
});
