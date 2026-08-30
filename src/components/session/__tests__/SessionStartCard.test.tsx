import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SessionQuota } from "@/lib/session-data/types";
import type { SessionStartPageState } from "@/lib/session-flow/session-state";
import SessionStartCard, { formatRemainingFreeSessions, resolveAutoStartRequest } from "../SessionStartCard";

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

const approvedSummary = {
  id: "summary-1",
  sessionId: "old-session-1",
  summaryText: "Zatwierdzone podsumowanie widoczne przed startem.",
  revision: 1,
  createdAt: "2026-06-07T09:00:00.000Z",
  updatedAt: "2026-06-07T09:00:00.000Z",
};

function renderStartCard(initialState: SessionStartPageState) {
  return renderToStaticMarkup(<SessionStartCard initialState={initialState} />);
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

    expect(html).toContain("Rozpocznij pierwszą darmową rozmowę");
    // Wejście do panelu nie może wyglądać na zużycie darmowej próby.
    expect(html).toContain("samo otwarcie panelu nie zużywa próby");
    expect(html).not.toContain("Z czym zacznie się ta rozmowa");
  });

  it("renders approved summary context before a follow-up start", () => {
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

    expect(html).toContain("Z czym zacznie się ta rozmowa");
    expect(html).toContain("Zatwierdzone podsumowanie widoczne przed startem.");
    expect(html).toContain("Rozpocznij rozmowę");
    // The opt-out has to be reachable next to the context it opts out of.
    expect(html).toContain("Zacznij bez przekazywania kontekstu");
    expect(html).toContain('id="skip-approved-context"');
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
    expect(html).toContain("Zatwierdzone podsumowanie widoczne przed startem.");
    expect(html).toContain("Rozpocznij rozmowę");
  });

  it("renders an explicit no-context fallback when nothing was approved", () => {
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

    expect(html).toContain("zacznie się od zera");
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

    expect(html).toContain("Każda rozmowa trwa do 15 minut");
    expect(html).toContain("Rozpocznij pierwszą darmową rozmowę");
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

    expect(html).toContain("Pozostały 2 z 3 bezpłatnych rozmów");
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
    expect(html).toContain("Rozpocznij pierwszą rozmowę");
    expect(html).not.toContain("Rozpocznij pierwszą darmową rozmowę");
  });

  it("formats the remaining free sessions only when there is something left to count", () => {
    expect(formatRemainingFreeSessions(null)).toBeNull();
    expect(formatRemainingFreeSessions(premiumQuota)).toBeNull();
    expect(formatRemainingFreeSessions({ ...freeQuota, remainingSessions: 0, canStartSession: false })).toBeNull();
    expect(formatRemainingFreeSessions({ ...freeQuota, usedSessions: 2, remainingSessions: 1 })).toBe(
      "To ostatnia z 3 bezpłatnych rozmów na tym koncie.",
    );
    expect(formatRemainingFreeSessions({ ...freeQuota, usedSessions: 0, remainingSessions: 3 })).toBe(
      "Pozostały 3 z 3 bezpłatnych rozmów na tym koncie.",
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
    });
  });

  it("starts once and strips the parameter from the address", () => {
    expect(resolveAutoStartRequest("?start=now", true)).toEqual({
      isRequested: true,
      shouldStart: true,
      nextSearch: "",
    });
  });

  it("keeps the remaining query while dropping the start request", () => {
    expect(resolveAutoStartRequest("?historyAvatar=cbt-guide&start=now", true)).toEqual({
      isRequested: true,
      shouldStart: true,
      nextSearch: "?historyAvatar=cbt-guide",
    });
  });

  it("strips the parameter but does not start when the allowance is used up", () => {
    expect(resolveAutoStartRequest("?start=now", false)).toEqual({
      isRequested: true,
      shouldStart: false,
      nextSearch: "",
    });
  });

  it("ignores any other value of the parameter", () => {
    expect(resolveAutoStartRequest("?start=later", true).isRequested).toBe(false);
  });
});
