import { readTrialAvailability } from "@/lib/session-data/quota";
import {
  getOwnedSessionMetadata,
  listOwnedActiveSessionMetadata,
  listNewestApprovedSessionSummaryContexts,
  listOwnedSessionMessages,
} from "@/lib/session-data/repository";
import type { SessionDataResult } from "@/lib/session-data/errors";
import type {
  ApprovedSessionSummaryContext,
  SessionDataContext,
  SessionId,
  SessionLifecycleStatus,
  SessionMessageRecord,
  SessionMessageRole,
  SessionMetadata,
  TrialAvailability,
} from "@/lib/session-data/types";
import type { CurrentAvatarChoice } from "./avatar-choice";

export const FREE_TRIAL_DURATION_SECONDS = 900;
const ACTIVE_SESSION_SCAN_LIMIT = 5;

export type EffectiveSessionStatus = Exclude<SessionLifecycleStatus, "created" | "deleted"> | "claimed";

export type SessionStartPageStateKind =
  | "ready"
  | "active"
  | "expired"
  | "completed"
  | "interrupted"
  | "followup_ready"
  | "trial_already_claimed"
  | "unavailable";

export interface SessionView {
  id: SessionId;
  status: EffectiveSessionStatus;
  startedAt: string | null;
  endedAt: string | null;
  expiresAt: string | null;
  remainingSeconds: number | null;
  isTrial: boolean;
  durationBucketSeconds: number | null;
}

export interface SessionMessageView {
  id: string;
  role: SessionMessageRole;
  sequenceIndex: number;
  content: string;
  createdAt: string;
}

export interface SessionStartPageState {
  kind: SessionStartPageStateKind;
  trialAvailable: boolean;
  avatar: CurrentAvatarChoice;
  session: SessionView | null;
  messages: SessionMessageView[];
  messageFetchFailed: boolean;
  approvedSummaries: ApprovedSessionSummaryContext[];
  canStartWithoutContext: boolean;
}

export interface SessionStateRepository {
  readTrialAvailability: typeof readTrialAvailability;
  getOwnedSessionMetadata: typeof getOwnedSessionMetadata;
  listOwnedActiveSessionMetadata: typeof listOwnedActiveSessionMetadata;
  listOwnedSessionMessages: typeof listOwnedSessionMessages;
  listNewestApprovedSessionSummaryContexts: typeof listNewestApprovedSessionSummaryContexts;
}

export interface ReadSessionStartPageStateOptions {
  avatar: CurrentAvatarChoice;
  includeMessagesForActive?: boolean;
  resumeSessionId?: string | null;
  now?: Date;
}

const defaultSessionStateRepository: SessionStateRepository = {
  readTrialAvailability,
  getOwnedSessionMetadata,
  listOwnedActiveSessionMetadata,
  listOwnedSessionMessages,
  listNewestApprovedSessionSummaryContexts,
};

function parseTimestampMs(timestamp: string | null) {
  if (!timestamp) {
    return null;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeResumeSessionId(value: string | null | undefined) {
  const sessionId = typeof value === "string" ? value.trim() : "";
  return sessionId || null;
}

export function computeRemainingSeconds(expiresAt: string | null, now: Date = new Date()) {
  const expiresAtMs = parseTimestampMs(expiresAt);

  if (expiresAtMs === null) {
    return null;
  }

  return Math.max(0, Math.ceil((expiresAtMs - now.getTime()) / 1000));
}

export function hasSessionExpired(session: Pick<SessionMetadata, "expiresAt">, now: Date = new Date()) {
  const remainingSeconds = computeRemainingSeconds(session.expiresAt, now);
  return remainingSeconds !== null && remainingSeconds <= 0;
}

export function getEffectiveSessionStatus(
  session: Pick<SessionMetadata, "status" | "expiresAt">,
  now: Date = new Date(),
): EffectiveSessionStatus {
  if (session.status === "active" && hasSessionExpired(session, now)) {
    return "expired";
  }

  if (session.status === "created") {
    return "claimed";
  }

  if (session.status === "deleted") {
    // A deleted session never reaches active flows; map it to "claimed" so the
    // page state resolves to trial_already_claimed without leaking "deleted".
    return "claimed";
  }

  return session.status;
}

export function toSessionStartPageStateKind(status: EffectiveSessionStatus): SessionStartPageStateKind {
  if (status === "active" || status === "expired" || status === "completed" || status === "interrupted") {
    return status;
  }

  return "trial_already_claimed";
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

function unavailableState(avatar: CurrentAvatarChoice): SessionStartPageState {
  return {
    kind: "unavailable",
    trialAvailable: false,
    avatar,
    session: null,
    messages: [],
    messageFetchFailed: false,
    approvedSummaries: [],
    canStartWithoutContext: false,
  };
}

function readyState(avatar: CurrentAvatarChoice): SessionStartPageState {
  return {
    kind: "ready",
    trialAvailable: true,
    avatar,
    session: null,
    messages: [],
    messageFetchFailed: false,
    approvedSummaries: [],
    canStartWithoutContext: false,
  };
}

function claimedState(
  avatar: CurrentAvatarChoice,
  approvedSummaries: ApprovedSessionSummaryContext[] = [],
): SessionStartPageState {
  return {
    kind: "followup_ready",
    trialAvailable: false,
    avatar,
    session: null,
    messages: [],
    messageFetchFailed: false,
    approvedSummaries,
    canStartWithoutContext: approvedSummaries.length === 0,
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

async function loadApprovedSummaryContext(context: SessionDataContext, repository: SessionStateRepository) {
  const summaries = await repository.listNewestApprovedSessionSummaryContexts(context);

  return summaries.ok ? summaries.data : [];
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
    approvedSummaries: [],
    canStartWithoutContext: false,
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

  const session = getSameAvatarSessionView(sessionResult.data, options);

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

  const session = activeSessions.data
    .map((candidate) => {
      const sessionView = getSameAvatarSessionView(candidate, options);

      return sessionView?.status === "active" ? sessionView : null;
    })
    .find((candidate) => candidate !== null);

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
  options: ReadSessionStartPageStateOptions,
  repository: SessionStateRepository = defaultSessionStateRepository,
): Promise<SessionDataResult<SessionStartPageState>> {
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

  const availability = await repository.readTrialAvailability(context);

  if (!availability.ok) {
    return {
      ok: true,
      data: unavailableState(options.avatar),
    };
  }

  return okSessionStartPageState(context, availability.data, options, repository);
}

async function okSessionStartPageState(
  context: SessionDataContext,
  availability: TrialAvailability,
  options: ReadSessionStartPageStateOptions,
  repository: SessionStateRepository,
): Promise<SessionDataResult<SessionStartPageState>> {
  if (availability.isAvailable || !availability.existingClaim) {
    return {
      ok: true,
      data: readyState(options.avatar),
    };
  }

  const sessionResult = await repository.getOwnedSessionMetadata(context, availability.existingClaim.sessionId);

  if (!sessionResult.ok) {
    const approvedSummaries = await loadApprovedSummaryContext(context, repository);

    return {
      ok: true,
      data: claimedState(options.avatar, approvedSummaries),
    };
  }

  const session = toSessionView(sessionResult.data, options.now);
  const stateKind = getStateKindFromSession(session);

  if (stateKind !== "active") {
    const approvedSummaries = await loadApprovedSummaryContext(context, repository);

    return {
      ok: true,
      data: claimedState(options.avatar, approvedSummaries),
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
      approvedSummaries: [],
      canStartWithoutContext: false,
      ...messageState,
    },
  };
}
