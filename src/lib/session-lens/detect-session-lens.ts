import { isSessionLensId } from "@/lib/session-ai/session-lenses";
import { openRouterSessionLensProvider } from "./openrouter-lens-classifier";
import {
  SessionLensProviderError,
  type DetectSessionLensOptions,
  type SessionLensDetectionResult,
  type SessionLensInput,
  type SessionLensProvider,
} from "./types";

interface DetectSessionLensRuntimeOptions extends DetectSessionLensOptions {
  provider?: SessionLensProvider;
}

/**
 * Fail-open z założenia: soczewka to wzbogacenie promptu, nie bramka. Każdy
 * błąd providera, limit czasu czy niepoprawna odpowiedź kończy się `failed`,
 * a trasa wiadomości generuje odpowiedź bez soczewki. Nigdy nie rzuca.
 */
export async function detectSessionLens(
  input: SessionLensInput,
  options: DetectSessionLensRuntimeOptions = {},
): Promise<SessionLensDetectionResult> {
  const provider = options.provider ?? openRouterSessionLensProvider;
  const startedAtMs = performance.now();

  try {
    const decision = await provider.detect(input, { timeoutMs: options.timeoutMs });
    const durationMs = elapsedSince(startedAtMs);

    if (decision.lens === "none") {
      return { outcome: "none", durationMs, ...(decision.usage ? { usage: decision.usage } : {}) };
    }

    if (!isSessionLensId(decision.lens)) {
      return { outcome: "failed", reasonCode: "invalid_provider_response", durationMs };
    }

    return {
      outcome: "detected",
      lens: decision.lens,
      durationMs,
      ...(decision.usage ? { usage: decision.usage } : {}),
    };
  } catch (error) {
    return {
      outcome: "failed",
      reasonCode: error instanceof SessionLensProviderError ? error.category : "provider_unavailable",
      durationMs: elapsedSince(startedAtMs),
    };
  }
}

function elapsedSince(startedAtMs: number) {
  return Math.max(0, Math.round(performance.now() - startedAtMs));
}
