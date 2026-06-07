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
} satisfies GenerateSessionResponseInput;

describe("buildSessionResponseMessages", () => {
  it("frames ordinary replies as educational, modality-aware, and non-diagnostic", () => {
    const messages = buildSessionResponseMessages(input);

    expect(messages[0]).toEqual({
      role: "system",
      content: SESSION_RESPONSE_SYSTEM_PROMPT,
    });
    expect(messages[0]?.content).toContain("one natural SafeSpace session reply");
    expect(messages[0]?.content).toContain(
      "not therapy, diagnosis, crisis care, medical care, or a replacement for a qualified professional",
    );
    expect(messages[0]?.content).toContain("not a therapist, doctor, clinician, real human, or real person");
    expect(messages[0]?.content).toContain("Prefer one meaningful question over several shallow questions");
    expect(messages[0]?.content).toContain("Do not diagnose");

    const finalUserMessage = messages.at(-1);
    expect(finalUserMessage?.role).toBe("user");
    expect(finalUserMessage?.content).toContain(input.currentUserMessage);
    expect(finalUserMessage?.content).toContain(input.modality.sessionStyleHint);
    expect(finalUserMessage?.content).toContain("avoid_diagnosis");
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
      currentUserMessage: "aktualna-wiadomosc-".repeat(400),
    });
    const recentContextMessages = messages.slice(1, -1);

    expect(recentContextMessages).toHaveLength(8);
    expect(recentContextMessages[0]?.content).toContain("wiadomosc-4");
    expect(recentContextMessages.every((message) => message.content.length <= 1_200)).toBe(true);
    expect(messages.at(-1)?.content).toContain("aktualna-wiadomosc");
    expect(messages.at(-1)?.content.length).toBeLessThan(4_500);
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

    expect(messages.at(-1)?.content).toContain("Typical reply shape");
    expect(messages.at(-1)?.content).toContain("ask one practical question");
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
});
