import { describe, expect, it } from "vitest";
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
    expect(messages[0]?.content).toContain("educational simulation");
    expect(messages[0]?.content).toContain("not therapy, diagnosis, crisis care, or a replacement for a specialist");
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
});
