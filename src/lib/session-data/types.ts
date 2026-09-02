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
export const APPROVED_SESSION_SUMMARY_CONTEXT_LIMIT = 3 as const;

/**
 * Account plan. `free` accounts may own at most `FREE_PLAN_SESSION_LIMIT`
 * sessions in total; `premium` accounts are not capped. There is no payment
 * integration yet — premium is granted by an admin or by owner-run SQL.
 */
export type AccountPlan = "free" | "premium";

export interface OwnedAccountPlan {
  plan: AccountPlan;
  premiumGrantedAt: string | null;
}

/**
 * What the owner may still start. `sessionLimit` and `remainingSessions` are
 * null for premium accounts (no cap). `usedSessions` counts every owned
 * session row, deleted tombstones included — deleting never frees a slot.
 */
export interface SessionQuota {
  plan: AccountPlan;
  sessionLimit: number | null;
  usedSessions: number;
  remainingSessions: number | null;
  canStartSession: boolean;
}

export type SessionModalityId = "psychodynamic" | "cbt" | "humanistic_experiential" | "systemic" | "integrative";

export type SessionAvatarId =
  "psychodynamic-listener" | "cbt-guide" | "experiential-companion" | "systemic-connector" | "integrative-guide";

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
  /**
   * Start-time decision: false when the owner explicitly began this session
   * without approved summary context. Read by the message flow instead of
   * resolving the context per user on every turn.
   */
  usesApprovedContext: boolean;
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

export interface SessionSummaryPreview {
  id: SummaryId;
  sessionId: SessionId;
  summaryText: string;
  status: Exclude<SessionSummaryStatus, "deleted">;
  isVisible: true;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovedSessionSummaryContext {
  id: SummaryId;
  sessionId: SessionId;
  summaryText: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type LatestSessionSummaryState =
  | {
      kind: "none";
    }
  | {
      kind: "preview" | "approved" | "stale";
      summary: SessionSummaryPreview;
    };

/**
 * Sam stan podsumowania, bez jego treści. Lista historii pokazuje wyłącznie
 * metadane, więc odczyt dla wielu rozmów naraz nie może nieść `summary_text` —
 * do listy jedzie tylko informacja, czy z tej rozmowy coś przechodzi dalej.
 */
export type SessionSummaryStateKind = LatestSessionSummaryState["kind"];

export interface SessionTrialClaimState {
  id: TrialClaimId;
  sessionId: SessionId;
  userId: UserId;
  /** Budget the trial actually got: the free 15 minutes or the premium hour. */
  trialDurationSeconds: 900 | 3600;
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
  usesApprovedContext?: boolean;
}

export interface ClaimFreeTrialSessionInput {
  modalityId?: SessionModalityId | null;
  avatarId?: SessionAvatarId | null;
  startedAt?: string | null;
  expiresAt?: string | null;
  /**
   * Time budget of the claimed session. Omitted means the 15-minute free-plan
   * trial; premium accounts claim their first session at 3600. The database
   * function rejects anything else, so the budget cannot drift per caller.
   */
  durationBucketSeconds?: Extract<SessionDurationBucketSeconds, 900 | 3600> | null;
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

export interface SaveGeneratedSessionSummaryInput {
  sessionId: SessionId;
  summaryText: string;
  status?: "draft" | "ready";
  isVisible?: boolean;
}

export interface ApproveSessionSummaryRevisionInput {
  sessionId: SessionId;
  revision: number;
}

export interface ListApprovedSessionSummaryContextOptions {
  limit?: number;
}

export interface ListSessionMetadataOptions {
  includeDeleted?: boolean;
  limit?: number;
}

export interface ListActiveSessionMetadataInput {
  /**
   * Zawężenie do jednej perspektywy. Bez niego lista obejmuje wszystkie
   * rozmowy w toku właściciela — tak działa pill „Rozmowa w toku” w nagłówku,
   * który ma pokazać trwającą rozmowę niezależnie od aktualnie zapisanego
   * awatara.
   */
  avatarId?: SessionAvatarId;
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
  /**
   * Czy z tej rozmowy coś przechodzi do kolejnej. Stan, nie treść — lista
   * historii nadal nie pokazuje ani słowa z rozmowy ani z podsumowania.
   */
  summaryState: SessionSummaryStateKind;
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
  summary: LatestSessionSummaryState;
}
