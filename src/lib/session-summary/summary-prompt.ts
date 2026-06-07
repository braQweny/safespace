import type { GenerateSessionSummaryInput, SessionSummaryPromptMessage } from "./types";

const MAX_SUMMARY_SOURCE_MESSAGES = 40;
const MAX_SUMMARY_SOURCE_MESSAGE_CHARS = 1_200;
const MAX_SESSION_STYLE_HINT_CHARS = 3_000;

type SummarySourceMessage = GenerateSessionSummaryInput["messages"][number];

export const SESSION_SUMMARY_SYSTEM_PROMPT = [
  "You write one concise SafeSpace continuity summary for the user to review before it can be used in a later session.",
  "",
  "SafeSpace is an educational psychotherapy-style conversation simulation. It is not therapy, diagnosis, crisis care, medical care, or a replacement for a qualified professional.",
  "",
  "The summary must be user-visible continuity notes, not a hidden memory, therapist note, diagnosis, risk assessment, treatment plan, clinical recommendation, or advice.",
  "",
  "Write in Polish unless the conversation is clearly in another language.",
  "",
  "Summarize only what appears in the provided conversation. Do not infer diagnoses, causes, traumas, intentions, facts about other people, or real-world risks beyond the text.",
  "",
  "Prefer 3 to 5 short sentences. Focus on themes the user raised, important emotions or conflicts, and open questions that may help continue the simulation.",
  "",
  "Do not include crisis instructions, safety classification, provider metadata, IDs, timestamps, message counts, or implementation details.",
].join("\n");

export function buildSessionSummaryMessages(
  input: GenerateSessionSummaryInput,
): readonly SessionSummaryPromptMessage[] {
  return [
    {
      role: "system",
      content: SESSION_SUMMARY_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: buildSessionSummaryUserContent(input),
    },
  ];
}

function buildSessionSummaryUserContent(input: GenerateSessionSummaryInput) {
  return JSON.stringify({
    locale: normalizeOptionalString(input.locale, 24) ?? "pl",
    selectedModality: input.modality
      ? {
          modalityName: trimAndLimit(input.modality.modalityName, 240),
          avatarName: trimAndLimit(input.modality.avatarName, 180),
          sessionStyleHint: trimAndLimit(input.modality.sessionStyleHint, MAX_SESSION_STYLE_HINT_CHARS),
        }
      : null,
    conversationMessages: buildBoundedSummaryMessages(input.messages),
  });
}

function buildBoundedSummaryMessages(messages: readonly SummarySourceMessage[]) {
  return messages.slice(-MAX_SUMMARY_SOURCE_MESSAGES).map((message) => ({
    role: message.role,
    content: trimAndLimit(message.content, MAX_SUMMARY_SOURCE_MESSAGE_CHARS),
  }));
}

function trimAndLimit(value: string, maxLength: number) {
  const trimmed = value.trim();

  return trimmed.length > maxLength ? trimmed.slice(0, maxLength).trimEnd() : trimmed;
}

function normalizeOptionalString(value: string | undefined, maxLength: number) {
  if (!value) {
    return undefined;
  }

  const normalized = trimAndLimit(value, maxLength);

  return normalized.length > 0 ? normalized : undefined;
}
