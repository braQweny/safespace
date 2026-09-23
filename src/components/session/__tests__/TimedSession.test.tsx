import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getSessionCopy } from "@/lib/session-copy";
import type { SessionStartPageState } from "@/lib/session-flow/session-state";
import TimedSession, { UnsentMessageNotice } from "../TimedSession";
import { MODALITY_CATALOG, toSelectedModalityAvatar } from "@/lib/modality-catalog";

vi.mock("@/components/hooks/useLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/hooks/useLocale")>()),
  // Istniejące asercje są po polsku; angielski render islandów pokrywa `english-locale.test.tsx`.
  useLocale: () => "pl",
}));

// Stan strony niesie tylko pola katalogu — prompty perspektywy zostają na serwerze.
const CBT_MODALITY = MODALITY_CATALOG.find((entry) => entry.modalityId === "cbt") ?? MODALITY_CATALOG[1];
const avatar = {
  selected: toSelectedModalityAvatar(CBT_MODALITY),
} satisfies SessionStartPageState["avatar"];

const SESSION_TURN_COPY = getSessionCopy("pl").turn;

function renderSession(initialState: SessionStartPageState) {
  return renderToStaticMarkup(<TimedSession locale="pl" initialState={initialState} />);
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
      sessionQuota: null,
    });

    expect(html).not.toContain("Rozpocznij");
    expect(html).not.toContain("Z czym zacznie się ta rozmowa");
    expect(html).toContain("Rozmowę rozpoczniesz w panelu");
    expect(html).toContain("Granice rozmowy");
    expect(html).toContain("SafeSpace jest edukacyjną symulacją rozmowy");
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
      sessionQuota: null,
    });

    expect(html).toContain("Rozmowa trwa");
    // Wyjście z rozmowy jest słowem na każdej szerokości: krótkim na telefonie,
    // pełnym od `sm` — nie ikoną drzwi, której trzeba się domyślać.
    expect(html).toContain(">Zakończ</span>");
    expect(html).toContain("Zakończ rozmowę");
    expect(html).not.toContain("Zakończ sesję");
    expect(html).toContain("Pozostały czas rozmowy");
    // Nagłówek: samo imię i to, na czym perspektywa się skupia (od `md`) — bez
    // dopisku roli i bez nazwy nurtu, tak jak na panelu i przy wyborze.
    expect(html).toMatch(/<h1 [^>]*>Marek<\/h1>/);
    expect(html).toContain("Jedna sytuacja, krok po kroku");
    expect(html).not.toContain("Podejście poznawczo-behawioralne");
    expect(html).not.toContain("Marek, praktyczny przewodnik");
    // Pomoc kryzysowa zostaje na widoku także na wąskim ekranie.
    expect(html).toContain("Pomoc teraz");
    expect(html).toContain(">Pomoc<");
  });

  it("prefills the composer from a person card and hides the starters, but never in a finished conversation", () => {
    const session = {
      id: "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a",
      status: "active" as const,
      startedAt: "2026-06-12T10:00:00.000Z",
      endedAt: null,
      expiresAt: "2026-06-12T10:15:00.000Z",
      remainingSeconds: 600,
      isTrial: true,
      durationBucketSeconds: 900,
    };
    const activeState: SessionStartPageState = {
      kind: "active",
      trialAvailable: false,
      avatar,
      session,
      messages: [],
      messageFetchFailed: false,
      sessionQuota: null,
    };
    const draft = "Dziś chcę porozmawiać o tej osobie: Marta (koleżanka z pracy).";
    const html = renderToStaticMarkup(<TimedSession locale="pl" initialState={activeState} initialDraft={draft} />);
    expect(html).toContain(draft);
    expect(html).not.toContain("Możesz zacząć od jednego z tych zdań");
    const finished = renderToStaticMarkup(
      <TimedSession
        locale="pl"
        initialState={{ ...activeState, kind: "completed", session: { ...session, status: "completed" } }}
        initialDraft={draft}
      />,
    );
    expect(finished).not.toContain(draft);
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
      sessionQuota: null,
    });

    expect(html).toContain("Rozmowa zakończona");
    expect(html).not.toContain("Zakończ rozmowę");
    expect(html).not.toContain("Pozostały czas rozmowy");
    // Jeden krok główny: powrót do panelu jako przycisk marki; obok tylko ciche akcje.
    expect(html).toMatch(/<a href="\/dashboard" class="bg-brand[^"]*"[^>]*>Wróć do panelu<\/a>/);
    // Zapis stoi pod kartą na tym samym ekranie, więc nie ma już do niego osobnego
    // linku (był trzecim wyjściem z karty).
    expect(html).not.toContain("Otwórz zapis");
    expect(html).not.toContain("/dashboard?session=");
    expect(html).toContain("Zmień perspektywę");
    // Pusta rozmowa nie ma czego podsumować: ani przycisku, ani całego panelu.
    expect(html).not.toContain("Podsumuj tę rozmowę");
    expect(html).not.toContain("Wygeneruj podsumowanie");
    // Jedno zastrzeżenie na ekran.
    expect(html.match(/Granice rozmowy:/g)?.length).toBe(1);
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
      sessionQuota: null,
    });

    expect(html).toContain("Czas rozmowy minął");
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

describe("TimedSession on a small phone", () => {
  const completedSession = {
    id: "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a",
    status: "completed" as const,
    startedAt: "2026-06-12T10:00:00.000Z",
    endedAt: "2026-06-12T10:05:00.000Z",
    expiresAt: "2026-06-12T10:15:00.000Z",
    remainingSeconds: 0,
    isTrial: true,
    durationBucketSeconds: 900,
  };
  const messages = [
    {
      id: "message-1",
      role: "assistant" as const,
      sequenceIndex: 1,
      content: "Od czego chcesz zacząć?",
      createdAt: "2026-06-12T10:00:00.000Z",
    },
  ];

  it("scrolls the closing card, the summary and the transcript as one column after the conversation", () => {
    const html = renderSession({
      kind: "completed",
      trialAvailable: false,
      avatar,
      session: completedSession,
      messages,
      messageFetchFailed: false,
      sessionQuota: null,
    });

    // Zapis nie ma już własnego scrolla ani regionu na żywo — przewija się cała kolumna.
    expect(html).toContain("Od czego chcesz zacząć?");
    expect(html).not.toContain('role="log"');
    expect(html).toMatch(/<div class="[^"]*min-h-0 flex-1[^"]*overflow-y-auto[^"]*">/);
  });

  it("keeps the live transcript as the only scroller while the conversation runs", () => {
    const html = renderSession({
      kind: "active",
      trialAvailable: false,
      avatar,
      session: { ...completedSession, status: "active", endedAt: null, remainingSeconds: 600 },
      messages,
      messageFetchFailed: false,
      sessionQuota: null,
    });

    expect(html).toContain('role="log"');
    expect(html).not.toMatch(/<div class="[^"]*min-h-0 flex-1[^"]*overflow-y-auto[^"]*">/);
  });
});
