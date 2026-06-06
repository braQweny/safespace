import type { createClient } from "@/lib/supabase";

export type SessionDataSupabaseClient = NonNullable<ReturnType<typeof createClient>>;

export type SessionId = string;
export type MessageId = string;
export type SummaryId = string;
export type TrialClaimId = string;
export type UserId = string;

export type SessionLifecycleStatus = "created" | "active" | "completed" | "expired" | "interrupted" | "deleted";

export type SessionMessageRole = "user" | "assistant" | "system_boundary";

export type SessionSummaryStatus = "draft" | "ready" | "stale" | "deleted";

export type SessionDeletionReasonCode = "user_request" | "retention_expired" | "safety_cleanup" | "system_cleanup";

export type SessionDurationBucketSeconds = 0 | 300 | 900 | 1800 | 3600;

export type SessionModalityId = "psychodynamic" | "cbt" | "humanistic_experiential" | "systemic" | "integrative";

export type SessionAvatarId =
  | "psychodynamic-listener"
  | "cbt-guide"
  | "experiential-companion"
  | "systemic-connector"
  | "integrative-guide";

export interface SessionDataContext {
  supabase: SessionDataSupabaseClient;
  user: {
    id: UserId;
  };
}

export interface SessionMetadata {
  id: SessionId;
  userId: UserId;
  modalityId: SessionModalityId | null;
  avatarId: SessionAvatarId | null;
  status: SessionLifecycleStatus;
  startedAt: string | null;
  endedAt: string | null;
  expiresAt: string | null;
  deletedAt: string | null;
  deletionReasonCode: SessionDeletionReasonCode | null;
  isTrial: boolean;
  trialClaimId: TrialClaimId | null;
  durationBucketSeconds: SessionDurationBucketSeconds | null;
  createdAt: string;
  updatedAt: string;
}

export type DeletedSessionTombstone = Omit<
  SessionMetadata,
  "modalityId" | "avatarId" | "status" | "deletedAt" | "deletionReasonCode"
> & {
  status: "deleted";
  deletedAt: string;
  deletionReasonCode: SessionDeletionReasonCode;
};

export interface SessionMessageRecord {
  id: MessageId;
  sessionId: SessionId;
  userId: UserId;
  role: SessionMessageRole;
  sequenceIndex: number;
  content: string;
  createdAt: string;
}

export interface SessionSummaryRecord {
  id: SummaryId;
  sessionId: SessionId;
  userId: UserId;
  summaryText: string;
  status: SessionSummaryStatus;
  isVisible: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionTrialClaimState {
  id: TrialClaimId;
  sessionId: SessionId;
  userId: UserId;
  trialDurationSeconds: 900;
  claimedAt: string;
  createdAt: string;
}

export interface TrialAvailability {
  isAvailable: boolean;
  existingClaim: SessionTrialClaimState | null;
}

export interface CreatePendingSessionInput {
  modalityId?: SessionModalityId | null;
  avatarId?: SessionAvatarId | null;
  isTrial?: boolean;
  startedAt?: string | null;
  expiresAt?: string | null;
  durationBucketSeconds?: SessionDurationBucketSeconds | null;
}

export interface TransitionSessionLifecycleInput {
  sessionId: SessionId;
  nextStatus: Exclude<SessionLifecycleStatus, "created">;
  startedAt?: string | null;
  endedAt?: string | null;
  expiresAt?: string | null;
  deletionReasonCode?: SessionDeletionReasonCode | null;
  durationBucketSeconds?: SessionDurationBucketSeconds | null;
}

export interface AppendSessionMessageInput {
  sessionId: SessionId;
  role: SessionMessageRole;
  sequenceIndex: number;
  content: string;
}

export interface SaveVisibleSessionSummaryInput {
  sessionId: SessionId;
  summaryText: string;
  status: Exclude<SessionSummaryStatus, "deleted">;
  revision: number;
  isVisible: boolean;
}

export interface ListSessionMetadataOptions {
  includeDeleted?: boolean;
  limit?: number;
}

export interface ListSessionSummariesOptions {
  visibleOnly?: boolean;
}
