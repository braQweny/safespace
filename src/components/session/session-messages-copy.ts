import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

const SESSION_MESSAGES_COPY = defineCopy(
  {
    safetyBoundary: "Safety boundary",
    you: "You",
    youPrefix: "You: ",
    thinking: (name: string) => `${name} is thinking`,
    thinkingAria: (name: string) => `${name} is thinking...`,
    transcriptAria: "Conversation transcript",
    emptyDefault: "The first message can be short. Describe the situation you'd like to calmly sort through.",
  },
  {
    safetyBoundary: "Granica bezpieczeństwa",
    you: "Ty",
    youPrefix: "Ty: ",
    thinking: (name) => `${name} myśli`,
    thinkingAria: (name) => `${name} myśli...`,
    transcriptAria: "Przebieg rozmowy",
    emptyDefault: "Pierwsza wiadomość może być krótka. Opisz sytuację, którą chcesz spokojnie uporządkować.",
  },
);

export function getSessionMessagesCopy(locale: Locale) {
  return SESSION_MESSAGES_COPY[locale];
}
