import { readSessionQuota, readTrialAvailability } from "@/lib/session-data/quota";
import {
  getOwnedSessionMetadata,
  listOwnedActiveSessionMetadata,
  listOwnedSessionMessages,
} from "@/lib/session-data/repository";
import type { SessionDataResult } from "@/lib/session-data/errors";
import type {
  SessionDataContext,
  SessionId,
  SessionMessageRecord,
  SessionMessageRole,
  SessionMetadata,
  SessionMode,
  SessionQuota,
  TrialAvailability,
} from "@/lib/session-data/types";
import type { CurrentAvatarChoice } from "./avatar-choice";
import {
  computeRemainingSeconds,
  getEffectiveSessionStatus,
  toSessionStartPageStateKind,
  type EffectiveSessionStatus,
  type SessionStartPageStateKind,
} from "./session-state-kind";
import { reconcileVoiceSession } from "./voice-reconcile";

export { FREE_TRIAL_DURATION_SECONDS } from "./session-budget";
// Czyste mapowania żyją w liściu bez importów serwerowych (islandy importują je
// stamtąd); tu zostają re-eksporty dla tras i stanu startu.
export {
  computeRemainingSeconds,
  getEffectiveSessionStatus,
  hasSessionExpired,
  toSessionStartPageStateKind,
  type EffectiveSessionStatus,
  type SessionStartPageStateKind,
} from "./session-state-kind";

const ACTIVE_SESSION_SCAN_LIMIT = 5;

export interface SessionView {
  id: SessionId;
  status: EffectiveSessionStatus;
  startedAt: string | null;
  endedAt: string | null;
  expiresAt: string | null;
  remainingSeconds: number | null;
  isTrial: boolean;
  durationBucketSeconds: number | null;
  /** Tryb rozmowy; obecny tylko dla rozmowy głosowej (brak = tekst). */
  mode?: SessionMode;
  /**
   * Tylko rozmowa głosowa: czy miała już połączenie audio. Przed pierwszym
   * zegar nie biegnie (baza przesuwa start i termin przy połączeniu), a próba
   * ani minuty puli nie są zużyte. Sam znacznik, bez czasu połączenia.
   */
  voiceConnected?: boolean;
}

export interface SessionMessageView {
  id: string;
  role: SessionMessageRole;
  sequenceIndex: number;
  content: string;
  createdAt: string;
}

/**
 * Wybór awatara w stanie strony: tylko pola katalogu (`selected`). Stan idzie w
 * propsach islandów, więc trafia do HTML — pełny wpis `modality` z personą AI
 * zostaje na serwerze (`readSessionStartPageState` go odcina).
 */
export type SessionStartAvatar = Pick<CurrentAvatarChoice, "selected">;

export interface SessionStartPageState {
  kind: SessionStartPageStateKind;
  trialAvailable: boolean;
  avatar: SessionStartAvatar;
  session: SessionView | null;
  messages: SessionMessageView[];
  messageFetchFailed: boolean;
  /**
   * The owner's session allowance, read only for start states (`ready`,
   * `followup_ready`, `session_limit_reached`); null while a session is shown
   * or when the state is unavailable. Free accounts see how many of their
   * sessions remain, premium accounts have no cap.
   */
  sessionQuota: SessionQuota | null;
}

export interface SessionStateRepository {
  readTrialAvailability: typeof readTrialAvailability;
  readSessionQuota: typeof readSessionQuota;
  getOwnedSessionMetadata: typeof getOwnedSessionMetadata;
  listOwnedActiveSessionMetadata: typeof listOwnedActiveSessionMetadata;
  listOwnedSessionMessages: typeof listOwnedSessionMessages;
  /**
   * Reconcile-on-read aktywnej rozmowy głosowej: zrzut bufora obserwatora do
   * bazy i prawdziwy status wiersza (kryzys, termin, wyłączenie), zanim strona
   * pokaże stan. Opcjonalne, bo testy stanu nie mają obserwatora.
   */
  reconcileVoiceSession?: (
    context: SessionDataContext,
    session: SessionMetadata,
    options: { now?: Date },
  ) => Promise<{ session: SessionMetadata }>;
}

export interface ReadSessionStartPageStateOptions {
  avatar: SessionStartAvatar;
  includeMessagesForActive?: boolean;
  resumeSessionId?: string | null;
  now?: Date;
}

const defaultSessionStateRepository: SessionStateRepository = {
  readTrialAvailability,
  readSessionQuota,
  getOwnedSessionMetadata,
  listOwnedActiveSessionMetadata,
  listOwnedSessionMessages,
  reconcileVoiceSession: (context, session, options) => reconcileVoiceSession(context, session, options),
};

/** Tylko aktywna rozmowa głosowa ma z czym się uzgadniać; reszta wraca bez rundy do obserwatora. */
async function reconcileIfVoice(
  context: SessionDataContext,
  session: SessionMetadata,
  options: ReadSessionStartPageStateOptions,
  repository: SessionStateRepository,
): Promise<SessionMetadata> {
  if (session.mode !== "voice" || session.status !== "active" || !repository.reconcileVoiceSession) {
    return session;
  }

  const reconciled = await repository.reconcileVoiceSession(context, session, { now: options.now });
  return reconciled.session;
}

function normalizeResumeSessionId(value: string | null | undefined) {
  const sessionId = typeof value === "string" ? value.trim() : "";
  return sessionId || null;
}

export function toSessionView(session: SessionMetadata, now: Date = new Date()): SessionView {
  return {
    id: session.id,
    status: getEffectiveSessionStatus(session, now),
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    expiresAt: session.expiresAt,
    remainingSeconds: computeRemainingSeconds(session.expiresAt, now),
    isTrial: session.isTrial,
    durationBucketSeconds: session.durationBucketSeconds,
    ...(session.mode === "voice"
      ? { mode: "voice" as const, voiceConnected: typeof session.voiceConnectedAt === "string" }
      : {}),
  };
}

function toMessageView(message: SessionMessageRecord): SessionMessageView {
  return {
    id: message.id,
    role: message.role,
    sequenceIndex: message.sequenceIndex,
    content: message.content,
    createdAt: message.createdAt,
  };
}

function getStateKindFromSession(session: SessionView): SessionStartPageStateKind {
  return toSessionStartPageStateKind(session.status);
}

function getSameAvatarSessionView(
  session: SessionMetadata,
  options: ReadSessionStartPageStateOptions,
): SessionView | null {
  if (session.avatarId !== options.avatar.selected.avatarId) {
    return null;
  }

  return toSessionView(session, options.now);
}

function unavailableState(avatar: SessionStartAvatar): SessionStartPageState {
  return {
    kind: "unavailable",
    trialAvailable: false,
    avatar,
    session: null,
    messages: [],
    messageFetchFailed: false,
    sessionQuota: null,
  };
}

function readyState(avatar: SessionStartAvatar, sessionQuota: SessionQuota): SessionStartPageState {
  return {
    kind: "ready",
    trialAvailable: true,
    avatar,
    session: null,
    messages: [],
    messageFetchFailed: false,
    sessionQuota,
  };
}

function claimedState(avatar: SessionStartAvatar, sessionQuota: SessionQuota): SessionStartPageState {
  return {
    kind: "followup_ready",
    trialAvailable: false,
    avatar,
    session: null,
    messages: [],
    messageFetchFailed: false,
    sessionQuota,
  };
}

// The allowance is exhausted: no start is offered at all.
function sessionLimitReachedState(avatar: SessionStartAvatar, sessionQuota: SessionQuota): SessionStartPageState {
  return {
    kind: "session_limit_reached",
    trialAvailable: false,
    avatar,
    session: null,
    messages: [],
    messageFetchFailed: false,
    sessionQuota,
  };
}

async function loadSessionMessages(
  context: SessionDataContext,
  sessionId: SessionId,
  repository: SessionStateRepository,
) {
  const messages = await repository.listOwnedSessionMessages(context, sessionId);

  if (!messages.ok) {
    return {
      messages: [],
      messageFetchFailed: true,
    };
  }

  return {
    messages: messages.data.map(toMessageView),
    messageFetchFailed: false,
  };
}

async function pageStateFromSessionView(
  context: SessionDataContext,
  session: SessionView,
  options: ReadSessionStartPageStateOptions,
  repository: SessionStateRepository,
): Promise<SessionStartPageState> {
  const stateKind = getStateKindFromSession(session);
  const shouldLoadMessages = options.includeMessagesForActive === true;
  const messageState = shouldLoadMessages
    ? await loadSessionMessages(context, session.id, repository)
    : { messages: [], messageFetchFailed: false };

  return {
    kind: stateKind,
    trialAvailable: false,
    avatar: options.avatar,
    session,
    sessionQuota: null,
    ...messageState,
  };
}

async function readExplicitActiveSessionState(
  context: SessionDataContext,
  options: ReadSessionStartPageStateOptions,
  repository: SessionStateRepository,
): Promise<SessionDataResult<SessionStartPageState | null>> {
  const sessionId = normalizeResumeSessionId(options.resumeSessionId);

  if (!sessionId) {
    return {
      ok: true,
      data: null,
    };
  }

  const sessionResult = await repository.getOwnedSessionMetadata(context, sessionId);

  if (!sessionResult.ok) {
    if (sessionResult.error.code === "session_not_found") {
      return {
        ok: true,
        data: null,
      };
    }

    return sessionResult;
  }

  const session = getSameAvatarSessionView(
    await reconcileIfVoice(context, sessionResult.data, options, repository),
    options,
  );

  if (!session || getStateKindFromSession(session) === "trial_already_claimed") {
    return {
      ok: true,
      data: null,
    };
  }

  return {
    ok: true,
    data: await pageStateFromSessionView(context, session, options, repository),
  };
}

async function readLatestActiveSessionState(
  context: SessionDataContext,
  options: ReadSessionStartPageStateOptions,
  repository: SessionStateRepository,
): Promise<SessionDataResult<SessionStartPageState | null>> {
  const activeSessions = await repository.listOwnedActiveSessionMetadata(context, {
    avatarId: options.avatar.selected.avatarId,
    limit: ACTIVE_SESSION_SCAN_LIMIT,
  });

  if (!activeSessions.ok) {
    return activeSessions;
  }

  const candidate =
    activeSessions.data.find((item) => getSameAvatarSessionView(item, options)?.status === "active") ?? null;

  if (!candidate) {
    return {
      ok: true,
      data: null,
    };
  }

  // Po uzgodnieniu rozmowa głosowa może już nie być aktywna (kryzys, termin);
  // wtedy pokazujemy jej prawdziwy stan końcowy zamiast karty startu.
  const session = getSameAvatarSessionView(await reconcileIfVoice(context, candidate, options, repository), options);

  if (!session) {
    return {
      ok: true,
      data: null,
    };
  }

  return {
    ok: true,
    data: await pageStateFromSessionView(context, session, options, repository),
  };
}

export async function readSessionStartPageState(
  context: SessionDataContext,
  input: ReadSessionStartPageStateOptions,
  repository: SessionStateRepository = defaultSessionStateRepository,
): Promise<SessionDataResult<SessionStartPageState>> {
  // Strony podają pełny `CurrentAvatarChoice`; typ go nie odetnie, więc
  // przepisujemy samo `selected`, zanim wybór trafi do któregokolwiek stanu.
  const options: ReadSessionStartPageStateOptions = { ...input, avatar: { selected: input.avatar.selected } };
  const explicitActiveState = await readExplicitActiveSessionState(context, options, repository);

  if (!explicitActiveState.ok) {
    return {
      ok: true,
      data: unavailableState(options.avatar),
    };
  }

  if (explicitActiveState.data) {
    return {
      ok: true,
      data: explicitActiveState.data,
    };
  }

  const latestActiveState = await readLatestActiveSessionState(context, options, repository);

  if (!latestActiveState.ok) {
    return {
      ok: true,
      data: unavailableState(options.avatar),
    };
  }

  if (latestActiveState.data) {
    return {
      ok: true,
      data: latestActiveState.data,
    };
  }

  // The allowance is checked before any start state is offered; the database
  // trigger remains the real gate, this only keeps the start button honest.
  const quota = await repository.readSessionQuota(context);

  if (!quota.ok) {
    return {
      ok: true,
      data: unavailableState(options.avatar),
    };
  }

  if (!quota.data.canStartSession) {
    return {
      ok: true,
      data: sessionLimitReachedState(options.avatar, quota.data),
    };
  }

  const availability = await repository.readTrialAvailability(context);

  if (!availability.ok) {
    return {
      ok: true,
      data: unavailableState(options.avatar),
    };
  }

  return okSessionStartPageState(context, availability.data, quota.data, options, repository);
}

async function okSessionStartPageState(
  context: SessionDataContext,
  availability: TrialAvailability,
  sessionQuota: SessionQuota,
  options: ReadSessionStartPageStateOptions,
  repository: SessionStateRepository,
): Promise<SessionDataResult<SessionStartPageState>> {
  if (availability.isAvailable || !availability.existingClaim) {
    return {
      ok: true,
      data: readyState(options.avatar, sessionQuota),
    };
  }

  const sessionResult = await repository.getOwnedSessionMetadata(context, availability.existingClaim.sessionId);

  if (!sessionResult.ok) {
    return {
      ok: true,
      data: claimedState(options.avatar, sessionQuota),
    };
  }

  const session = toSessionView(await reconcileIfVoice(context, sessionResult.data, options, repository), options.now);
  const stateKind = getStateKindFromSession(session);

  if (stateKind !== "active") {
    return {
      ok: true,
      data: claimedState(options.avatar, sessionQuota),
    };
  }

  const shouldLoadMessages = options.includeMessagesForActive === true;
  const messageState = shouldLoadMessages
    ? await loadSessionMessages(context, session.id, repository)
    : { messages: [], messageFetchFailed: false };

  return {
    ok: true,
    data: {
      kind: stateKind,
      trialAvailable: false,
      avatar: options.avatar,
      session,
      sessionQuota,
      ...messageState,
    },
  };
}
