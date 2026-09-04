import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SESSION_TURN_COPY } from "@/lib/session-copy";
import type { SessionStartPageState } from "@/lib/session-flow/session-state";
import TimedSession, { UnsentMessageNotice } from "../TimedSession";

const avatar = {
  modality: {
    modalityId: "cbt",
    avatarId: "cbt-guide",
    modalityName: "Podejście poznawczo-behawioralne",
    avatarName: "Marek, praktyczny przewodnik",
    explanation: "Pomaga zauważać powiązania między myślami, emocjami, reakcjami ciała i codziennymi działaniami.",
    focus: "Porządkuje sytuacje krok po kroku i szuka konkretnych obserwacji, które da się nazwać.",
    voiceSample: "oddzielmy na chwilę fakt od interpretacji…",
    pairingNote:
      "Marek mówi konkretnie i po ludzku, bez tonu trenera. Najpierw przyjmuje uczucie, potem porządkuje jedną sytuację i może zaproponować mały, dobrowolny krok. Jeśli wolisz zostać przy przeżywaniu zamiast porządkować, bliżej Ci może być do Nadii.",
    sessionStyleHint: "Uzywa jasnej struktury.",
    summaryLensHint: "Podsumuj przez soczewke poznawczo-behawioralna.",
    assetPath: "/avatars/cbt-guide.webp",
    altText: "Ilustracyjny portret neutralnego awatara Marka z notesem",
  },
  selected: {
    modalityId: "cbt",
    avatarId: "cbt-guide",
    modalityName: "Podejście poznawczo-behawioralne",
    avatarName: "Marek, praktyczny przewodnik",
    assetPath: "/avatars/cbt-guide.webp",
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
    // Pomoc kryzysowa zostaje na widoku także na wąskim ekranie.
    expect(html).toContain("Pomoc teraz");
    expect(html).toContain(">Pomoc<");
  });

  it("offers starter prompts until the user writes, not until the conversation is empty", () => {
    // Start zapisuje wiadomość otwierającą awatara, więc warunek „brak
    // wiadomości” chował podpowiedzi zawsze — także przed pierwszym zdaniem.
    const openingOnly = renderSession({
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
      messages: [
        {
          id: "message-1",
          role: "assistant",
          sequenceIndex: 1,
          content: "Od czego chcesz dziś zacząć?",
          createdAt: "2026-06-12T10:00:01.000Z",
        },
      ],
      messageFetchFailed: false,
      approvedSummaries: [],
      canStartWithoutContext: false,
      sessionQuota: null,
    });
    const afterFirstUserMessage = renderSession({
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
      messages: [
        {
          id: "message-1",
          role: "assistant",
          sequenceIndex: 1,
          content: "Od czego chcesz dziś zacząć?",
          createdAt: "2026-06-12T10:00:01.000Z",
        },
        {
          id: "message-2",
          role: "user",
          sequenceIndex: 2,
          content: "Od tygodnia wracam z pracy i od razu kładę się spać.",
          createdAt: "2026-06-12T10:00:30.000Z",
        },
      ],
      messageFetchFailed: false,
      approvedSummaries: [],
      canStartWithoutContext: false,
      sessionQuota: null,
    });

    expect(openingOnly).toContain("Nie wiem, od czego zacząć.");
    expect(afterFirstUserMessage).not.toContain("Nie wiem, od czego zacząć.");
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
    expect(html).toContain("Do przeczytania w historii");
    expect(html).toContain("Podsumowanie tej rozmowy");
    expect(html).toContain("Wygeneruj podsumowanie");
    expect(html).toContain("Otwórz w historii");
    // The closing CTA must deep-link at the conversation that just ended, not at
    // a dashboard list where the user has to find it again.
    expect(html).toContain("/dashboard?session=5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a");
    expect(html).not.toContain("Wyślij");
  });

  it("never shows unsent text on a fresh render, even for an expired session", () => {
    const html = renderSession({
      kind: "expired",
      trialAvailable: false,
      avatar,
      session: {
        id: "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a",
        status: "expired",
        startedAt: "2026-06-12T10:00:00.000Z",
        endedAt: null,
        expiresAt: "2026-06-12T10:15:00.000Z",
        remainingSeconds: 0,
        isTrial: true,
        durationBucketSeconds: 900,
      },
      messages: [],
      messageFetchFailed: false,
      approvedSummaries: [],
      canStartWithoutContext: false,
      sessionQuota: null,
    });

    expect(html).toContain("Limit czasu został osiągnięty");
    expect(html).not.toContain(SESSION_TURN_COPY.unsentMessage);
  });
});

/*
 * Słowa, które nie zdążyły wyjść przed końcem czasu, wracają na karcie
 * zamknięcia. Przycisk kopiowania czeka na potwierdzenie, że schowek istnieje —
 * w SSR go nie ma, więc zostaje sam tekst do przeczytania.
 */
describe("UnsentMessageNotice", () => {
  it("shows the unsent text with its label", () => {
    const html = renderToStaticMarkup(<UnsentMessageNotice text="Chciałem jeszcze dodać, że…" />);

    expect(html).toContain(SESSION_TURN_COPY.unsentMessage);
    expect(html).toContain("Chciałem jeszcze dodać, że…");
    expect(html).toContain("whitespace-pre-wrap");
  });

  it("offers copying only once the clipboard is known to exist", () => {
    const html = renderToStaticMarkup(<UnsentMessageNotice text="tekst" />);

    expect(html).not.toContain(SESSION_TURN_COPY.copyUnsent);
  });
});
