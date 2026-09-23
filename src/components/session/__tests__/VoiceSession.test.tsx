import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SessionStartPageState, SessionView } from "@/lib/session-flow/session-state";
import VoiceSession from "../VoiceSession";
import { MODALITY_CATALOG, toSelectedModalityAvatar } from "@/lib/modality-catalog";

vi.mock("@/components/hooks/useLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/hooks/useLocale")>()),
  // Istniejące asercje są po polsku; angielski render islandów pokrywa `english-locale.test.tsx`.
  useLocale: () => "pl",
}));

const CBT_MODALITY = MODALITY_CATALOG.find((entry) => entry.modalityId === "cbt") ?? MODALITY_CATALOG[1];
const avatar = {
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
    expect(html).toContain("Marek usłyszy Cię po włączeniu mikrofonu");
    expect(html).toContain("Rozmowa na żywo — możesz wejść w słowo w każdej chwili, jak w zwykłej rozmowie.");
    // Rozmowa, która już miała połączenie: zegar biegnie od niego, przycisk tylko łączy dźwięk.
    expect(html).toContain("Czas rozmowy biegnie od pierwszego połączenia.");
    expect(html).not.toContain("Włącz mikrofon i zacznij");
    // Tor dźwięku opisuje strona prywatności, nie ten ekran.
    expect(html).not.toContain("dostawcy modelu");
    expect(html).not.toContain("Rozpocznij");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("Wyślij");
    expect(html).not.toContain("Dyktuj");
    // Ten sam pasek co w rozmowie pisanej: licznik, „Pomoc”, „Zakończ rozmowę” słowem.
    expect(html).toContain("Rozmowa trwa");
    expect(html).toContain("Pozostały czas rozmowy");
    expect(html).toContain(">Zakończ</span>");
    expect(html).toContain("Zakończ rozmowę");
    expect(html).toContain(">Pomoc<");
    // Nagłówek: samo imię i to, na czym perspektywa się skupia — bez nazwy nurtu.
    expect(html).toMatch(/<h1 [^>]*>Marek<\/h1>/);
    expect(html).toContain("Jedna sytuacja, krok po kroku");
    expect(html).not.toContain("Podejście poznawczo-behawioralne");
    // Granice raz, w pasku pod rozmową; zastrzeżenie nie powtarza się w karcie.
    expect(html.match(/Granice rozmowy:/g)?.length).toBe(1);
    expect(html).toContain("SafeSpace jest edukacyjną symulacją rozmowy");
    expect(html).toContain("<audio");
  });

  it("before the first audio connection shows the full length standing still and promises nothing is lost", () => {
    const html = renderVoice(createState({ session: { ...activeSession, voiceConnected: false } }));

    expect(html).toContain("Marek usłyszy Cię po włączeniu mikrofonu");
    // Jedyny krok: wypełniony przycisk główny, ten sam co start na panelu.
    expect(html).toMatch(/<button[^>]*class="bg-brand text-surface[^"]*"[^>]*data-voice-connect="true"/);
    expect(html).toContain("Włącz mikrofon i zacznij");
    expect(html).toContain(
      "Czas ruszy dopiero wtedy. Jeśli przeglądarka nie da dostępu do mikrofonu, nic nie przepada.",
    );
    // Licznik nie odlicza: pełna długość z okna rozmowy i to, na co czeka.
    expect(html).toContain('data-session-timer="waiting"');
    expect(html).toContain("10 min</span> · czeka na mikrofon");
    expect(html).not.toContain('role="timer"');
    expect(html).not.toContain("Pozostały czas rozmowy");
    expect(html).not.toContain("dostawcy modelu");
    // Wyjście zostaje: zakończenie niepołączonej rozmowy niczego nie zużywa.
    expect(html).toContain("Zakończ rozmowę");
  });

  it("takes the waiting length from the conversation's own window, never a fixed ten minutes", () => {
    const html = renderVoice(
      createState({
        session: {
          ...activeSession,
          durationBucketSeconds: 3600,
          expiresAt: "2026-06-12T10:57:00.000Z",
          remainingSeconds: 3420,
          voiceConnected: false,
        },
      }),
    );

    expect(html).toContain("57 min</span> · czeka na mikrofon");
    expect(html).not.toContain("10 min</span>");
  });

  it("closes a voice conversation that never connected by saying nothing was used", () => {
    const expiredTrial = renderVoice(
      createState({
        kind: "expired",
        session: { ...activeSession, status: "expired", remainingSeconds: 0, voiceConnected: false },
      }),
    );

    expect(expiredTrial).toContain("Rozmowa głosowa się nie zaczęła");
    expect(expiredTrial).toContain(
      "Mikrofon nie został włączony, więc nic nie przepadło. Rozmowę głosową możesz zacząć od nowa z panelu.",
    );
    expect(expiredTrial).not.toContain("Czas rozmowy minął");
    expect(expiredTrial).toContain("Wróć do panelu");
    // Bez jednej wypowiedzi pod kartą nie stoi pusty zapis z „zacznie się, gdy awatar się przywita”.
    expect(expiredTrial).not.toContain("Rozmowa zacznie się, gdy awatar się przywita.");

    const endedPool = renderVoice(
      createState({
        kind: "completed",
        session: {
          ...activeSession,
          status: "completed",
          durationBucketSeconds: 3600,
          endedAt: "2026-06-12T10:02:00.000Z",
          voiceConnected: false,
        },
      }),
    );

    expect(endedPool).toContain("Rozmowa głosowa się nie zaczęła");
    expect(endedPool).toContain("Mikrofon nie został włączony, więc z puli minut nic nie ubyło.");
    expect(endedPool).not.toContain("Rozmowa zakończona");

    // Rozmowa, która miała połączenie, kończy się jak dotąd.
    const expiredConnected = renderVoice(
      createState({
        kind: "expired",
        session: { ...activeSession, status: "expired", remainingSeconds: 0, voiceConnected: true },
      }),
    );

    expect(expiredConnected).toContain("Czas rozmowy minął");
    expect(expiredConnected).not.toContain("nic nie przepadło");
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
    expect(html).not.toContain("Otwórz zapis");
    // Podsumowanie jest cichą akcją na karcie, dopóki go nie ma.
    expect(html).toContain("Podsumuj tę rozmowę");
    expect(html).not.toContain("Wygeneruj podsumowanie");
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
