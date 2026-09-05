import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";
import type { SessionPhase } from "@/lib/session-flow/session-phase";

interface SessionTimerCopy {
  phaseLabels: Readonly<Record<SessionPhase, string>>;
  unknown: string;
  approxMinutes: (minutes: number) => string;
  ofTotalMinutes: (minutes: number) => string;
  timeRunningOut: string;
  ariaRemaining: string;
  ariaRemainingWarning: string;
  ariaRemainingCritical: string;
  statusWarning: string;
  statusCritical: string;
}

const SESSION_TIMER_COPY = defineCopy<SessionTimerCopy>(
  {
    phaseLabels: { opening: "opening", middle: "in progress", closing: "closing" },
    unknown: "—",
    approxMinutes: (minutes) => `~${minutes} min`,
    ofTotalMinutes: (minutes) => `of ${minutes} min`,
    timeRunningOut: "time is running out",
    ariaRemaining: "Conversation time left",
    ariaRemainingWarning: "Conversation time left — under 5 minutes",
    ariaRemainingCritical: "Conversation time left — under 2 minutes",
    statusWarning: "Less than 5 minutes of the conversation left.",
    statusCritical: "Less than 2 minutes of the conversation left.",
  },
  {
    phaseLabels: { opening: "początek", middle: "w trakcie", closing: "domykanie" },
    unknown: "—",
    approxMinutes: (minutes) => `ok. ${minutes} min`,
    ofTotalMinutes: (minutes) => `z ${minutes} min`,
    timeRunningOut: "kończy się czas",
    ariaRemaining: "Pozostały czas rozmowy",
    ariaRemainingWarning: "Pozostały czas rozmowy — mniej niż 5 minut",
    ariaRemainingCritical: "Pozostały czas rozmowy — mniej niż 2 minuty",
    statusWarning: "Zostało mniej niż 5 minut rozmowy.",
    statusCritical: "Zostało mniej niż 2 minuty rozmowy.",
  },
);

export function getSessionTimerCopy(locale: Locale): SessionTimerCopy {
  return SESSION_TIMER_COPY[locale];
}
