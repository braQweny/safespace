import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseOpenRouterReasoningEffort } from "../env";
import { buildOpenRouterSessionRequest } from "@/lib/session-ai/openrouter-session-response";
import { buildOpenRouterSummaryRequest } from "@/lib/session-summary/openrouter-summary";
import { buildOpenRouterPeopleMemoryRequest } from "@/lib/session-summary/openrouter-people-memory";
import { buildOpenRouterSafetyRequest } from "@/lib/session-safety/openrouter-classifier";
import { buildOpenRouterSessionLensRequest } from "@/lib/session-lens/openrouter-lens-classifier";
import type { GenerateSessionResponseInput } from "@/lib/session-ai/types";
import type { GenerateSessionSummaryInput } from "@/lib/session-summary/types";
import type { GeneratePeopleMemoryInput } from "@/lib/session-summary/people-memory-types";

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
// A JSON change set for a batch with many people and topic-map entries is far
// longer than a summary.
const MIN_REASONING_PEOPLE_TOKENS = 8_000;

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

const peopleInput: GeneratePeopleMemoryInput = {
  locale: "pl",
  avatarFirstName: "Marek",
  persons: [],
  forgottenPeople: [],
  topicsEnabled: true,
  difficulties: [],
  messages: [{ role: "user", content: "Marta z pracy znowu skomentowała mój pomysł.", conversationIndex: 1 }],
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

  it("budgets the people-cards extraction for hidden reasoning plus a long JSON change set", () => {
    const request = buildOpenRouterPeopleMemoryRequest(peopleInput, summaryModel);

    expect(request.reasoning, `${summaryModel} has no people-memory reasoning branch`).toBeDefined();
    expect(tokenCap(request)).toBeGreaterThanOrEqual(MIN_REASONING_PEOPLE_TOKENS);
    expect(request.responseFormat.type).toBe("json_schema");
  });

  it("gives the safety classifier room for a reasoning model's hidden tokens", () => {
    const request = buildOpenRouterSafetyRequest({ currentUserMessage: "Czesc." }, safetyModel);

    if (request.reasoning) {
      expect(request.maxCompletionTokens).toBeGreaterThanOrEqual(MIN_REASONING_SAFETY_TOKENS);
    }
  });

  it("gives the lens labeller, which shares the safety model, the same hidden-reasoning headroom", () => {
    const request = buildOpenRouterSessionLensRequest({ currentUserMessage: "Czesc." }, safetyModel);

    expect(request.responseFormat.type).toBe("json_schema");
    if (request.reasoning) {
      expect(request.maxCompletionTokens).toBeGreaterThanOrEqual(MIN_REASONING_SAFETY_TOKENS);
    }
  });

  it("uses the same privacy-preserving Luna routing for safety, lens, conversation and summary", () => {
    const model = "openai/gpt-5.6-luna";
    const requests = [
      buildOpenRouterSafetyRequest({ currentUserMessage: "Czesc." }, model),
      buildOpenRouterSessionLensRequest({ currentUserMessage: "Czesc." }, model),
      buildOpenRouterSessionRequest(sessionInput, model),
      buildOpenRouterSummaryRequest(summaryInput, model),
      buildOpenRouterPeopleMemoryRequest(peopleInput, model),
    ];

    for (const request of requests) {
      expect(request.provider).toEqual({
        dataCollection: "deny",
        requireParameters: true,
        zdr: true,
        order: ["azure/eu"],
        allowFallbacks: true,
      });
    }
  });
});
