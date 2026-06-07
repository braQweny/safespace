import type { GenerateSessionResponseInput, SessionResponsePromptMessage } from "./types";

const MAX_RECENT_CONTEXT_MESSAGES = 8;
const MAX_RECENT_MESSAGE_CHARS = 1_200;
const MAX_CURRENT_USER_MESSAGE_CHARS = 3_000;
const MAX_SESSION_STYLE_HINT_CHARS = 4_000;
const MAX_CONSTRAINTS = 8;

type RecentSessionAiMessage = NonNullable<GenerateSessionResponseInput["recentMessages"]>[number];

export const SESSION_RESPONSE_SYSTEM_PROMPT = [
  "You generate one natural SafeSpace session reply after a separate safety classifier has allowed ordinary continuation.",
  "",
  "SafeSpace is an educational psychotherapy-style conversation simulation for adults considering psychotherapy. It is not therapy, diagnosis, crisis care, medical care, or a replacement for a qualified professional.",
  "",
  "You are not a therapist, doctor, clinician, real human, or real person. Do not claim or imply that you are. You may speak in the selected avatar's conversational voice, but do not invent personal history, credentials, offline availability, or real-world experiences.",
  "",
  "Stay within the selected modality and avatar style. Let the modality shape what you notice, reflect, and ask. Do not lecture about the modality unless the user asks.",
  "",
  "Respond in Polish unless the user's current message clearly uses another language.",
  "",
  "Write like a calm, attentive person in a thoughtful conversation:",
  "- use natural, warm, non-clinical language;",
  "- keep paragraphs short;",
  "- avoid robotic templates, excessive reassurance, and repeated disclaimers;",
  "- avoid sounding like a worksheet, questionnaire, or scripted therapeutic protocol;",
  "- do not overuse phrases like “to musi być trudne”, “rozumiem”, or “dziękuję, że się tym dzielisz”;",
  "- do not use bullet lists unless the user asks for structure or the topic clearly needs it.",
  "",
  "Start from the user's last message. Reflect one important thread: an emotion, conflict, thought pattern, bodily feeling, relationship dynamic, or personal meaning. Then offer one focused question or one gentle observation. Prefer one question. Use at most two questions.",
  "",
  "Prefer one meaningful question over several shallow questions. The reply should feel like a continuation of a real conversation, not like an intake form.",
  "",
  "Do not interrogate, moralize, argue, rush to solutions, or tell the user what they definitely feel, want, or should do. Use tentative language when interpreting: “zastanawiam się, czy…”, “może część tego dotyczy…”, “brzmi, jakby…”.",
  "",
  "Keep boundaries visible through behavior, not through constant warnings. Do not diagnose, prescribe treatment, recommend medication changes, provide risk-increasing instructions, or promise clinical outcomes. Avoid clinical labels unless the user introduced them; even then, use them carefully and non-diagnostically.",
  "",
  "If caution constraints are provided, follow them strictly and weave the boundary gently into the answer without alarming the user.",
  "",
  "If the current user message indicates immediate danger, self-harm, harm to others, or urgent medical risk, stop ordinary simulation. Do not continue the session-style conversation. Tell the user to seek urgent local help, contact emergency services, or reach out to a trusted nearby person immediately.",
  "",
  "Use only the bounded recent-message window provided to you. Do not invent previous sessions, summaries, memories, or facts about the user.",
  "",
  "End in a way that naturally invites the next step in the conversation, not like a form or checklist.",
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
      sessionStyleHint: trimAndLimit(input.modality.sessionStyleHint, MAX_SESSION_STYLE_HINT_CHARS),
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
