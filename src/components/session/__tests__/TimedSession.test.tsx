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
    expect(html).toContain("Rozpocznij pierwszą darmową rozmowę");
    expect(html).toContain("Granice rozmowy");
    expect(html).toContain("SafeSpace jest symulacją rozmowy edukacyjnej");
    expect(html).not.toContain("Z czym zacznie się ta rozmowa");
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
    expect(html).toContain("Zobacz zapis i podsumowanie");
    // The closing CTA must deep-link at the conversation that just ended, not at
    // a dashboard list where the user has to find it again.
    expect(html).toContain("/dashboard?session=5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a");
    expect(html).not.toContain("Wyślij");
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
      canStartWithoutContext: true,
    });

    expect(html).toContain("Przygotowanie do kolejnej sesji");
    // The button no longer spells out the context state, so what carries over
    // has to be visible in the panel itself.
    expect(html).toContain("Zatwierdzone podsumowanie widoczne przed startem.");
    expect(html).toContain("Rozpocznij rozmowę");
    // The opt-out has to be reachable next to the context it opts out of.
    expect(html).toContain("Zacznij bez przekazywania kontekstu");
    expect(html).toContain('id="skip-approved-context"');
  });

  it("omits the opt-out when a context-free start is not offered", () => {
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

    expect(html).not.toContain("Zacznij bez przekazywania kontekstu");
    expect(html).toContain("Zatwierdzone podsumowanie widoczne przed startem.");
    expect(html).toContain("Rozpocznij rozmowę");
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

    // With nothing approved the user must still be told the session starts fresh.
    expect(html).toContain("zacznie się od zera");
    expect(html).toContain("Rozpocznij rozmowę");
  });
});
