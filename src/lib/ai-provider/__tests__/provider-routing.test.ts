import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted<Record<string, string | undefined>>(() => ({
  AI_PROVIDER: "openai",
  OPENAI_API_KEY: "test-openai-key",
  OPENROUTER_API_KEY: "test-router-key",
  OPENROUTER_SESSION_MODEL: "openai/gpt-5.6-luna",
  OPENROUTER_SAFETY_MODEL: "openai/gpt-5.6-luna",
  OPENROUTER_SUMMARY_MODEL: "openai/gpt-5.6-luna",
  OPENROUTER_TRANSCRIPTION_MODEL: "openai/gpt-4o-mini-transcribe",
  OPENROUTER_SESSION_REASONING_EFFORT: "xhigh",
}));
vi.mock("astro:env/server", () => env);

import { getAiProviderEnv, getAiProviderName } from "../env";
import { generateSessionResponse } from "@/lib/session-ai/provider";
import { generateSessionSummary } from "@/lib/session-summary/provider";
import { generatePeopleMemory } from "@/lib/session-summary/people-memory-provider";
import { evaluateSessionSafety } from "@/lib/session-safety/evaluate-session-safety";
import { detectSessionLens } from "@/lib/session-lens/detect-session-lens";
import { transcribeSessionAudio } from "@/lib/session-transcription/provider";
import { createLiveSession } from "@/lib/openai/live";
import {
  buildLiveSessionConfig,
  buildVoiceBackendInstructions,
  buildVoiceLiveInstructions,
} from "@/lib/session-ai/voice-instructions";

const responseInput = {
  locale: "en" as const,
  currentUserMessage: "I would like to plan my day.",
  modality: { modalityName: "CBT", avatarName: "Anna", sessionStyleHint: "Ask one question." },
};
const safetyInput = { currentUserMessage: "I would like to plan my day." };
const summaryInput = {
  locale: "en" as const,
  avatarFirstName: "Anna",
  modalityName: "CBT",
  avatarName: "Anna",
  messages: [{ role: "user" as const, content: "I planned my day.", sequenceIndex: 0 }],
  durationBucketSeconds: 300 as const,
};
const audioInput = { audioBase64: btoa("synthetic audio"), format: "webm" as const, language: "pl" as const };

function completion(content: string, model: string) {
  return Response.json({
    id: "synthetic-completion",
    object: "chat.completion",
    created: 1,
    model,
    system_fingerprint: null,
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content }, logprobs: null }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });
}

const requests: Request[] = [];
beforeEach(() => {
  env.AI_PROVIDER = "openai";
  env.OPENAI_API_KEY = "test-openai-key";
  requests.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request.clone());
      if (request.url.endsWith("/audio/transcriptions")) return Response.json({ text: "Synthetic transcription." });
      if (request.url.endsWith("/live/sessions")) {
        return Response.json(
          { session: { id: "live_synthetic" }, transport: { type: "webrtc", sdp: "v=0\r\na=answer" } },
          { status: 201 },
        );
      }
      const body = (await request.json()) as { model: string; response_format?: { json_schema: { name: string } } };
      const name = body.response_format?.json_schema.name;
      const content =
        name === "safespace_session_safety_decision"
          ? JSON.stringify({ risk: "normal", action: "allow", reasonCode: "none_detected" })
          : name === "safespace_session_lens"
            ? JSON.stringify({ lens: "none" })
            : name
              ? JSON.stringify({
                  newPersons: [],
                  updates: [],
                  newDifficulties: [],
                  difficultyUpdates: [],
                  incomplete: false,
                })
              : "A complete synthetic reply.";
      return completion(content, body.model);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("configured AI provider", () => {
  it("defaults to OpenAI and preserves existing model settings and the separate router key", () => {
    env.AI_PROVIDER = undefined;
    expect(getAiProviderName()).toBe("openai");
    expect(getAiProviderEnv()).toMatchObject({
      apiKey: "test-openai-key",
      sessionModel: "openai/gpt-5.6-luna",
      sessionReasoningEffort: "xhigh",
    });
    expect(getAiProviderEnv("openrouter").apiKey).toBe("test-router-key");
    env.AI_PROVIDER = "typo";
    expect(() => getAiProviderName()).toThrow("invalid_ai_provider_configuration");
  });

  it("routes conversation, opening, safety, summary, avatar memory and lenses directly to OpenAI", async () => {
    expect((await generateSessionResponse(responseInput)).providerMetadata.provider).toBe("openai");
    expect((await generateSessionResponse({ ...responseInput, mode: "opening" })).providerMetadata.provider).toBe(
      "openai",
    );
    expect(await evaluateSessionSafety(safetyInput)).toMatchObject({ action: "allow" });
    expect((await generateSessionSummary(summaryInput)).providerMetadata.provider).toBe("openai");
    expect(
      (await generateSessionSummary({ ...summaryInput, continuityMemory: "An earlier summary." })).providerMetadata
        .provider,
    ).toBe("openai");
    expect(await detectSessionLens(safetyInput)).toMatchObject({ outcome: "none" });
    expect(requests).toHaveLength(6);
    for (const request of requests) {
      expect(request.url).toBe("https://api.openai.com/v1/chat/completions");
      expect(request.redirect).toBe("manual");
      expect(request.headers.get("authorization")).toBe("Bearer test-openai-key");
      const body: unknown = await request.json();
      expect(body).toMatchObject({ model: "gpt-5.6-luna", store: false, stream: false });
      expect(body).not.toHaveProperty("provider");
      expect(body).not.toHaveProperty("temperature");
    }
  });

  it("creates the live voice session directly at OpenAI with the configured key and the session model delegated", async () => {
    const providerEnv = getAiProviderEnv();
    const { currentUserMessage: _message, ...backendInput } = responseInput;
    const session = buildLiveSessionConfig({
      liveInstructions: buildVoiceLiveInstructions({ locale: "en", voiceLiveHint: "You are Anna.", opening: true }),
      backendInstructions: buildVoiceBackendInstructions({ ...backendInput, opening: true }),
      backendModel: providerEnv.sessionModel,
      voice: "marin",
    });

    await expect(
      createLiveSession({ apiKey: providerEnv.apiKey ?? "", sdp: "v=0\r\na=offer", session }),
    ).resolves.toEqual({ liveSessionId: "live_synthetic", answerSdp: "v=0\r\na=answer" });
    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request.url).toBe("https://api.openai.com/v1/live/sessions");
    expect(request.redirect).toBe("manual");
    expect(request.headers.get("authorization")).toBe("Bearer test-openai-key");
    expect(await request.json()).toMatchObject({
      session: {
        model: "gpt-live-1",
        store: false,
        delegation: { type: "responses", responses: { model: "gpt-5.6-luna", reasoning: { effort: "low" } } },
      },
      transport: { type: "webrtc", sdp: "v=0\r\na=offer" },
    });
    // The router key never reaches the Live endpoint, whichever provider is configured.
    await expect(createLiveSession({ apiKey: "sk-or-router", sdp: "v=0", session })).rejects.toMatchObject({
      category: "missing_configuration",
    });
    expect(requests).toHaveLength(1);
  });

  it("routes the people/topic pipeline to OpenAI with strict validated changes", async () => {
    expect(
      (
        await generatePeopleMemory({
          locale: "en",
          avatarFirstName: "Anna",
          persons: [],
          forgottenPeople: [],
          messages: [],
        })
      ).changes,
    ).toMatchObject({ newPersons: [], updates: [], incomplete: false });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(await requests[0].json()).toMatchObject({
      response_format: { type: "json_schema", json_schema: { strict: true } },
      store: false,
    });
  });

  it("sends native multipart transcription with original audio bytes and locale", async () => {
    expect(await transcribeSessionAudio(audioInput)).toMatchObject({
      text: "Synthetic transcription.",
      providerMetadata: { provider: "openai", model: "gpt-4o-mini-transcribe" },
    });
    const request = requests[0];
    expect(request.url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(request.redirect).toBe("manual");
    const form = await request.formData();
    expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
    expect(form.get("language")).toBe("pl");
    expect(await (form.get("file") as File).text()).toBe("synthetic audio");
    expect(form.has("input_audio")).toBe(false);
  });

  it("switches all pipelines back to OpenRouter without losing privacy routing", async () => {
    env.AI_PROVIDER = "openrouter";
    expect((await generateSessionResponse(responseInput)).providerMetadata.provider).toBe("openrouter");
    await evaluateSessionSafety(safetyInput);
    await generateSessionSummary(summaryInput);
    await detectSessionLens(safetyInput);
    expect(
      (
        await generatePeopleMemory({
          locale: "en",
          avatarFirstName: "Anna",
          persons: [],
          forgottenPeople: [],
          messages: [],
        })
      ).changes,
    ).toMatchObject({ newPersons: [], updates: [], incomplete: false });
    await transcribeSessionAudio(audioInput);
    expect(requests).toHaveLength(6);
    for (const request of requests) {
      expect(request.url).toMatch(/^https:\/\/openrouter.ai\/api\/v1\//);
      expect(request.headers.get("authorization")).toBe("Bearer test-router-key");
      const body: unknown = await request.json();
      if (request.url.endsWith("chat/completions"))
        expect(body).toMatchObject({
          provider: { data_collection: "deny", zdr: true, require_parameters: true, order: ["azure/eu"] },
        });
      else
        expect(body).toMatchObject({
          model: "openai/gpt-4o-mini-transcribe",
          input_audio: { data: audioInput.audioBase64 },
        });
    }
  });

  it.each([301, 302, 303, 307, 308])(
    "rejects native audio redirect %s without forwarding the recording",
    async (status) => {
      const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        expect(request.redirect).toBe("manual");
        expect(request.url).toBe("https://api.openai.com/v1/audio/transcriptions");
        return Promise.resolve(new Response(null, { status, headers: { Location: "https://example.com/redirect" } }));
      });
      vi.stubGlobal("fetch", fetcher);
      await expect(transcribeSessionAudio(audioInput)).rejects.toMatchObject({ category: "provider_unavailable" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("fails closed when the OpenAI key is missing without falling back to the configured router", async () => {
    env.OPENAI_API_KEY = undefined;
    expect(await evaluateSessionSafety(safetyInput)).toMatchObject({
      action: "hard_stop",
      reasonCode: "missing_configuration",
    });
    await expect(generateSessionResponse(responseInput)).rejects.toMatchObject({ category: "missing_configuration" });
    await expect(transcribeSessionAudio(audioInput)).rejects.toMatchObject({ category: "missing_configuration" });
    expect(requests).toHaveLength(0);
  });
  it("keeps malformed safety output fail-closed with no provider text in the decision", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ error: { message: "PRIVATE CONTENT" } }))),
    );
    const decision = await evaluateSessionSafety(safetyInput);
    expect(decision).toMatchObject({ action: "hard_stop", reasonCode: "invalid_provider_response" });
    expect(JSON.stringify(decision)).not.toContain("PRIVATE CONTENT");
  });

  it.each([
    [429, "provider_rate_limited"],
    [504, "provider_timeout"],
    [500, "provider_unavailable"],
    [400, "invalid_provider_response"],
  ])("sanitizes transcription failure %s", async (status, category) => {
    const fetcher = vi.fn(() => Promise.resolve(Response.json({ error: { message: "PRIVATE AUDIO" } }, { status })));
    vi.stubGlobal("fetch", fetcher);
    await expect(transcribeSessionAudio(audioInput)).rejects.toMatchObject({ category, message: category });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
