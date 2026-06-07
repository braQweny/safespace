import type { SessionMessageViewModel } from "./message-contract";
import type { SessionMessageView, SessionView } from "./session-state";

export type UiSessionMessage = SessionMessageView | SessionMessageViewModel;

export interface ComposerAvailabilityInput {
  session: Pick<SessionView, "status" | "remainingSeconds"> | null;
  isPending: boolean;
  isHardStopped: boolean;
  isClientExpired: boolean;
}

function parseTimestampMs(timestamp: string | null) {
  if (!timestamp) {
    return null;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

export function computeClientRemainingSeconds(expiresAt: string | null, nowMs = Date.now()) {
  const expiresAtMs = parseTimestampMs(expiresAt);

  if (expiresAtMs === null) {
    return null;
  }

  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
}

export function formatRemainingTime(totalSeconds: number | null) {
  if (totalSeconds === null) {
    return "--:--";
  }

  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function isComposerAvailable(input: ComposerAvailabilityInput) {
  return (
    input.session?.status === "active" &&
    input.session.remainingSeconds !== 0 &&
    !input.isPending &&
    !input.isHardStopped &&
    !input.isClientExpired
  );
}

export function appendSuccessfulTurn(
  messages: readonly UiSessionMessage[],
  turn: {
    user: SessionMessageViewModel;
    assistant: SessionMessageViewModel;
  },
): UiSessionMessage[] {
  return [...messages, turn.user, turn.assistant].sort((left, right) => left.sequenceIndex - right.sequenceIndex);
}
