import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SessionQuota } from "@/lib/session-data/types";
import type { SessionStartPageState } from "@/lib/session-flow/session-state";
import SessionStartCard, { formatRemainingFreeSessions } from "../SessionStartCard";

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
    expect(html).not.toContain("Rozpocznij");
    expect(html).not.toContain("<button");
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
