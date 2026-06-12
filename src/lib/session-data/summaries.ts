/**
 * Owner-bound repository helpers for `session_summaries` (private content)
 * plus the pure summary-state helpers built on top of them.
 * Import from `./repository` outside this directory.
 */
import { mapSupabaseReadError, mapSupabaseWriteError, ok, sessionDataError, type SessionDataResult } from "./errors";
import { SUMMARY_SELECT, SUMMARY_WITH_SESSION_SELECT, coerceSummaryRow, coerceSummaryRows, mapSummary } from "./rows";
import { ensureOwnedNonDeletedSession, getOwnedSessionMetadata } from "./sessions";
import type {
  ApprovedSessionSummaryContext,
  ApproveSessionSummaryRevisionInput,
  LatestSessionSummaryState,
  ListApprovedSessionSummaryContextOptions,
  ListSessionSummariesOptions,
  SaveGeneratedSessionSummaryInput,
  SaveVisibleSessionSummaryInput,
  SessionDataContext,
  SessionId,
  SessionSummaryPreview,
  SessionSummaryRecord,
} from "./types";
import { APPROVED_SESSION_SUMMARY_CONTEXT_LIMIT as DEFAULT_APPROVED_SUMMARY_CONTEXT_LIMIT } from "./types";

function parseSummaryTimestampMs(timestamp: string | null | undefined) {
  if (!timestamp) {
    return 0;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareSummaryRecordsNewestFirst(left: SessionSummaryRecord, right: SessionSummaryRecord) {
  const updatedDiff = parseSummaryTimestampMs(right.updatedAt) - parseSummaryTimestampMs(left.updatedAt);

  if (updatedDiff !== 0) {
    return updatedDiff;
  }

  const createdDiff = parseSummaryTimestampMs(right.createdAt) - parseSummaryTimestampMs(left.createdAt);

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return right.revision - left.revision;
}

function normalizeApprovedSummaryContextLimit(limit: number | undefined) {
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit <= 0) {
    return DEFAULT_APPROVED_SUMMARY_CONTEXT_LIMIT;
  }

  return Math.min(limit, DEFAULT_APPROVED_SUMMARY_CONTEXT_LIMIT);
}

export function getNextSessionSummaryRevision(summaries: readonly SessionSummaryRecord[]) {
  return summaries.reduce((maxRevision, summary) => Math.max(maxRevision, summary.revision), 0) + 1;
}

export function toSessionSummaryPreview(summary: SessionSummaryRecord): SessionSummaryPreview | null {
  if (summary.status === "deleted" || !summary.isVisible) {
    return null;
  }

  return {
    id: summary.id,
    sessionId: summary.sessionId,
    summaryText: summary.summaryText,
    status: summary.status,
    isVisible: true,
    revision: summary.revision,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
  };
}

export function toLatestSessionSummaryState(summaries: readonly SessionSummaryRecord[]): LatestSessionSummaryState {
  const latest = [...summaries]
    .map(toSessionSummaryPreview)
    .filter((summary) => summary !== null)
    .sort((left, right) => right.revision - left.revision)
    .at(0);

  if (!latest) {
    return {
      kind: "none",
    };
  }

  if (latest.status === "draft") {
    return {
      kind: "preview",
      summary: latest,
    };
  }

  if (latest.status === "ready") {
    return {
      kind: "approved",
      summary: latest,
    };
  }

  return {
    kind: "stale",
    summary: latest,
  };
}

export function toApprovedSessionSummaryContexts(
  summaries: readonly SessionSummaryRecord[],
  limit: number = DEFAULT_APPROVED_SUMMARY_CONTEXT_LIMIT,
): ApprovedSessionSummaryContext[] {
  const normalizedLimit = normalizeApprovedSummaryContextLimit(limit);
  const seenSessionIds = new Set<SessionId>();

  return [...summaries]
    .filter((summary) => summary.status === "ready" && summary.isVisible)
    .sort(compareSummaryRecordsNewestFirst)
    .filter((summary) => {
      if (seenSessionIds.has(summary.sessionId)) {
        return false;
      }

      seenSessionIds.add(summary.sessionId);
      return true;
    })
    .slice(0, normalizedLimit)
    .map((summary) => ({
      id: summary.id,
      sessionId: summary.sessionId,
      summaryText: summary.summaryText,
      revision: summary.revision,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
    }));
}

export async function saveVisibleSessionSummary(
  context: SessionDataContext,
  input: SaveVisibleSessionSummaryInput,
): Promise<SessionDataResult<SessionSummaryRecord>> {
  const { data, error } = await context.supabase
    .from("session_summaries")
    .upsert(
      {
        session_id: input.sessionId,
        user_id: context.user.id,
        summary_text: input.summaryText,
        status: input.status,
        is_visible: input.isVisible,
        revision: input.revision,
      },
      {
        onConflict: "session_id,revision",
      },
    )
    .select(SUMMARY_SELECT)
    .single();

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error));
  }

  const row = coerceSummaryRow(data);
  return row ? ok(mapSummary(row)) : sessionDataError("write_failed");
}

export async function listOwnedSessionSummaries(
  context: SessionDataContext,
  sessionId: SessionId,
  options: ListSessionSummariesOptions = {},
): Promise<SessionDataResult<SessionSummaryRecord[]>> {
  const session = await getOwnedSessionMetadata(context, sessionId);

  if (!session.ok) {
    return session;
  }

  let query = context.supabase
    .from("session_summaries")
    .select(SUMMARY_SELECT)
    .eq("session_id", sessionId)
    .eq("user_id", context.user.id)
    .order("revision", { ascending: false });

  if (options.visibleOnly) {
    query = query.eq("is_visible", true).neq("status", "deleted");
  }

  const { data, error } = await query;

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  return ok(coerceSummaryRows(data).map(mapSummary));
}

export async function getLatestOwnedSessionSummaryState(
  context: SessionDataContext,
  sessionId: SessionId,
): Promise<SessionDataResult<LatestSessionSummaryState>> {
  const session = await ensureOwnedNonDeletedSession(context, sessionId);

  if (!session.ok) {
    return session;
  }

  const summaries = await listOwnedSessionSummaries(context, sessionId);

  if (!summaries.ok) {
    return summaries;
  }

  return ok(toLatestSessionSummaryState(summaries.data));
}

export async function saveGeneratedVisibleSessionSummary(
  context: SessionDataContext,
  input: SaveGeneratedSessionSummaryInput,
): Promise<SessionDataResult<SessionSummaryRecord>> {
  const session = await ensureOwnedNonDeletedSession(context, input.sessionId);

  if (!session.ok) {
    return session;
  }

  const existingSummaries = await listOwnedSessionSummaries(context, input.sessionId);

  if (!existingSummaries.ok) {
    return existingSummaries;
  }

  const summaryText = input.summaryText.trim();

  if (!summaryText) {
    return sessionDataError("write_failed");
  }

  return saveVisibleSessionSummary(context, {
    sessionId: input.sessionId,
    summaryText,
    status: input.status ?? "draft",
    revision: getNextSessionSummaryRevision(existingSummaries.data),
    isVisible: input.isVisible ?? true,
  });
}

export async function markOlderSessionSummaryRevisionsStale(
  context: SessionDataContext,
  input: ApproveSessionSummaryRevisionInput,
): Promise<SessionDataResult<null>> {
  const { error } = await context.supabase
    .from("session_summaries")
    .update({
      status: "stale",
    })
    .eq("session_id", input.sessionId)
    .eq("user_id", context.user.id)
    .lt("revision", input.revision)
    .eq("is_visible", true)
    .neq("status", "deleted");

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error));
  }

  return ok(null);
}

export async function approveOwnedSessionSummaryRevision(
  context: SessionDataContext,
  input: ApproveSessionSummaryRevisionInput,
): Promise<SessionDataResult<SessionSummaryRecord>> {
  const session = await ensureOwnedNonDeletedSession(context, input.sessionId);

  if (!session.ok) {
    return session;
  }

  const { data, error } = await context.supabase
    .from("session_summaries")
    .update({
      status: "ready",
      is_visible: true,
    })
    .eq("session_id", input.sessionId)
    .eq("user_id", context.user.id)
    .eq("revision", input.revision)
    .neq("status", "deleted")
    .select(SUMMARY_SELECT)
    .maybeSingle();

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error));
  }

  const row = coerceSummaryRow(data);

  if (!row) {
    return sessionDataError("session_not_found");
  }

  const stale = await markOlderSessionSummaryRevisionsStale(context, input);

  if (!stale.ok) {
    return stale;
  }

  return ok(mapSummary(row));
}

export async function listNewestApprovedSessionSummaryContexts(
  context: SessionDataContext,
  options: ListApprovedSessionSummaryContextOptions = {},
): Promise<SessionDataResult<ApprovedSessionSummaryContext[]>> {
  const limit = normalizeApprovedSummaryContextLimit(options.limit);
  const queryLimit = limit * 4;
  const { data, error } = await context.supabase
    .from("session_summaries")
    .select(SUMMARY_WITH_SESSION_SELECT)
    .eq("user_id", context.user.id)
    .eq("status", "ready")
    .eq("is_visible", true)
    .neq("therapy_sessions.status", "deleted")
    .order("updated_at", { ascending: false })
    .limit(queryLimit);

  if (error) {
    return sessionDataError(mapSupabaseReadError(error));
  }

  return ok(toApprovedSessionSummaryContexts(coerceSummaryRows(data).map(mapSummary), limit));
}

export async function purgeOwnedSessionSummaries(
  context: SessionDataContext,
  sessionId: SessionId,
): Promise<SessionDataResult<null>> {
  const { error } = await context.supabase
    .from("session_summaries")
    .delete()
    .eq("session_id", sessionId)
    .eq("user_id", context.user.id);

  if (error) {
    return sessionDataError(mapSupabaseWriteError(error));
  }

  return ok(null);
}
