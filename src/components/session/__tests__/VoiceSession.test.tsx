import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SessionStartPageState, SessionView } from "@/lib/session-flow/session-state";
import VoiceSession from "../VoiceSession";
import { MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";

vi.mock("@/components/hooks/useLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/hooks/useLocale")>()),
  // Istniejące asercje są po polsku; angielski render islandów pokrywa `english-locale.test.tsx`.
  useLocale: () => "pl",
}));

const CBT_MODALITY = MVP_MODALITIES.find((modality) => modality.modalityId === "cbt") ?? MVP_MODALITIES[1];
const avatar = {
  modality: {
    ...CBT_MODALITY,
    sessionStyleHint: "Uzywa jasnej struktury.",
    summaryLensHint: "Podsumuj przez soczewke poznawczo-behawioralna.",
  },
  selected: toSelectedModalityAvatar(CBT_MODALITY),
} satisfies SessionStartPageState["avatar"];

const activeSession: SessionView = {
  id: "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a",
  status: "active",
  startedAt: "2026-06-12T10:00:00.000Z",
  endedAt: null,
  expiresAt: "2026-06-12T10:10:00.000Z",
  remainingSeconds: 540,
  isTrial: false,
  durationBucketSeconds: 600,
  mode: "voice",
};

function createState(overrides: Partial<SessionStartPageState> = {}): SessionStartPageState {
  return {
    kind: "active",
    trialAvailable: false,
    avatar,
    session: activeSession,
    messages: [],
    messageFetchFailed: false,
    approvedSummaries: [],
    canStartWithoutContext: false,
    sessionQuota: null,
    ...overrides,
  };
}

function renderVoice(initialState: SessionStartPageState, voiceAvailable = true) {
  return renderToStaticMarkup(<VoiceSession locale="pl" initialState={initialState} voiceAvailable={voiceAvailable} />);
}

describe("VoiceSession", () => {
  it("offers the microphone (disabled until hydration), never a start action or a composer", () => {
    const html = renderVoice(createState());

    expect(html).toContain("Włącz mikrofon");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*<svg[\s\S]*?Włącz mikrofon/);
    expect(html).toContain("Marek słucha, gdy włączysz mikrofon");
    expect(html).not.toContain("Rozpocznij");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("Wyślij");
    expect(html).not.toContain("Dyktuj");
    // Ten sam pasek co w rozmowie pisanej: licznik, „Pomoc”, „Zakończ rozmowę” słowem.
    expect(html).toContain("Rozmowa trwa");
    expect(html).toContain("Pozostały czas rozmowy");
    expect(html).toContain('<span class="sm:hidden">Zakończ</span>');
    expect(html).toContain("Zakończ rozmowę");
    expect(html).toContain(">Pomoc<");
    expect(html).toContain('<span class="sm:hidden">Marek</span>');
    // Granice raz, w pasku pod rozmową; zastrzeżenie nie powtarza się w karcie.
    expect(html.match(/Granice rozmowy:/g)?.length).toBe(1);
    expect(html).toContain("SafeSpace jest edukacyjną symulacją rozmowy");
    expect(html).toContain("<audio");
  });

  it("explains a switched-off feature instead of showing the microphone button", () => {
    const html = renderVoice(createState(), false);

    expect(html).toContain("Rozmowa głosowa jest teraz niedostępna");
    expect(html).not.toContain("Włącz mikrofon");
    expect(html).toContain("Zakończ rozmowę");
  });

  it("renders a finished conversation with the closing card, the summary panel and the transcript", () => {
    const html = renderVoice(
      createState({
        kind: "completed",
        session: { ...activeSession, status: "completed", endedAt: "2026-06-12T10:05:00.000Z", remainingSeconds: 300 },
        messages: [
          {
            id: "m1",
            role: "assistant",
            sequenceIndex: 0,
            content: "Cześć, jestem Marek.",
            createdAt: "2026-06-12T10:00:10.000Z",
          },
          {
            id: "m2",
            role: "user",
            sequenceIndex: 1,
            content: "Ciężko mi wstać.",
            createdAt: "2026-06-12T10:00:20.000Z",
          },
        ],
      }),
    );

    expect(html).toContain("Rozmowa zakończona");
    expect(html).toContain("Wróć do panelu");
    expect(html).toContain("Otwórz zapis");
    expect(html).toContain("Cześć, jestem Marek.");
    expect(html).toContain("Ciężko mi wstać.");
    expect(html).not.toContain("Włącz mikrofon");
    expect(html).not.toContain("Zakończ rozmowę");
    expect(html.match(/Granice rozmowy:/g)?.length).toBe(1);
    expect(html).toContain("Zmień perspektywę");
  });

  it("shows an interrupted conversation as stopped, without any way to reconnect", () => {
    const html = renderVoice(
      createState({
        kind: "interrupted",
        session: {
          ...activeSession,
          status: "interrupted",
          endedAt: "2026-06-12T10:03:00.000Z",
          remainingSeconds: 420,
        },
      }),
    );

    expect(html).toContain("Rozmowa przerwana");
    expect(html).not.toContain("Włącz mikrofon");
    expect(html).not.toContain("Połącz ponownie");
    expect(html).not.toContain("Zakończ rozmowę");
  });

  it("sends the user back to the dashboard when there is no conversation", () => {
    const html = renderVoice(createState({ kind: "ready", session: null }));

    expect(html).toContain("Rozmowę rozpoczniesz w panelu");
    expect(html).toContain("Wróć do panelu");
    expect(html).not.toContain("Włącz mikrofon");
  });
});
