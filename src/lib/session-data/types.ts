import type { createClient } from "@/lib/supabase";
import type { PeopleFactKind } from "@/lib/session-summary/people-memory-budget";
import type {
  DifficultyEffect,
  DifficultyEntryKind,
  DifficultyPersonState,
} from "@/lib/session-summary/topic-map-budget";
import type { SessionLensId } from "@/lib/session-ai/session-lenses";

export type SessionDataSupabaseClient = NonNullable<ReturnType<typeof createClient>>;

export type SessionId = string;
export type MessageId = string;
export type SummaryId = string;
export type TrialClaimId = string;
export type UserId = string;

export type SessionLifecycleStatus = "created" | "active" | "completed" | "expired" | "interrupted" | "deleted";

/**
 * Tryb rozmowy: `text` (composer, `/api/session/message`) albo `voice`
 * (GPT-Live przez WebRTC, transkrypt zrzucany RPC). Ustalany przy insercie i
 * zamrożony; tryby są rozłączne — patrz README „Rozmowa głosowa”.
 */
export type SessionMode = "text" | "voice";

export type SessionMessageRole = "user" | "assistant" | "system_boundary";

export type SessionSummaryStatus = "draft" | "ready" | "stale" | "deleted";

export type SessionDeletionReasonCode = "user_request" | "retention_expired" | "safety_cleanup" | "system_cleanup";

/** 600 to jednorazowa próba głosowa konta free; reszta jak dotąd. */
export type SessionDurationBucketSeconds = 0 | 300 | 600 | 900 | 1800 | 3600;

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

/**
 * Co właściciel może zacząć głosem. Konto free ma jedną próbę (bucket 600 s;
 * każdy własny wiersz `mode = 'voice'` ją zużywa, także tombstone). Konto
 * premium ma miesięczną pulę sekund liczoną od `voice_connected_at` każdej
 * rozmowy głosowej w bieżącym miesiącu UTC.
 */
export type VoiceQuota =
  | { kind: "trial"; plan: "free"; available: boolean; durationSeconds: 600 }
  | {
      kind: "pool";
      plan: "premium";
      limitSeconds: number;
      usedSeconds: number;
      remainingSeconds: number;
      canStartVoice: boolean;
      monthStartIso: string;
    };

/** Czas jednej rozmowy głosowej potrzebny do policzenia puli — bez treści. */
export interface VoiceSessionTiming {
  voiceConnectedAt: string;
  endedAt: string | null;
  expiresAt: string | null;
  durationBucketSeconds: SessionDurationBucketSeconds | null;
  status: SessionLifecycleStatus;
}

/** Wypowiedź transkryptu do zapisu; `utteranceId` nadaje serwer, nigdy przeglądarka. */
export interface VoiceUtteranceInput {
  utteranceId: string;
  role: Extract<SessionMessageRole, "user" | "assistant">;
  content: string;
}

export interface AppendVoiceUtterancesResult {
  inserted: number;
  skipped: number;
  messages: SessionMessageRecord[];
}

export type SessionModalityId = "psychodynamic" | "cbt" | "humanistic_experiential" | "systemic" | "integrative";

export type SessionAvatarId =
  "psychodynamic-listener" | "cbt-guide" | "experiential-companion" | "systemic-connector" | "integrative-guide";

const SESSION_AVATAR_IDS: readonly SessionAvatarId[] = [
  "psychodynamic-listener",
  "cbt-guide",
  "experiential-companion",
  "systemic-connector",
  "integrative-guide",
];

export function isSessionAvatarId(value: unknown): value is SessionAvatarId {
  return typeof value === "string" && (SESSION_AVATAR_IDS as readonly string[]).includes(value);
}

/**
 * Liczba niesuniętych rozmów właściciela na perspektywę — dana zbiorcza bez
 * treści, którą filtr historii pokazuje jako „Lena · 3”.
 */
export type OwnedSessionCountsByAvatar = Partial<Record<SessionAvatarId, number>>;

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
  /** Nowe sesje otrzymują przypiętą kopię automatycznej pamięci awatara. */
  usesAvatarMemory?: boolean;
  /** Karta osoby wybrana na start („Porozmawiaj o tej osobie”); tylko id, nigdy imię. */
  aboutPersonId?: string | null;
  /** Trudność wybrana na start („Porozmawiaj o tym”); tylko id, nigdy etykieta. */
  aboutDifficultyId?: string | null;
  /**
   * Soczewka tematyczna lepka na sesję: nadana raz przez tani klasyfikator,
   * czytana przez trasę wiadomości. Mówi, o czym jest rozmowa — nigdy do
   * widoku klienta, logów ani agregatów operatora.
   */
  sessionLens?: SessionLensId | null;
  /** Tryb rozmowy; brak w starszym odczycie oznacza `text`. */
  mode?: SessionMode;
  /** Pierwsze udane połączenie audio rozmowy głosowej; od niego liczy się pula minut. */
  voiceConnectedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Karta osoby z rozmów — prywatna treść właściciela (jak wiadomości). Każdy
 * wpis niesie rozmowy źródłowe, żeby interfejs pokazał pochodzenie, a
 * usunięcie rozmowy usunęło dokładnie to, co z niej pochodziło.
 */
export interface PersonFactSource {
  sessionId: SessionId;
  conversationAt: string;
}

export interface PersonFact {
  id: string;
  kind: PeopleFactKind;
  text: string;
  /** Poprawione przez użytkownika: model tego nie zastąpi ani nie usunie. */
  userEdited: boolean;
  createdAt: string;
  sources: PersonFactSource[];
}

export interface PersonCard {
  id: string;
  avatarId: SessionAvatarId;
  name: string;
  nameLocked: boolean;
  relation: string | null;
  relationLocked: boolean;
  userNote: string;
  createdAt: string;
  firstMentionedAt: string | null;
  lastMentionedAt: string | null;
  mentionCount: number;
  facts: PersonFact[];
}

/**
 * Mapa tematów: trudność użytkownika z powiązanymi osobami (krawędzie grafu)
 * i wpisami, każdy ze zbiorem rozmów źródłowych. Trudność należy do
 * użytkownika, nie do osoby; wpis z `personId` to jej kontekst w tej relacji.
 */
export interface DifficultyEntrySource {
  sessionId: SessionId;
  conversationAt: string;
}

export interface DifficultyEntry {
  id: string;
  kind: DifficultyEntryKind;
  text: string;
  /** Ocena użytkownika, tylko na „jak jest teraz” i „jak poszło”. */
  effect: DifficultyEffect | null;
  personId: string | null;
  /** Propozycja lub postanowienie, na które ten wpis odpowiada. */
  parentEntryId: string | null;
  userEdited: boolean;
  createdAt: string;
  sources: DifficultyEntrySource[];
}

export interface DifficultyAlias {
  id: string;
  alias: string;
}

export interface DifficultyPersonLink {
  personId: string;
  name: string;
  relation: string | null;
  state: DifficultyPersonState;
  /** Potwierdzone lub odrzucone przez użytkownika: model tego nie zmienia. */
  userDecided: boolean;
}

/** „Stan na dziś”: najnowszy wpis „jak jest teraz” po dacie rozmowy źródłowej. */
export interface DifficultyCurrentState {
  id: string;
  text: string;
  effect: DifficultyEffect | null;
  conversationAt: string | null;
}

export interface DifficultyCard {
  id: string;
  avatarId: SessionAvatarId;
  label: string;
  labelLocked: boolean;
  userNote: string;
  /** „Mniej aktualne”: ustawia tylko użytkownik. */
  archivedAt: string | null;
  createdAt: string;
  aliases: DifficultyAlias[];
  persons: DifficultyPersonLink[];
  firstMentionedAt: string | null;
  lastMentionedAt: string | null;
  mentionCount: number;
  currentState: DifficultyCurrentState | null;
  hasNewEntriesSinceArchived: boolean;
  entries: DifficultyEntry[];
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
  /** Tryb usuniętej rozmowy (trasa usuwania rozłącza obserwatora głosowego); brak = tekst. */
  mode?: SessionMode;
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
  usesAvatarMemory?: boolean;
  /** Zwalidowana wcześniej karta właściciela z tej samej perspektywy. */
  aboutPersonId?: string | null;
  /** Zwalidowana wcześniej trudność właściciela z tej samej perspektywy. */
  aboutDifficultyId?: string | null;
  /** Tryb rozmowy; domyślnie `text`. Głos zawsze przez `start-next`, nigdy przez claim próby tekstowej. */
  mode?: SessionMode;
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
  avatarId?: SessionAvatarId;
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
  /** Tryb rozmowy (odznaka „Głos”); brak oznacza `text`. */
  mode?: SessionMode;
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
