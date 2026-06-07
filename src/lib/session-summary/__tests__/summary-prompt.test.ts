import { describe, expect, it } from "vitest";
import { buildSessionSummaryMessages, SESSION_SUMMARY_SYSTEM_PROMPT } from "../summary-prompt";
import type { GenerateSessionSummaryInput } from "../types";

const input = {
  locale: "pl",
  modality: {
    modalityName: "Podejscie integracyjne",
    avatarName: "Iga, przewodniczka laczaca watki",
    sessionStyleHint: "Avatar pomaga wybrac jeden czytelny punkt zaczepienia.",
  },
  messages: [
    {
      role: "user",
      content: "Chce wrocic do rozmowy o napieciu w pracy.",
      sequenceIndex: 0,
    },
    {
      role: "assistant",
      content: "Mozemy zobaczyc, ktory watek jest teraz najwazniejszy.",
      sequenceIndex: 1,
    },
  ],
} satisfies GenerateSessionSummaryInput;

describe("buildSessionSummaryMessages", () => {
  it("frames summary generation as visible continuity notes, not clinical memory", () => {
    const messages = buildSessionSummaryMessages(input);

    expect(messages[0]).toEqual({
      role: "system",
      content: SESSION_SUMMARY_SYSTEM_PROMPT,
    });
    expect(messages[0]?.content).toContain("user to review before it can be used in a later session");
    expect(messages[0]?.content).toContain("not a hidden memory");
    expect(messages[0]?.content).toContain("not a hidden memory, therapist note, diagnosis");
    expect(messages[0]?.content).toContain("Do not infer diagnoses");
    expect(messages[0]?.content).toContain("Do not include crisis instructions, safety classification");

    const finalMessage = messages.at(-1);
    expect(finalMessage?.role).toBe("user");
    expect(finalMessage?.content).toContain("Chce wrocic do rozmowy");
    expect(finalMessage?.content).toContain("Iga, przewodniczka laczaca watki");
  });

  it("bounds source messages before provider input", () => {
    const messages = buildSessionSummaryMessages({
      ...input,
      messages: Array.from({ length: 45 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `wiadomosc-${index}-`.repeat(200),
        sequenceIndex: index,
      })),
    });
    const finalPayload = JSON.parse(messages.at(-1)?.content ?? "{}") as {
      conversationMessages?: { content: string }[];
    };

    expect(finalPayload.conversationMessages).toHaveLength(40);
    expect(finalPayload.conversationMessages?.[0]?.content).toContain("wiadomosc-5");
    expect(finalPayload.conversationMessages?.every((message) => message.content.length <= 1_200)).toBe(true);
  });
});
