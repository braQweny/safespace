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

export const SESSION_HISTORY_PAGE_SIZE = 20 as const;

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

export interface DeletedSessionTombstone {
  id: SessionId;
  userId: UserId;
  status: "deleted";
  startedAt: string | null;
  endedAt: string | null;
  expiresAt: string | null;
  deletedAt: string;
  deletionReasonCode: SessionDeletionReasonCode;
  isTrial: boolean;
  trialClaimId: TrialClaimId | null;
  durationBucketSeconds: SessionDurationBucketSeconds | null;
  createdAt: string;
  updatedAt: string;
}

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

export interface ClaimFreeTrialSessionInput {
  modalityId?: SessionModalityId | null;
  avatarId?: SessionAvatarId | null;
  startedAt?: string | null;
  expiresAt?: string | null;
}

export interface ClaimFreeTrialSessionResult {
  session: SessionMetadata;
  trialClaim: SessionTrialClaimState;
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

export interface DeleteOwnedSessionInput {
  sessionId: SessionId;
  deletionReasonCode: SessionDeletionReasonCode;
  endedAt?: string | null;
  durationBucketSeconds?: SessionDurationBucketSeconds | null;
}

export type UpdateSessionTombstoneInput = DeleteOwnedSessionInput;

export interface AppendSessionMessageInput {
  sessionId: SessionId;
  role: SessionMessageRole;
  sequenceIndex: number;
  content: string;
}

export type AppendSessionMessagesInput = readonly AppendSessionMessageInput[];

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

export interface ListOwnedSessionHistoryInput {
  avatarId: SessionAvatarId;
  page: number;
  pageSize: typeof SESSION_HISTORY_PAGE_SIZE;
}

export interface SessionHistoryPagination {
  page: number;
  pageSize: typeof SESSION_HISTORY_PAGE_SIZE;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface OwnedSessionHistoryPage {
  sessions: SessionMetadata[];
  pagination: SessionHistoryPagination;
}

export interface OwnedSessionHistoryDetail {
  session: SessionMetadata;
  messages: SessionMessageRecord[];
}

export interface SessionHistoryListItem {
  id: SessionId;
  status: Exclude<SessionLifecycleStatus, "deleted">;
  startedAt: string | null;
  endedAt: string | null;
  expiresAt: string | null;
  durationBucketSeconds: SessionDurationBucketSeconds | null;
  isTrial: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionHistoryMessage {
  id: MessageId;
  role: SessionMessageRole;
  sequenceIndex: number;
  content: string;
  createdAt: string;
}

export interface SessionHistoryDetail {
  session: SessionHistoryListItem;
  messages: SessionHistoryMessage[];
}
