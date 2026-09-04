import type { SessionMessageViewModel } from "./message-contract";
import type { SessionMessageView, SessionStartPageStateKind, SessionView } from "./session-state";

export type UiSessionMessage = SessionMessageView | SessionMessageViewModel;

export interface ComposerAvailabilityInput {
  session: Pick<SessionView, "status" | "remainingSeconds"> | null;
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

/**
 * Ile milisekund trzeba dodać do zegara klienta, żeby zgadzał się z serwerem.
 * Serwer podał `remainingSeconds` liczone od swojego „teraz”, więc
 * `expiresAt - remaining` to serwerowe „teraz”; różnica z lokalnym `Date.now()`
 * to przesunięcie zegara. Bez tego klient z zegarem przestawionym o pięć minut
 * kończył rozmowę pięć minut za wcześnie — albo pisał do sesji, która dawno
 * wygasła.
 */
export function computeServerClockOffsetMs(
  expiresAt: string | null,
  remainingSeconds: number | null,
  nowMs = Date.now(),
) {
  const expiresAtMs = parseTimestampMs(expiresAt);

  if (expiresAtMs === null || remainingSeconds === null || !Number.isFinite(remainingSeconds)) {
    return 0;
  }

  return expiresAtMs - remainingSeconds * 1000 - nowMs;
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

/**
 * Czy pole pisania jest w ogóle otwarte. Tura w locie nie zamyka pola — wtedy
 * jest tylko do odczytu, żeby nie gubić fokusu — więc `isPending` nie jest
 * częścią tej odpowiedzi; wysyłkę blokuje osobno ten, kto wysyła.
 */
export function isComposerAvailable(input: ComposerAvailabilityInput) {
  return (
    input.session?.status === "active" &&
    input.session.remainingSeconds !== 0 &&
    !input.isHardStopped &&
    !input.isClientExpired
  );
}

/**
 * Stan, z którego rozmowa już nie wraca. Odpowiedź, która dotrze po takim
 * przejściu (koniec sesji kliknięty w trakcie tury), nie może cofnąć widoku
 * do „aktywnej” — może co najwyżej dopisać się do zapisu.
 */
export function isTerminalSessionKind(kind: SessionStartPageStateKind) {
  return kind === "completed" || kind === "expired" || kind === "interrupted";
}

export function appendSuccessfulTurn(
  messages: readonly UiSessionMessage[],
  turn: {
    user: SessionMessageViewModel;
    assistant: SessionMessageViewModel;
  },
): UiSessionMessage[] {
  const byId = new Map(messages.map((message) => [message.id, message]));
  byId.set(turn.user.id, turn.user);
  byId.set(turn.assistant.id, turn.assistant);
  return [...byId.values()].sort((left, right) => left.sequenceIndex - right.sequenceIndex);
}
