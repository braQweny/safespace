import type { GenerateSessionResponseInput, SessionResponsePromptMessage } from "./types";

const MAX_RECENT_CONTEXT_MESSAGES = 8;
const MAX_RECENT_MESSAGE_CHARS = 1_200;
const MAX_CURRENT_USER_MESSAGE_CHARS = 3_000;
const MAX_CONSTRAINTS = 8;

type RecentSessionAiMessage = NonNullable<GenerateSessionResponseInput["recentMessages"]>[number];

export const SESSION_RESPONSE_SYSTEM_PROMPT = [
  "You generate ordinary SafeSpace session replies after a separate safety classifier has allowed continuation.",
  "SafeSpace is an educational simulation for adults considering psychotherapy; it is not therapy, diagnosis, crisis care, or a replacement for a specialist.",
  "Stay within the selected modality style, but do not claim to be a therapist, doctor, clinician, or real person.",
  "Do not diagnose, prescribe treatment, recommend medication changes, provide risk-increasing instructions, or promise clinical outcomes.",
  "Use calm, reflective, non-clinical language and help the user organize thoughts with one or two focused questions or observations.",
  "If caution constraints are provided, follow them strictly and keep the boundary visible without alarming the user.",
  "If the user describes immediate danger, self-harm, harm to others, or urgent medical risk, do not continue ordinary simulation; tell them to use urgent local help.",
  "Do not invent session summaries or use previous-session context; S-04 only provides a bounded recent-message window.",
  "Respond in Polish unless the user's current message clearly uses another language.",
].join("\n");

export function buildSessionResponseMessages(
  input: GenerateSessionResponseInput,
): readonly SessionResponsePromptMessage[] {
  const recentMessages = buildBoundedRecentMessages(input.recentMessages ?? []);

  return [
    {
      role: "system",
      content: SESSION_RESPONSE_SYSTEM_PROMPT,
    },
    ...recentMessages,
    {
      role: "user",
      content: buildSessionResponseUserContent(input),
    },
  ];
}

function buildSessionResponseUserContent(input: GenerateSessionResponseInput) {
  return JSON.stringify({
    currentUserMessage: trimAndLimit(input.currentUserMessage, MAX_CURRENT_USER_MESSAGE_CHARS),
    selectedModality: {
      modalityName: trimAndLimit(input.modality.modalityName, 240),
      avatarName: trimAndLimit(input.modality.avatarName, 180),
      sessionStyleHint: trimAndLimit(input.modality.sessionStyleHint, 800),
    },
    cautionConstraints: (input.cautionConstraints ?? []).slice(0, MAX_CONSTRAINTS).map((constraint) => ({
      id: trimAndLimit(constraint.id, 80),
      instruction: trimAndLimit(constraint.instruction, 360),
    })),
    locale: normalizeOptionalString(input.locale, 24) ?? "pl",
  });
}

function buildBoundedRecentMessages(messages: readonly RecentSessionAiMessage[]) {
  return messages.slice(-MAX_RECENT_CONTEXT_MESSAGES).map((message) => ({
    role: message.role,
    content: trimAndLimit(message.content, MAX_RECENT_MESSAGE_CHARS),
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
