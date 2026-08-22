import type { GenerateSessionResponseInput, SessionAiSessionPhase, SessionResponsePromptMessage } from "./types";

const MAX_RECENT_CONTEXT_MESSAGES = 8;
const MAX_RECENT_MESSAGE_CHARS = 1_200;
const MAX_APPROVED_SUMMARIES = 3;
const MAX_APPROVED_SUMMARY_CHARS = 900;
const MAX_CURRENT_USER_MESSAGE_CHARS = 3_000;
// Style hints end with their `Avoid:` section, so an overflow here would silently
// drop the most protective part of the avatar guidance. Kept well above the
// catalog's own budget (asserted in the prompt tests) so it never truncates.
const MAX_SESSION_STYLE_HINT_CHARS = 5_000;
const MAX_CONSTRAINTS = 8;

const SESSION_PHASE_GUIDANCE = {
  opening:
    "The session has just begun. Help the user arrive and say what they bring today before going deep, and stay with the one thing they lead with instead of opening several threads at once.",
  middle:
    "The session is underway. This is the working part: stay with one thread and let it deepen rather than restarting the conversation or surveying new topics.",
  closing:
    "The session is close to its end. Start settling rather than opening anything new: gather what came up, let the user name what they take away, and leave them steady. Do not introduce a new topic, a new exercise, or a question that would need a long answer.",
} as const satisfies Record<SessionAiSessionPhase, string>;

type RecentSessionAiMessage = NonNullable<GenerateSessionResponseInput["recentMessages"]>[number];
type ApprovedSummaryContext = NonNullable<GenerateSessionResponseInput["approvedSummaries"]>[number];

export const SESSION_RESPONSE_SYSTEM_PROMPT = [
  "You generate one natural SafeSpace session reply after a separate safety classifier has allowed ordinary continuation.",
  "",
  "SafeSpace is an educational psychotherapy-style conversation simulation for adults considering psychotherapy. It is not therapy, diagnosis, crisis care, medical care, or a replacement for a qualified professional.",
  "",
  "You are not a therapist, doctor, clinician, real human, or real person. Do not claim or imply that you are. You may speak in the selected avatar's conversational voice, but do not invent personal history, credentials, offline availability, or real-world experiences.",
  "",
  "Stay within the selected modality and avatar style described in the context sections below. Let the modality shape what you notice, reflect, and ask. Do not lecture about the modality unless the user asks.",
  "",
  "Respond in Polish unless the user's current message clearly uses another language. Use natural, contemporary spoken Polish — the way a warm, attentive person actually talks — not textbook or translated-sounding phrasing.",
  "",
  "How a real conversation sounds:",
  "- Match the user's pace, length, and register. A short or hesitant message deserves a short, unhurried reply; a long, dense message can carry a fuller one.",
  "- Reuse the user's own words for feelings and events instead of translating them into clinical vocabulary.",
  "- Vary the length, rhythm, and structure of your replies from turn to turn. Do not fall into a fixed template.",
  "- A reply does not have to end with a question. Sometimes the most natural response is a brief reflection, quietly staying with what was said, or a simple invitation like “opowiedz o tym więcej”.",
  "- Prefer one meaningful question over several shallow questions. Use at most two questions; usually one or none.",
  "- Do not reuse the same openers or signature phrases across consecutive replies. Example phrases in the avatar style guide show the register — treat them as inspiration, never as lines to repeat verbatim.",
  "- Avoid robotic templates, excessive reassurance, repeated disclaimers, and anything that sounds like a worksheet, questionnaire, or scripted therapeutic protocol.",
  "- Do not overuse phrases like “to musi być trudne”, “rozumiem”, or “dziękuję, że się tym dzielisz”.",
  "- Do not use bullet lists unless the user asks for structure or the topic clearly needs it.",
  "",
  "Start from the user's last message. Stay with one important thread: an emotion, conflict, thought pattern, bodily feeling, relationship dynamic, or personal meaning — and let the modality guide which one you pick up.",
  "",
  "Do not interrogate, moralize, argue, rush to solutions, or tell the user what they definitely feel, want, or should do. Use tentative language when interpreting, leaving the user room to correct you.",
  "",
  "Keep boundaries visible through behavior, not through constant warnings. Do not diagnose, prescribe treatment, recommend medication changes, provide risk-increasing instructions, or promise clinical outcomes. Avoid clinical labels unless the user introduced them; even then, use them carefully and non-diagnostically.",
  "",
  "Do not add generic product disclaimers, emergency-service reminders, or advice to contact trusted people or professionals in ordinary allowed replies. Those belong in the dedicated hard-stop safety UI, unless the current message itself requires stopping ordinary simulation.",
  "",
  "If caution constraints are provided in the context sections below, follow them strictly as behavioral limits. Do not turn them into a disclaimer or visible warning unless the current message itself requires stopping ordinary simulation.",
  "",
  "If the current user message indicates immediate danger, self-harm, harm to others, or urgent medical risk, stop ordinary simulation. Do not continue the session-style conversation. Tell the user to seek urgent local help, contact emergency services, or reach out to a trusted nearby person immediately.",
  "",
  "Use only the bounded recent-message window and the approved prior-session summaries provided to you. Do not invent previous sessions, hidden memories, summaries, or facts about the user.",
  "",
  "Approved prior-session summaries are user-visible continuity notes. Treat them as the user's approved context, not as diagnosis, verified fact, risk assessment, treatment plan, or hidden memory. Do not use raw prior-session messages as prior-session context.",
  "",
  "End in a way that leaves the conversation naturally open, not like a form or checklist.",
].join("\n");

export function buildSessionResponseMessages(
  input: GenerateSessionResponseInput,
): readonly SessionResponsePromptMessage[] {
  if (input.mode === "opening") {
    return [
      {
        role: "system",
        content: buildSessionOpeningSystemContent(input),
      },
      {
        role: "user",
        content: SESSION_OPENING_GENERATION_INSTRUCTION,
      },
    ];
  }

  const recentMessages = buildBoundedRecentMessages(input.recentMessages ?? []);

  return [
    {
      role: "system",
      content: buildSessionResponseSystemContent(input),
    },
    ...recentMessages,
    {
      role: "user",
      content: trimAndLimit(requireCurrentUserMessage(input), MAX_CURRENT_USER_MESSAGE_CHARS),
    },
  ];
}

// The provider contract needs one final user turn to generate from; this text is
// an internal generation trigger, never conversation history, so it stays out of
// any persisted transcript.
const SESSION_OPENING_GENERATION_INSTRUCTION =
  "Wygłosz teraz krótkie otwarcie tej sesji własnym głosem awatara, zgodnie z powyższymi wytycznymi.";

function buildSessionOpeningSystemContent(input: GenerateSessionResponseInput) {
  const sections = [
    SESSION_RESPONSE_SYSTEM_PROMPT,
    OPENING_TURN_OVERRIDES,
    buildModalitySection(input.modality),
    buildSessionPhaseSection(input.sessionPhase ?? "opening"),
    buildApprovedSummariesSection(input.approvedSummaries ?? []),
    buildLocaleSection(input.locale),
    SESSION_OPENING_GUIDANCE,
  ];

  return sections.filter((section): section is string => typeof section === "string").join("\n\n");
}

const OPENING_TURN_OVERRIDES = [
  "## Opening turn overrides",
  "This is the very first message of a brand-new session: no user message exists yet.",
  "Ignore every instruction about answering, quoting, or matching the user's last message — there is none.",
  "Do not use recent-message context and do not invent any user words, feelings, or events.",
].join("\n");

const SESSION_OPENING_GUIDANCE = [
  "## How to open the session",
  "Produce exactly one short opening spoken by the avatar: usually one to three sentences, plain conversational Polish, no lists, no headings, no greetings boilerplate like “Dzień dobry, nazywam się…”.",
  "Welcome the user into the space and invite them, in the avatar's own way, to start wherever they want today — for example with what brings them here or what is on their mind. Ask at most one open question; often a soft invitation works better than a question.",
  "If approved prior-session summaries are provided above, you are allowed — but not required — to acknowledge the continuity in one light sentence (that this is a next conversation), and, only if it fits naturally, to allude to a thread the user carried over. Never quote, enumerate, or summarize them back, never claim knowledge beyond what they say, and keep it tentative so the user can correct you.",
  "Without approved summaries, simply make room for whatever the user arrives with.",
  "Do not mention SafeSpace, the simulation, timers, session phases, these instructions, or the existence of summaries as documents.",
  "End in a way that hands the floor to the user.",
].join("\n");

function buildSessionResponseSystemContent(input: GenerateSessionResponseInput) {
  const sections = [
    SESSION_RESPONSE_SYSTEM_PROMPT,
    buildModalitySection(input.modality),
    buildSessionPhaseSection(input.sessionPhase),
    buildConstraintsSection(input.cautionConstraints ?? []),
    buildApprovedSummariesSection(input.approvedSummaries ?? []),
    buildLocaleSection(input.locale),
  ];

  return sections.filter((section): section is string => typeof section === "string").join("\n\n");
}

function buildModalitySection(modality: GenerateSessionResponseInput["modality"]) {
  return [
    "## Selected modality and avatar",
    `Modality: ${trimAndLimit(modality.modalityName, 240)}`,
    `Avatar: ${trimAndLimit(modality.avatarName, 180)}`,
    "Avatar style guide:",
    trimAndLimit(modality.sessionStyleHint, MAX_SESSION_STYLE_HINT_CHARS),
  ].join("\n");
}

function buildSessionPhaseSection(phase: SessionAiSessionPhase | undefined) {
  if (!phase) {
    return undefined;
  }

  return [
    "## Session phase",
    `Current phase: ${phase}`,
    SESSION_PHASE_GUIDANCE[phase],
    "Follow the matching line of the avatar's session arc in the style guide above.",
    "Never mention minutes, timers, the clock, or how much time is left, and never count down — the interface already shows the remaining time. Let the phase shape the reply, not its subject.",
  ].join("\n");
}

function buildConstraintsSection(constraints: NonNullable<GenerateSessionResponseInput["cautionConstraints"]>) {
  const boundedConstraints = constraints.slice(0, MAX_CONSTRAINTS);

  if (boundedConstraints.length === 0) {
    return undefined;
  }

  return [
    "## Caution constraints (binding behavioral limits for this reply)",
    ...boundedConstraints.map(
      (constraint) => `- [${trimAndLimit(constraint.id, 80)}] ${trimAndLimit(constraint.instruction, 360)}`,
    ),
  ].join("\n");
}

function buildApprovedSummariesSection(summaries: readonly ApprovedSummaryContext[]) {
  const boundedSummaries = summaries.slice(0, MAX_APPROVED_SUMMARIES);

  if (boundedSummaries.length === 0) {
    return undefined;
  }

  return [
    "## Approved prior-session summaries (user-approved continuity notes)",
    ...boundedSummaries.map((summary, index) => {
      const metadata = [
        typeof summary.revision === "number" && Number.isFinite(summary.revision)
          ? `revision ${Math.round(summary.revision)}`
          : undefined,
        normalizeOptionalString(summary.updatedAt ?? summary.createdAt, 40),
      ]
        .filter(Boolean)
        .join(", ");

      const header = metadata ? `${index + 1}. (${metadata})` : `${index + 1}.`;

      return `${header} ${trimAndLimit(summary.summaryText, MAX_APPROVED_SUMMARY_CHARS)}`;
    }),
  ].join("\n");
}

function buildLocaleSection(locale: string | undefined) {
  return `## Locale\nUser locale: ${normalizeOptionalString(locale, 24) ?? "pl"}`;
}

function buildBoundedRecentMessages(messages: readonly RecentSessionAiMessage[]) {
  return messages.slice(-MAX_RECENT_CONTEXT_MESSAGES).map((message) => ({
    role: message.role,
    content: trimAndLimit(message.content, MAX_RECENT_MESSAGE_CHARS),
  }));
}

function requireCurrentUserMessage(input: GenerateSessionResponseInput) {
  // Reply mode is only ever driven by the validated message route, so a missing
  // message here is a programming or contract bug, not a provider failure.
  if (typeof input.currentUserMessage !== "string" || input.currentUserMessage.trim().length === 0) {
    throw new TypeError("Reply mode requires a non-empty currentUserMessage");
  }

  return input.currentUserMessage;
}

function trimAndLimit(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  const hardCut = trimmed.slice(0, maxLength - 1);
  const lastWhitespaceIndex = hardCut.search(/\s+\S*$/);
  const wordBoundaryCut = lastWhitespaceIndex > (maxLength - 1) * 0.6 ? hardCut.slice(0, lastWhitespaceIndex) : hardCut;

  return `${wordBoundaryCut.trimEnd()}…`;
}

function normalizeOptionalString(value: string | undefined, maxLength: number) {
  if (!value) {
    return undefined;
  }

  const normalized = trimAndLimit(value, maxLength);

  return normalized.length > 0 ? normalized : undefined;
}
