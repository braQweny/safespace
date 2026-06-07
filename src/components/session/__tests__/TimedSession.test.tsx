import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SessionStartPageState } from "@/lib/session-flow/session-state";
import TimedSession from "../TimedSession";

const avatar = {
  modality: {
    modalityId: "cbt",
    avatarId: "cbt-guide",
    modalityName: "Podejscie poznawczo-behawioralne",
    avatarName: "Marek, praktyczny przewodnik",
    explanation: "Pomaga zauwazac powiazania miedzy myslami, emocjami, reakcjami ciala i dzialaniami.",
    focus: "Porzadkuje sytuacje krok po kroku.",
    sessionStyleHint: "Uzywa jasnej struktury.",
    assetPath: "/avatars/cbt-guide.png",
    altText: "Awatar Marka",
  },
  selected: {
    modalityId: "cbt",
    avatarId: "cbt-guide",
    modalityName: "Podejscie poznawczo-behawioralne",
    avatarName: "Marek, praktyczny przewodnik",
    assetPath: "/avatars/cbt-guide.png",
    altText: "Awatar Marka",
  },
} satisfies SessionStartPageState["avatar"];

function renderSession(initialState: SessionStartPageState) {
  return renderToStaticMarkup(<TimedSession initialState={initialState} />);
}

describe("TimedSession", () => {
  it("renders first-trial copy and start action for a fresh user", () => {
    const html = renderSession({
      kind: "ready",
      trialAvailable: true,
      avatar,
      session: null,
      messages: [],
      messageFetchFailed: false,
      approvedSummaries: [],
      canStartWithoutContext: false,
    });

    expect(html).toContain("Przygotowanie do pierwszej sesji");
    expect(html).toContain("Rozpocznij pierwszą darmową sesję");
    expect(html).toContain("Granice rozmowy");
    expect(html).toContain("SafeSpace jest symulacją rozmowy edukacyjnej");
    expect(html).not.toContain("Kontekst pokazany przed startem");
  });

  it("renders approved summary context before follow-up start", () => {
    const html = renderSession({
      kind: "followup_ready",
      trialAvailable: false,
      avatar,
      session: null,
      messages: [],
      messageFetchFailed: false,
      approvedSummaries: [
        {
          id: "summary-1",
          sessionId: "old-session-1",
          summaryText: "Zatwierdzone podsumowanie widoczne przed startem.",
          revision: 1,
          createdAt: "2026-06-07T09:00:00.000Z",
          updatedAt: "2026-06-07T09:00:00.000Z",
        },
      ],
      canStartWithoutContext: false,
    });

    expect(html).toContain("Przygotowanie do kolejnej sesji MVP");
    expect(html).toContain("Zatwierdzone podsumowanie widoczne przed startem.");
    expect(html).toContain("Rozpocznij kolejną sesję z kontekstem");
  });

  it("renders explicit no-context fallback for follow-up sessions without approved summaries", () => {
    const html = renderSession({
      kind: "followup_ready",
      trialAvailable: false,
      avatar,
      session: null,
      messages: [],
      messageFetchFailed: false,
      approvedSummaries: [],
      canStartWithoutContext: true,
    });

    expect(html).toContain("Nie ma zatwierdzonych podsumowań");
    expect(html).toContain("Rozpocznij kolejną sesję bez kontekstu");
  });
});
