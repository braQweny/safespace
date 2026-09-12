import { SESSION_MESSAGE_MAX_CHARS } from "./message-contract";

/**
 * Grupowanie fragmentów transkryptu GPT-Live w wypowiedzi. Wspólne dla
 * przeglądarki (podgląd na żywo) i obserwatora (zapis, klasyfikacja).
 *
 * Fakty ze spike'u: fragmenty przychodzą co ~200 ms na osi czasu sesji
 * (`start_ms`/`end_ms`), tną słowa w połowie („Ź” + „le s” + „ypiam”), niosą
 * własne spacje (łączenie bez dodawania spacji), a fragmenty obu mówców
 * przeplatają się przy nałożeniu głosów. Brak zdarzenia końca tury, więc
 * wypowiedź zamyka przerwa między fragmentami tego samego mówcy, cisza na
 * zegarze ściennym albo limit znaków. Każdy mówca ma własny otwarty strumień:
 * wtrącenie modelu („mhm”) nie przecina wypowiedzi użytkownika.
 */
export type VoiceSpeaker = "user" | "assistant";

export interface VoiceTranscriptFragment {
  speaker: VoiceSpeaker;
  text: string;
  startMs: number;
  endMs: number;
  /** Numer połączenia; po reconnect oś czasu startuje od zera. */
  epoch: number;
}

export interface VoiceUtterance {
  speaker: VoiceSpeaker;
  text: string;
  startMs: number;
  endMs: number;
  epoch: number;
}

interface OpenVoiceUtterance extends VoiceUtterance {
  lastFragmentAtMs: number;
}

export interface VoiceTranscriptState {
  open: Record<VoiceSpeaker, OpenVoiceUtterance | null>;
  seenKeys: readonly string[];
}

/** Przerwa na osi sesji między fragmentami tego samego mówcy, która zamyka wypowiedź. */
export const VOICE_UTTERANCE_GAP_MS = 700;

/** Cisza na zegarze ściennym po ostatnim fragmencie, po której `flushIdle` zamyka wypowiedź. */
export const VOICE_UTTERANCE_IDLE_MS = 1200;

/** Tyle samo, co wiadomość tekstowa i RPC zapisu. */
export const VOICE_UTTERANCE_MAX_CHARS = SESSION_MESSAGE_MAX_CHARS;

const SEEN_KEYS_LIMIT = 512;

export function createVoiceTranscriptState(): VoiceTranscriptState {
  return { open: { user: null, assistant: null }, seenKeys: [] };
}

function fragmentKey(fragment: VoiceTranscriptFragment) {
  return `${fragment.epoch}:${fragment.speaker}:${fragment.startMs}`;
}

function toUtterance(open: OpenVoiceUtterance): VoiceUtterance | null {
  const text = open.text.trim();

  return text.length === 0
    ? null
    : { speaker: open.speaker, text, startMs: open.startMs, endMs: open.endMs, epoch: open.epoch };
}

function withOpen(state: VoiceTranscriptState, speaker: VoiceSpeaker, open: OpenVoiceUtterance | null) {
  return { ...state, open: { ...state.open, [speaker]: open } };
}

export function pushVoiceFragment(
  state: VoiceTranscriptState,
  fragment: VoiceTranscriptFragment,
  nowMs: number,
): { state: VoiceTranscriptState; closed: VoiceUtterance[] } {
  const key = fragmentKey(fragment);

  if (state.seenKeys.includes(key)) {
    return { state, closed: [] };
  }

  const seenKeys = [...state.seenKeys.slice(-(SEEN_KEYS_LIMIT - 1)), key];
  const current = state.open[fragment.speaker];
  const closed: VoiceUtterance[] = [];
  let next: OpenVoiceUtterance;

  if (
    current !== null &&
    current.epoch === fragment.epoch &&
    fragment.startMs - current.endMs < VOICE_UTTERANCE_GAP_MS &&
    current.text.length + fragment.text.length <= VOICE_UTTERANCE_MAX_CHARS
  ) {
    next = {
      ...current,
      text: current.text + fragment.text,
      endMs: Math.max(current.endMs, fragment.endMs),
      lastFragmentAtMs: nowMs,
    };
  } else {
    if (current !== null) {
      const utterance = toUtterance(current);

      if (utterance) {
        closed.push(utterance);
      }
    }

    next = {
      speaker: fragment.speaker,
      text: fragment.text,
      startMs: fragment.startMs,
      endMs: fragment.endMs,
      epoch: fragment.epoch,
      lastFragmentAtMs: nowMs,
    };
  }

  return { state: { ...withOpen(state, fragment.speaker, next), seenKeys }, closed };
}

/** Zamyka wypowiedzi, po których na zegarze ściennym minęła cisza. */
export function flushIdleVoiceUtterances(
  state: VoiceTranscriptState,
  nowMs: number,
): { state: VoiceTranscriptState; closed: VoiceUtterance[] } {
  let next = state;
  const closed: VoiceUtterance[] = [];

  for (const speaker of ["user", "assistant"] as const) {
    const open = next.open[speaker];

    if (open !== null && nowMs - open.lastFragmentAtMs >= VOICE_UTTERANCE_IDLE_MS) {
      const utterance = toUtterance(open);

      if (utterance) {
        closed.push(utterance);
      }

      next = withOpen(next, speaker, null);
    }
  }

  return { state: next, closed };
}

/** Zamyka wszystko (koniec rozmowy, reconnect, rotacja). */
export function flushAllVoiceUtterances(state: VoiceTranscriptState): {
  state: VoiceTranscriptState;
  closed: VoiceUtterance[];
} {
  const closed: VoiceUtterance[] = [];

  for (const speaker of ["user", "assistant"] as const) {
    const open = state.open[speaker];
    const utterance = open === null ? null : toUtterance(open);

    if (utterance) {
      closed.push(utterance);
    }
  }

  // Wypowiedzi wychodzą w kolejności początku na osi sesji.
  closed.sort((a, b) => a.startMs - b.startMs);

  return { state: { ...state, open: { user: null, assistant: null } }, closed };
}

/** Najbliższy moment, w którym `flushIdle` ma coś do zamknięcia; `null` gdy nic nie jest otwarte. */
export function nextIdleFlushAt(state: VoiceTranscriptState): number | null {
  const candidates = (["user", "assistant"] as const)
    .map((speaker) => state.open[speaker])
    .filter((open): open is OpenVoiceUtterance => open !== null)
    .map((open) => open.lastFragmentAtMs + VOICE_UTTERANCE_IDLE_MS);

  return candidates.length === 0 ? null : Math.min(...candidates);
}
