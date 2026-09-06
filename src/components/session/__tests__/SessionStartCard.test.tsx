import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SessionQuota } from "@/lib/session-data/types";
import type { SessionStartPageState } from "@/lib/session-flow/session-state";
import SessionStartCard, {
  buildSessionHref,
  formatRemainingFreeSessions,
  resolveAutoStartRequest,
} from "../SessionStartCard";
import { MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";

vi.mock("@/components/hooks/useLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/hooks/useLocale")>()),
  // Istniejące asercje są po polsku; angielski render islandów pokrywa `english-locale.test.tsx`.
  useLocale: () => "pl",
}));

const freeQuota: SessionQuota = {
  plan: "free",
  sessionLimit: 3,
  usedSessions: 1,
  remainingSessions: 2,
  canStartSession: true,
};

const premiumQuota: SessionQuota = {
  plan: "premium",
  sessionLimit: null,
  usedSessions: 5,
  remainingSessions: null,
  canStartSession: true,
};

// Katalog jest jedynym źródłem kształtu perspektywy; testy dokładają tylko krótkie hinty.
const CBT_MODALITY = MVP_MODALITIES.find((modality) => modality.modalityId === "cbt") ?? MVP_MODALITIES[1];
const avatar = {
  modality: {
    ...CBT_MODALITY,
    sessionStyleHint: "Uzywa jasnej struktury.",
    summaryLensHint: "Podsumuj przez soczewke poznawczo-behawioralna.",
  },
  selected: toSelectedModalityAvatar(CBT_MODALITY),
} satisfies SessionStartPageState["avatar"];

const approvedSummary = {
  id: "summary-1",
  sessionId: "old-session-1",
  summaryText: "Zatwierdzone podsumowanie widoczne przed startem.",
  revision: 1,
  createdAt: "2026-06-07T09:00:00.000Z",
  updatedAt: "2026-06-07T09:00:00.000Z",
};

function renderStartCard(initialState: SessionStartPageState) {
  return renderToStaticMarkup(<SessionStartCard locale="pl" initialState={initialState} />);
}

describe("SessionStartCard", () => {
  it("renders first-trial copy and the start action for a fresh user", () => {
    const html = renderStartCard({
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

    expect(html).toContain("Rozpocznij rozmowę");
    // Wejście do panelu nie może wyglądać na zużycie darmowej próby.
    expect(html).toContain("Samo otwarcie panelu nie zużywa próby");
    expect(html).not.toContain("Z czym zacznie się ta rozmowa");
  });

  it("explains automatic memory without a manual approval step", () => {
    const html = renderStartCard({
      kind: "followup_ready",
      trialAvailable: false,
      avatar,
      session: null,
      messages: [],
      messageFetchFailed: false,
      approvedSummaries: [approvedSummary],
      canStartWithoutContext: true,
      sessionQuota: null,
    });

    expect(html).toContain("Marek uwzględni wasze wcześniejsze rozmowy.");
    expect(html).toContain('href="/privacy#ai"');
    expect(html).not.toContain("<details");
    expect(html).not.toContain("Zatwierdzone podsumowanie widoczne przed startem.");
    expect(html).toContain("Rozpocznij rozmowę");
    // Pamięć przygotowuje się automatycznie, bez ręcznego zatwierdzania.
    expect(html).not.toContain("Zacznij bez przekazywania kontekstu");
    expect(html).not.toContain('id="skip-approved-context"');
  });

  it("omits the opt-out when a context-free start is not offered", () => {
    const html = renderStartCard({
      kind: "followup_ready",
      trialAvailable: false,
      avatar,
      session: null,
      messages: [],
      messageFetchFailed: false,
      approvedSummaries: [approvedSummary],
      canStartWithoutContext: false,
      sessionQuota: null,
    });

    expect(html).not.toContain("Zacznij bez przekazywania kontekstu");
    expect(html).not.toContain("Zatwierdzone podsumowanie widoczne przed startem.");
    expect(html).toContain("Rozpocznij rozmowę");
  });

  it("prepares history even when no summaries were manually approved", () => {
    const html = renderStartCard({
      kind: "followup_ready",
      trialAvailable: false,
      avatar,
      session: null,
      messages: [],
      messageFetchFailed: false,
      approvedSummaries: [],
      canStartWithoutContext: true,
      sessionQuota: null,
    });

    expect(html).toContain("Marek uwzględni wasze wcześniejsze rozmowy.");
    expect(html).not.toContain("zatwierdz");
    expect(html).toContain("Rozpocznij rozmowę");
  });

  it("explains a used-up trial instead of offering a start", () => {
    const html = renderStartCard({
      kind: "trial_already_claimed",
      trialAvailable: false,
      avatar,
      session: null,
      messages: [],
      messageFetchFailed: false,
      approvedSummaries: [],
      canStartWithoutContext: false,
      sessionQuota: null,
    });

    expect(html).toContain("Pierwsza darmowa rozmowa została już wykorzystana");
    expect(html).not.toContain("Rozpocznij");
  });

  it("explains the exhausted free-plan allowance and points to premium instead of offering a start", () => {
    const html = renderStartCard({
      kind: "session_limit_reached",
      trialAvailable: false,
      avatar,
      session: null,
      messages: [],
      messageFetchFailed: false,
      approvedSummaries: [],
      canStartWithoutContext: false,
      sessionQuota: { ...freeQuota, usedSessions: 3, remainingSessions: 0, canStartSession: false },
    });

    expect(html).toContain("trzy rozmowy próbne");
    expect(html).toContain("planie premium");
    // Koniec puli nie jest ślepym zaułkiem: użytkownik dowiaduje się, jak
    // zdobyć premium, ale bez skonfigurowanego kontaktu nie dostaje pustego CTA.
    expect(html).toContain("przyznaje go ręcznie zespół SafeSpace");
    expect(html).not.toContain("mailto:");
  });

  it("offers a contact action after the allowance is exhausted when support e-mail is configured", () => {
    const html = renderToStaticMarkup(
      <SessionStartCard
        locale="pl"
        initialState={{
          kind: "session_limit_reached",
          trialAvailable: false,
          avatar,
          session: null,
          messages: [],
          messageFetchFailed: false,
          approvedSummaries: [],
          canStartWithoutContext: false,
          sessionQuota: { ...freeQuota, usedSessions: 3, remainingSessions: 0, canStartSession: false },
        }}
        supportEmail="pomoc@example.org"
      />,
    );

    expect(html).toContain("Napisz w sprawie premium");
    expect(html).toContain("mailto:pomoc@example.org");
    expect(html).not.toContain("Rozpocznij");
  });

  it("offers subscription checkout information when sandbox billing is enabled", () => {
    const html = renderToStaticMarkup(
      <SessionStartCard
        locale="pl"
        initialState={{
          kind: "session_limit_reached",
          trialAvailable: false,
          avatar,
          session: null,
          messages: [],
          messageFetchFailed: false,
          approvedSummaries: [],
          canStartWithoutContext: false,
          sessionQuota: { ...freeQuota, usedSessions: 3, remainingSessions: 0, canStartSession: false },
        }}
        supportEmail="pomoc@example.org"
        billingEnabled
      />,
    );

    expect(html).toContain('href="/account/billing"');
    expect(html).toContain("Zobacz abonament premium");
    expect(html).toContain("każda do 60 minut");
    expect(html).not.toContain("przyznaje go ręcznie");
    expect(html).not.toContain("mailto:");
  });

  it("tells the user how long a conversation lasts before they start", () => {
    const html = renderStartCard({
      kind: "ready",
      trialAvailable: true,
      avatar,
      session: null,
      messages: [],
      messageFetchFailed: false,
      approvedSummaries: [],
      canStartWithoutContext: false,
      sessionQuota: freeQuota,
    });

    expect(html).toContain("Do 15 min rozmowy");
    expect(html).toContain("Rozpocznij rozmowę");
  });

  it("tells free accounts how many sessions remain before they start", () => {
    const html = renderStartCard({
      kind: "followup_ready",
      trialAvailable: false,
      avatar,
      session: null,
      messages: [],
      messageFetchFailed: false,
      approvedSummaries: [],
      canStartWithoutContext: true,
      sessionQuota: freeQuota,
    });

    expect(html).toContain("Zostały 2 z 3 bezpłatnych rozmów");
    expect(html).toContain("Rozpocznij rozmowę");
  });

  it("does not show a counter to premium accounts and drops the free-trial wording", () => {
    const html = renderStartCard({
      kind: "ready",
      trialAvailable: true,
      avatar,
      session: null,
      messages: [],
      messageFetchFailed: false,
      approvedSummaries: [],
      canStartWithoutContext: false,
      sessionQuota: premiumQuota,
    });

    expect(html).not.toContain("bezpłatnych rozmów");
    expect(html).not.toContain("Plan bezpłatny");
    expect(html).toContain("Rozpocznij rozmowę");
    expect(html).not.toContain("darmową rozmowę");
    expect(html).toContain("Do 60 min rozmowy");
  });

  it("formats the remaining free sessions only when there is something left to count", () => {
    expect(formatRemainingFreeSessions("pl", null)).toBeNull();
    expect(formatRemainingFreeSessions("pl", premiumQuota)).toBeNull();
    expect(
      formatRemainingFreeSessions("pl", { ...freeQuota, remainingSessions: 0, canStartSession: false }),
    ).toBeNull();
    expect(formatRemainingFreeSessions("pl", { ...freeQuota, usedSessions: 2, remainingSessions: 1 })).toBe(
      "To ostatnia z 3 bezpłatnych rozmów.",
    );
    expect(formatRemainingFreeSessions("pl", { ...freeQuota, usedSessions: 0, remainingSessions: 3 })).toBe(
      "Zostały 3 z 3 bezpłatnych rozmów.",
    );
  });

  it("keeps the start action disabled until the island hydrates", () => {
    const html = renderStartCard({
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

    expect(html).toContain("disabled");
  });
});

/*
 * „Zapisz i zacznij rozmowę” wraca na panel z `?start=now`. Najgroźniejszy błąd
 * tej ścieżki to zużycie kolejnej rozmowy z puli przy zwykłym odświeżeniu, więc
 * parametr musi znikać z adresu także wtedy, gdy start w ogóle nie następuje.
 */
describe("resolveAutoStartRequest", () => {
  it("ignores a panel opened without the start request", () => {
    expect(resolveAutoStartRequest("?avatar=updated", true)).toEqual({
      isRequested: false,
      shouldStart: false,
      nextSearch: "?avatar=updated",
      aboutPersonId: null,
      aboutDifficultyId: null,
    });
  });

  it("starts once and strips the parameter from the address", () => {
    expect(resolveAutoStartRequest("?start=now", true)).toEqual({
      isRequested: true,
      shouldStart: true,
      nextSearch: "",
      aboutPersonId: null,
      aboutDifficultyId: null,
    });
  });

  it("keeps the remaining query while dropping the start request", () => {
    expect(resolveAutoStartRequest("?historyAvatar=cbt-guide&start=now", true)).toEqual({
      isRequested: true,
      shouldStart: true,
      nextSearch: "?historyAvatar=cbt-guide",
      aboutPersonId: null,
      aboutDifficultyId: null,
    });
  });

  it("strips the parameter but does not start when the allowance is used up", () => {
    expect(resolveAutoStartRequest("?start=now", false)).toEqual({
      isRequested: true,
      shouldStart: false,
      nextSearch: "",
      aboutPersonId: null,
      aboutDifficultyId: null,
    });
  });

  it("ignores any other value of the parameter", () => {
    expect(resolveAutoStartRequest("?start=later", true).isRequested).toBe(false);
  });

  it("carries a person card from the dashboard into the start and strips it from the address too", () => {
    const personId = "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a";
    expect(resolveAutoStartRequest(`?start=now&about=${personId}`, true)).toEqual({
      isRequested: true,
      shouldStart: true,
      nextSearch: "",
      aboutPersonId: personId,
      aboutDifficultyId: null,
    });
    expect(resolveAutoStartRequest("?start=now&about=marta", true).aboutPersonId).toBeNull();
    expect(buildSessionHref("s", { aboutPersonId: personId })).toBe(`/dashboard/session?sessionId=s&about=${personId}`);
    expect(buildSessionHref("s")).toBe("/dashboard/session?sessionId=s");
  });

  it("carries a difficulty from the topic map the same way, under its own parameter", () => {
    const difficultyId = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
    expect(resolveAutoStartRequest(`?start=now&topic=${difficultyId}`, true)).toEqual({
      isRequested: true,
      shouldStart: true,
      nextSearch: "",
      aboutPersonId: null,
      aboutDifficultyId: difficultyId,
    });
    expect(resolveAutoStartRequest("?start=now&topic=odmawianie", true).aboutDifficultyId).toBeNull();
    expect(buildSessionHref("s", { aboutDifficultyId: difficultyId })).toBe(
      `/dashboard/session?sessionId=s&topic=${difficultyId}`,
    );
  });
});
