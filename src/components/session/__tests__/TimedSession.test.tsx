import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SessionStartPageState } from "@/lib/session-flow/session-state";
import TimedSession from "../TimedSession";

const avatar = {
  modality: {
    modalityId: "cbt",
    avatarId: "cbt-guide",
    modalityName: "Podejście poznawczo-behawioralne",
    avatarName: "Marek, praktyczny przewodnik",
    explanation: "Pomaga zauważać powiązania między myślami, emocjami, reakcjami ciała i codziennymi działaniami.",
    focus: "Porządkuje sytuacje krok po kroku i szuka konkretnych obserwacji, które da się nazwać.",
    sessionStyleHint: "Uzywa jasnej struktury.",
    summaryLensHint: "Podsumuj przez soczewke poznawczo-behawioralna.",
    assetPath: "/avatars/cbt-guide.png",
    altText: "Ilustracyjny portret neutralnego awatara Marka z notesem",
  },
  selected: {
    modalityId: "cbt",
    avatarId: "cbt-guide",
    modalityName: "Podejście poznawczo-behawioralne",
    avatarName: "Marek, praktyczny przewodnik",
    assetPath: "/avatars/cbt-guide.png",
    altText: "Ilustracyjny portret neutralnego awatara Marka z notesem",
  },
} satisfies SessionStartPageState["avatar"];

function renderSession(initialState: SessionStartPageState) {
  return renderToStaticMarkup(<TimedSession initialState={initialState} />);
}

describe("TimedSession", () => {
  it("never offers a start action: conversations begin in the dashboard", () => {
    const html = renderSession({
      kind: "ready",
      trialAvailable: true,
      avatar,
      session: null,
      messages: [],
      messageFetchFailed: false,
      approvedSummaries: [],
      canStartWithoutContext: false,
      sessionQuota: null,
    });

    expect(html).not.toContain("Rozpocznij");
    expect(html).not.toContain("Z czym zacznie się ta rozmowa");
    expect(html).toContain("Rozmowę rozpoczniesz w panelu");
    expect(html).toContain("Granice rozmowy");
    expect(html).toContain("SafeSpace jest symulacją rozmowy edukacyjnej");
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
      sessionQuota: null,
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
      sessionQuota: null,
    });

    expect(html).toContain("Sesja została zakończona");
    expect(html).not.toContain("Zakończ sesję");
    expect(html).not.toContain("Pozostały czas sesji");
    // Decyzja o kontekście kolejnej rozmowy zapada tu, nie dopiero w historii.
    expect(html).toContain("Podsumowanie do kolejnej sesji");
    expect(html).toContain("Wygeneruj podsumowanie");
    expect(html).toContain("Użyj w kolejnej sesji");
    expect(html).toContain("Otwórz w historii");
    // The closing CTA must deep-link at the conversation that just ended, not at
    // a dashboard list where the user has to find it again.
    expect(html).toContain("/dashboard?session=5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a");
    expect(html).not.toContain("Wyślij");
  });
});
