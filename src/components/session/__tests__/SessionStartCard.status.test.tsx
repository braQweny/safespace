import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";
import type { SessionStartPageState } from "@/lib/session-flow/session-state";
import SessionStartCard from "../SessionStartCard";

const startState = vi.hoisted(() => ({ isStarting: false, isPreparingMemory: false }));

vi.mock("@/components/hooks/useSessionStart", () => ({
  useSessionStart: () => ({
    kind: "followup_ready",
    ...startState,
    notice: null,
    startSession: vi.fn(),
  }),
}));

const initialState: SessionStartPageState = {
  kind: "followup_ready",
  trialAvailable: false,
  avatar: { modality: MVP_MODALITIES[0], selected: toSelectedModalityAvatar(MVP_MODALITIES[0]) },
  session: null,
  messages: [],
  messageFetchFailed: false,
  approvedSummaries: [],
  canStartWithoutContext: false,
  sessionQuota: null,
};

describe("SessionStartCard progress", () => {
  it.each([false, true])("shows a visible live status while starting (preparing memory: %s)", (isPreparingMemory) => {
    startState.isStarting = true;
    startState.isPreparingMemory = isPreparingMemory;
    const html = renderToStaticMarkup(<SessionStartCard initialState={initialState} />);
    const status = /<p class="([^"]*)" role="status" aria-live="polite">([^<]*)<\/p>/.exec(html);

    expect(status).not.toBeNull();
    expect(status?.[1]).not.toContain("sr-only");
    expect(status?.[2]).toContain(
      isPreparingMemory ? "Czas rozmowy jeszcze nie biegnie" : "Za chwilę przejdziesz do ekranu rozmowy",
    );
    expect(html).toMatch(/<button[^>]*disabled=""/);
    // Start z pamięcią trwa do kilkudziesięciu sekund: przycisk ma się ruszać,
    // a nie stać z nieruchomym napisem jak zawieszony.
    expect(html).toContain("animate-spin");
    expect(html).toContain("Przygotowujemy rozmowę…");
  });
});
