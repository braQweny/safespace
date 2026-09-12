import { appendVoiceSessionUtterances, transitionSessionLifecycle } from "@/lib/session-data/repository";
import type { SessionDataContext, SessionMessageRecord, SessionMetadata } from "@/lib/session-data/types";
import { VOICE_DRAIN_BATCH } from "@/lib/voice/constants";
import type { VoiceObserverStub } from "@/lib/voice/coordinator";
import type { VoiceObserverSnapshot } from "@/lib/voice/observer-core";
import type { VoiceCloseReason } from "@/lib/voice/observer-state";
import type { SessionMessageViewModel } from "./message-contract";

/**
 * Uzgadnianie sesji głosowej z jej obserwatorem (Durable Object):
 *
 * - `drainVoiceObserver` przenosi zbuforowane wypowiedzi do bazy pod RLS
 *   właściciela dwufazowo (`drain` → RPC → `ack`), więc awaria zapisu nie
 *   gubi niczego — wypowiedzi zostają w buforze do następnego zrzutu;
 * - `reconcileVoiceSession` robi to przy każdym odczycie aktywnej sesji
 *   głosowej (heartbeat, strona rozmowy, panel), a gdy obserwator zamknął
 *   sesję live z powodu terminalnym, przenosi wiersz w bazie w prawdziwy stan
 *   (`interrupted` po kryzysie, `expired` po terminie, `completed` po
 *   wyłączeniu funkcji), żeby użytkownik po powrocie zobaczył pełny zapis;
 * - `closeVoiceSession` rozłącza i zrzuca przy jawnym zakończeniu albo
 *   usunięciu rozmowy.
 *
 * Binding Durable Object jest ładowany leniwie, a domyślne zależności są
 * odczytywane dopiero przy wywołaniu: ten moduł importują trasy i stan startu,
 * których testy działają bez runtime Cloudflare i z częściowymi atrapami
 * repozytorium.
 */
export interface VoiceReconcileDependencies {
  getVoiceObserver: (sessionId: string) => Promise<VoiceObserverStub | null> | VoiceObserverStub | null;
  appendVoiceSessionUtterances: typeof appendVoiceSessionUtterances;
  transitionSessionLifecycle: typeof transitionSessionLifecycle;
}

async function loadVoiceObserver(sessionId: string) {
  const { getVoiceObserver } = await import("@/lib/voice/coordinator");
  return getVoiceObserver(sessionId);
}

function getDefaultDependencies(): VoiceReconcileDependencies {
  return {
    getVoiceObserver: loadVoiceObserver,
    appendVoiceSessionUtterances,
    transitionSessionLifecycle,
  };
}

/** Widok wiersza dla klienta (jak `toSessionMessageViewModel`, bez importu ścieżki zapisu tekstowego). */
function toVoiceMessageView(message: SessionMessageRecord): SessionMessageViewModel | null {
  if (message.role !== "user" && message.role !== "assistant") {
    return null;
  }

  return {
    id: message.id,
    role: message.role,
    sequenceIndex: message.sequenceIndex,
    content: message.content,
    createdAt: message.createdAt,
  };
}

/** Górny limit rund jednego zrzutu: 4 × 50 wypowiedzi to więcej niż godzina rozmowy. */
const MAX_DRAIN_ROUNDS = 4;

// Lokalna kopia `isSessionExpired` z `time-limit.ts`: tamten moduł importuje
// `session-state`, który importuje ten — bez pętli modułów.
function hasVoiceSessionExpired(session: Pick<SessionMetadata, "expiresAt">, now: Date) {
  const expiresAtMs = session.expiresAt ? Date.parse(session.expiresAt) : Number.NaN;
  return Number.isFinite(expiresAtMs) && expiresAtMs <= now.getTime();
}

export interface VoiceDrainOutcome {
  snapshot: VoiceObserverSnapshot;
  /** Wypowiedzi zapisane tym zrzutem, w kolejności zapisu; zawsze pełne wiersze z bazy. */
  messages: SessionMessageViewModel[];
  /** Zapis RPC padł — bufor zachowany, klient spróbuje przy następnym heartbeacie. */
  drainFailed: boolean;
}

export async function drainVoiceObserver(
  context: SessionDataContext,
  sessionId: string,
  stub: VoiceObserverStub,
  dependencies?: VoiceReconcileDependencies,
): Promise<VoiceDrainOutcome> {
  const deps = dependencies ?? getDefaultDependencies();
  const messages: SessionMessageViewModel[] = [];
  let snapshot: VoiceObserverSnapshot | null = null;

  for (let round = 0; round < MAX_DRAIN_ROUNDS; round += 1) {
    const { utterances, ...rest } = await stub.drain(VOICE_DRAIN_BATCH);
    snapshot = rest;

    if (utterances.length === 0) {
      break;
    }

    const appended = await deps.appendVoiceSessionUtterances(
      context,
      sessionId,
      utterances.map(({ utteranceId, role, content }) => ({ utteranceId, role, content })),
    );

    if (!appended.ok) {
      return { snapshot, messages, drainFailed: true };
    }

    await stub.ack(utterances.map((utterance) => utterance.ordinal));

    for (const message of appended.data.messages) {
      const view = toVoiceMessageView(message);

      if (view) {
        messages.push(view);
      }
    }

    if (utterances.length < VOICE_DRAIN_BATCH) {
      break;
    }
  }

  return { snapshot: snapshot ?? (await stub.getState()), messages, drainFailed: false };
}

/**
 * Stan wiersza w bazie po powodzie zamknięcia obserwatora. Powody, po których
 * użytkownik może wrócić do rozmowy (utrata pulsu, awaria klasyfikatora,
 * zamknięcie przez dostawcę, wznowienie), nie zmieniają statusu.
 */
export function resolveVoiceTerminalStatus(
  closeReason: VoiceCloseReason | null,
): Extract<SessionMetadata["status"], "interrupted" | "expired" | "completed"> | null {
  switch (closeReason) {
    case "interrupted":
      return "interrupted";
    case "time_limit_reached":
      return "expired";
    case "voice_disabled":
      return "completed";
    default:
      return null;
  }
}

/** Przejście wiersza w stan końcowy; nieudany zapis zostawia stan z bazy (następny odczyt spróbuje znów). */
export async function applyVoiceTerminalStatus(
  context: SessionDataContext,
  session: SessionMetadata,
  nextStatus: NonNullable<ReturnType<typeof resolveVoiceTerminalStatus>>,
  now: Date,
  dependencies?: VoiceReconcileDependencies,
): Promise<SessionMetadata> {
  const deps = dependencies ?? getDefaultDependencies();
  const transitioned = await deps.transitionSessionLifecycle(context, {
    sessionId: session.id,
    nextStatus,
    endedAt: now.toISOString(),
    durationBucketSeconds: session.durationBucketSeconds,
  });

  return transitioned.ok ? transitioned.data : session;
}

export interface VoiceReconcileResult {
  session: SessionMetadata;
  messages: SessionMessageViewModel[];
  snapshot: VoiceObserverSnapshot | null;
}

export interface ReconcileVoiceSessionOptions {
  now?: Date;
}

export async function reconcileVoiceSession(
  context: SessionDataContext,
  session: SessionMetadata,
  options: ReconcileVoiceSessionOptions = {},
  dependencies?: VoiceReconcileDependencies,
): Promise<VoiceReconcileResult> {
  const untouched: VoiceReconcileResult = { session, messages: [], snapshot: null };

  if (session.mode !== "voice") {
    return untouched;
  }

  const deps = dependencies ?? getDefaultDependencies();
  let stub: VoiceObserverStub | null;

  try {
    stub = await deps.getVoiceObserver(session.id);
  } catch {
    return untouched;
  }

  if (!stub) {
    return untouched;
  }

  const now = options.now ?? new Date();

  try {
    const expired = session.status === "active" && hasVoiceSessionExpired(session, now);

    if (expired) {
      // Termin minął po stronie bazy: sesja live nie może już trwać (idempotentne).
      await stub.hangupNow("time_limit_reached");
    }

    const drained = await drainVoiceObserver(context, session.id, stub, deps);
    const nextStatus = expired ? "expired" : resolveVoiceTerminalStatus(drained.snapshot.closeReason);
    const updated =
      session.status === "active" && nextStatus
        ? await applyVoiceTerminalStatus(context, session, nextStatus, now, deps)
        : session;

    return { session: updated, messages: drained.messages, snapshot: drained.snapshot };
  } catch {
    // Obserwator nieosiągalny: odczyt działa dalej na stanie z bazy.
    return untouched;
  }
}

/**
 * Jawne zakończenie albo usunięcie rozmowy głosowej: rozłącz sesję live z
 * naszym powodem, zrzuć resztę bufora (okno 60 s po `ended_at` w bazie), a po
 * usunięciu wyczyść bufor. Nigdy nie rzuca — trasa już zmieniła stan w bazie.
 */
export async function closeVoiceSession(
  context: SessionDataContext,
  session: Pick<SessionMetadata, "id" | "mode">,
  reason: VoiceCloseReason,
  dependencies?: VoiceReconcileDependencies,
): Promise<VoiceDrainOutcome | null> {
  if (session.mode !== "voice") {
    return null;
  }

  const deps = dependencies ?? getDefaultDependencies();

  try {
    const stub = await deps.getVoiceObserver(session.id);

    if (!stub) {
      return null;
    }

    await stub.hangupNow(reason);

    if (reason === "deleted") {
      await stub.purge();
      return null;
    }

    return await drainVoiceObserver(context, session.id, stub, deps);
  } catch {
    return null;
  }
}
