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
    explanation: "Pomaga zauwazac powiazania miedzy myslami, emocjami, reakcjami ciala i codziennymi dzialaniami.",
    focus: "Porzadkuje sytuacje krok po kroku i szuka konkretnych obserwacji, ktore da sie nazwac.",
    sessionStyleHint: "Uzywa jasnej struktury.",
    assetPath: "/avatars/cbt-guide.png",
    altText: "Ilustracyjny portret neutralnego awatara Marka z notesem",
  },
  selected: {
    modalityId: "cbt",
    avatarId: "cbt-guide",
    modalityName: "Podejscie poznawczo-behawioralne",
    avatarName: "Marek, praktyczny przewodnik",
    assetPath: "/avatars/cbt-guide.png",
    altText: "Ilustracyjny portret neutralnego awatara Marka z notesem",
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

  it("renders an explicit end action only while the session is active", () => {
    const html = renderSession({
      kind: "active",
      trialAvailable: false,
      avatar,
      session: {
        id: "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a",
        status: "active",
        startedAt: "2026-06-12T10:00:00.000Z",
        endedAt: null,
        expiresAt: "2026-06-12T10:15:00.000Z",
        remainingSeconds: 600,
        isTrial: true,
        durationBucketSeconds: 900,
      },
      messages: [],
      messageFetchFailed: false,
      approvedSummaries: [],
      canStartWithoutContext: false,
    });

    expect(html).toContain("Sesja jest aktywna");
    expect(html).toContain("Zakończ sesję");
    expect(html).toContain("Pozostały czas sesji");
  });

  it("hides the active timer and end action after completion", () => {
    const html = renderSession({
      kind: "completed",
      trialAvailable: false,
      avatar,
      session: {
        id: "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a",
        status: "completed",
        startedAt: "2026-06-12T10:00:00.000Z",
        endedAt: "2026-06-12T10:05:00.000Z",
        expiresAt: "2026-06-12T10:15:00.000Z",
        remainingSeconds: 600,
        isTrial: true,
        durationBucketSeconds: 900,
      },
      messages: [],
      messageFetchFailed: false,
      approvedSummaries: [],
      canStartWithoutContext: false,
    });

    expect(html).toContain("Sesja została zakończona");
    expect(html).not.toContain("Zakończ sesję");
    expect(html).not.toContain("Pozostały czas sesji");
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
