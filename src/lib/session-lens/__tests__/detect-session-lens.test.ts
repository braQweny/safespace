import { describe, expect, it, vi } from "vitest";
import { detectSessionLens } from "../detect-session-lens";
import { SessionLensProviderError, type SessionLensProvider } from "../types";

// Domyślny provider sięga do `astro:env/server`, którego vitest nie rozwiązuje.
vi.mock("astro:env/server", () => ({
  OPENROUTER_API_KEY: undefined,
  OPENROUTER_SAFETY_MODEL: undefined,
  OPENROUTER_SESSION_MODEL: undefined,
  OPENROUTER_SESSION_REASONING_EFFORT: undefined,
  OPENROUTER_SUMMARY_MODEL: undefined,
  OPENROUTER_TRANSCRIPTION_MODEL: undefined,
}));

const input = { currentUserMessage: "Mama znowu zadzwoniła z pretensjami.", recentUserMessages: ["wcześniej"] };

describe("detectSessionLens", () => {
  it("returns the detected lens, or none, with the provider's usage and a duration", async () => {
    const detect = vi.fn(() => Promise.resolve({ lens: "family_of_origin" as const, usage: { promptTokens: 10 } }));
    const provider: SessionLensProvider = { detect };

    const detected = await detectSessionLens(input, { provider, timeoutMs: 1_000 });
    expect(detected).toMatchObject({ outcome: "detected", lens: "family_of_origin", usage: { promptTokens: 10 } });
    expect(typeof (detected as { durationMs: number }).durationMs).toBe("number");
    expect(detect).toHaveBeenCalledWith(input, { timeoutMs: 1_000 });

    const none = await detectSessionLens(input, {
      provider: { detect: () => Promise.resolve({ lens: "none" }) },
    });
    expect(none).toMatchObject({ outcome: "none" });
    expect(none).not.toHaveProperty("lens");
  });

  it("fails open: a provider error, a thrown non-error and an off-catalog label all become a turn without a lens", async () => {
    await expect(
      detectSessionLens(input, {
        provider: { detect: () => Promise.reject(new SessionLensProviderError("provider_timeout")) },
      }),
    ).resolves.toMatchObject({ outcome: "failed", reasonCode: "provider_timeout" });

    await expect(
      detectSessionLens(input, {
        provider: {
          detect: () => {
            throw new TypeError("boom");
          },
        },
      }),
    ).resolves.toMatchObject({ outcome: "failed", reasonCode: "provider_unavailable" });

    await expect(
      detectSessionLens(input, {
        provider: { detect: () => Promise.resolve({ lens: "grief" as never }) },
      }),
    ).resolves.toMatchObject({ outcome: "failed", reasonCode: "invalid_provider_response" });
  });
});
