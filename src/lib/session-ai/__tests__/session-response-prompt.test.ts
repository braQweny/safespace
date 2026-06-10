import { describe, expect, it } from "vitest";
import { MVP_MODALITIES } from "../../modalities";
import { buildSessionResponseMessages, SESSION_RESPONSE_SYSTEM_PROMPT } from "../session-response-prompt";
import type { GenerateSessionResponseInput } from "../types";

const input = {
  currentUserMessage: "Chce spokojnie uporzadkowac trudna rozmowe z bliska osoba.",
  modality: {
    modalityName: "Podejscie poznawczo-behawioralne",
    avatarName: "Marek, praktyczny przewodnik",
    sessionStyleHint:
      "Uzywa jasnej struktury, pomaga odroznic fakty od interpretacji i zaprasza do spokojnego sprawdzania perspektyw.",
  },
  cautionConstraints: [
    {
      id: "avoid_diagnosis",
      instruction: "Do not diagnose the user or imply clinical assessment.",
    },
  ],
  recentMessages: [
    {
      role: "user",
      content: "Pierwsza wiadomosc.",
      sequenceIndex: 0,
    },
    {
      role: "assistant",
      content: "Spokojna odpowiedz.",
      sequenceIndex: 1,
    },
  ],
  approvedSummaries: [
    {
      summaryText: "Zatwierdzone podsumowanie poprzedniej rozmowy.",
      revision: 1,
      createdAt: "2026-06-07T09:00:00.000Z",
      updatedAt: "2026-06-07T09:00:00.000Z",
    },
  ],
} satisfies GenerateSessionResponseInput;

describe("buildSessionResponseMessages", () => {
  it("frames ordinary replies as educational, modality-aware, and non-diagnostic", () => {
    const messages = buildSessionResponseMessages(input);
    const systemMessage = messages[0];

    expect(systemMessage.role).toBe("system");
    expect(systemMessage.content).toContain(SESSION_RESPONSE_SYSTEM_PROMPT);
    expect(systemMessage.content).toContain("one natural SafeSpace session reply");
    expect(systemMessage.content).toContain(
      "not therapy, diagnosis, crisis care, medical care, or a replacement for a qualified professional",
    );
    expect(systemMessage.content).toContain("not a therapist, doctor, clinician, real human, or real person");
    expect(systemMessage.content).toContain("Prefer one meaningful question over several shallow questions");
    expect(systemMessage.content).toContain("Do not diagnose");
    expect(systemMessage.content).toContain("Do not add generic product disclaimers");
    expect(systemMessage.content).toContain("approved prior-session summaries");
    expect(systemMessage.content).toContain("not as diagnosis, verified fact, risk assessment");
  });

  it("encourages natural, non-templated conversation in the base prompt", () => {
    const messages = buildSessionResponseMessages(input);
    const systemMessage = messages[0];

    expect(systemMessage.content).toContain("Match the user's pace, length, and register");
    expect(systemMessage.content).toContain("A reply does not have to end with a question");
    expect(systemMessage.content).toContain("Do not reuse the same openers or signature phrases");
    expect(systemMessage.content).toContain("Vary the length, rhythm, and structure of your replies");
  });

  it("moves modality, constraints, and summaries into the system message and keeps the user turn plain", () => {
    const messages = buildSessionResponseMessages(input);
    const systemMessage = messages[0];
    const finalUserMessage = messages.at(-1);

    expect(systemMessage.content).toContain("## Selected modality and avatar");
    expect(systemMessage.content).toContain(input.modality.modalityName);
    expect(systemMessage.content).toContain(input.modality.avatarName);
    expect(systemMessage.content).toContain(input.modality.sessionStyleHint);
    expect(systemMessage.content).toContain("## Caution constraints");
    expect(systemMessage.content).toContain("avoid_diagnosis");
    expect(systemMessage.content).toContain("## Approved prior-session summaries");
    expect(systemMessage.content).toContain("Zatwierdzone podsumowanie poprzedniej rozmowy.");
    expect(systemMessage.content).toContain("User locale: pl");

    expect(finalUserMessage?.role).toBe("user");
    expect(finalUserMessage?.content).toBe(input.currentUserMessage);
    expect(finalUserMessage?.content).not.toContain("sessionStyleHint");
    expect(finalUserMessage?.content).not.toContain("avoid_diagnosis");
  });

  it("omits constraint and summary sections when none are provided", () => {
    const messages = buildSessionResponseMessages({
      ...input,
      cautionConstraints: [],
      approvedSummaries: [],
    });

    expect(messages[0]?.content).not.toContain("## Caution constraints");
    expect(messages[0]?.content).not.toContain("## Approved prior-session summaries");
  });

  it("keeps recent context bounded and separate from the current message", () => {
    const longMessages = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `wiadomosc-${index}-`.repeat(200),
      sequenceIndex: index,
    })) satisfies GenerateSessionResponseInput["recentMessages"];

    const messages = buildSessionResponseMessages({
      ...input,
      recentMessages: longMessages,
      currentUserMessage: "aktualna-wiadomosc ".repeat(400),
    });
    const recentContextMessages = messages.slice(1, -1);

    expect(recentContextMessages).toHaveLength(8);
    expect(recentContextMessages[0]?.content).toContain("wiadomosc-4");
    expect(recentContextMessages.every((message) => message.content.length <= 1_200)).toBe(true);
    expect(messages.at(-1)?.content).toContain("aktualna-wiadomosc");
    expect(messages.at(-1)?.content.length).toBeLessThanOrEqual(3_000);
  });

  it("passes the selected modality style hint without cutting off the reply-shape guidance", () => {
    const modality = MVP_MODALITIES.find((item) => item.avatarId === "cbt-guide");

    expect(modality).toBeDefined();

    if (!modality) {
      return;
    }

    const messages = buildSessionResponseMessages({
      ...input,
      modality: {
        modalityName: modality.modalityName,
        avatarName: modality.avatarName,
        sessionStyleHint: modality.sessionStyleHint,
      },
    });

    expect(messages[0]?.content).toContain("Reply shapes");
    expect(messages[0]?.content).toContain("CBT jargon");
  });

  it("keeps approved summaries capped at three and separate from raw prior messages", () => {
    const messages = buildSessionResponseMessages({
      ...input,
      approvedSummaries: Array.from({ length: 5 }, (_, index) => ({
        summaryText: `approved-summary-${index} `.repeat(100),
        revision: index + 1,
        createdAt: "2026-06-07T09:00:00.000Z",
      })),
    });
    const systemContent = messages[0]?.content ?? "";

    expect(systemContent).toContain("approved-summary-0");
    expect(systemContent).toContain("approved-summary-1");
    expect(systemContent).toContain("approved-summary-2");
    expect(systemContent).not.toContain("approved-summary-3");
    expect(systemContent).not.toContain("approved-summary-4");
    expect(systemContent).toContain("Do not use raw prior-session messages as prior-session context");
  });
});

describe("MVP_MODALITIES session style hints", () => {
  const expectedAvatarNamesById = {
    "psychodynamic-listener": "Lena",
    "cbt-guide": "Marek",
    "experiential-companion": "Nadia",
    "systemic-connector": "Olek",
    "integrative-guide": "Iga",
  } as const;

  it("keeps all five avatar IDs with non-empty named style hints", () => {
    for (const [avatarId, avatarName] of Object.entries(expectedAvatarNamesById)) {
      const modality = MVP_MODALITIES.find((item) => item.avatarId === avatarId);

      expect(modality, `Missing avatar ${avatarId}`).toBeDefined();
      expect(modality?.sessionStyleHint.trim().length).toBeGreaterThan(0);
      expect(modality?.sessionStyleHint).toContain(avatarName);
    }
  });

  it("preserves Polish modality and avatar wording in the style hints", () => {
    const hints = MVP_MODALITIES.map((item) => item.sessionStyleHint).join("\n");

    for (const term of [
      "uważna",
      "słuchaczka",
      "poznawczo-behawioralne",
      "humanistyczno-doświadczeniowe",
      "łącznik",
      "przewodniczka",
      "wątek",
      "relacji",
    ]) {
      expect(hints).toContain(term);
    }
  });

  it("treats example phrases as inspiration and allows replies without questions in every hint", () => {
    for (const modality of MVP_MODALITIES) {
      expect(modality.sessionStyleHint).toContain("never repeat them verbatim");
      expect(modality.sessionStyleHint).toContain("Reply shapes");
      expect(modality.sessionStyleHint).toContain("no question");
    }
  });

  it("keeps every style hint within the prompt budget", () => {
    for (const modality of MVP_MODALITIES) {
      expect(modality.sessionStyleHint.length).toBeLessThanOrEqual(4_000);
    }
  });
});
