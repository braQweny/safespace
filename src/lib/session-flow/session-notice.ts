import type { SessionAiFailureCopy } from "@/lib/session-ai/types";
import type { CrisisResourceRegion, SessionSafetyCopy } from "@/lib/session-safety/types";

/**
 * Powiadomienie na ekranie rozmowy — wspólny kształt dla rozmowy pisanej
 * (`useTimedSession`) i głosowej (`voice-session-state`), bo oba ekrany
 * renderują je tym samym `SessionSafetyNotice`, a zakończenie rozmowy
 * (`endTimedSession`) dostarcza je obu reduktorom.
 */
export interface SessionNoticeState {
  variant: "hard_stop" | "retry" | "info";
  copy: SessionSafetyCopy | SessionAiFailureCopy;
  crisisResources?: readonly CrisisResourceRegion[];
}

export function buildInfoNotice(title: string, body: string): SessionNoticeState {
  return {
    variant: "info",
    copy: {
      title,
      body,
      nextSteps: [],
    },
  };
}
