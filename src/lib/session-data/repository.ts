/**
 * Public entry point of the owner-bound session-data repository. The
 * implementation lives in per-entity modules (`sessions.ts`, `messages.ts`,
 * `summaries.ts`, `trial-claims.ts`); this barrel is the only import path the
 * rest of the codebase should use, so the public privacy surface stays in one
 * place.
 */
export { toDeletedSessionTombstone } from "./rows";
export {
  canTransitionSessionLifecycle,
  createPendingSession,
  getOwnedSessionMetadata,
  listOwnedSessionHistoryPage,
  listOwnedSessionMetadata,
  markOwnedSessionDeleted,
  purgeAndTombstoneOwnedSession,
  readSafeSessionTombstone,
  transitionSessionLifecycle,
  updateSessionTombstone,
} from "./sessions";
export {
  appendSessionMessage,
  appendSessionMessages,
  getOwnedSessionHistoryDetail,
  listOwnedSessionMessages,
  purgeOwnedSessionMessages,
} from "./messages";
export {
  approveOwnedSessionSummaryRevision,
  getLatestOwnedSessionSummaryState,
  getNextSessionSummaryRevision,
  listNewestApprovedSessionSummaryContexts,
  listOwnedSessionSummaries,
  markOlderSessionSummaryRevisionsStale,
  purgeOwnedSessionSummaries,
  saveGeneratedVisibleSessionSummary,
  saveVisibleSessionSummary,
  toApprovedSessionSummaryContexts,
  toLatestSessionSummaryState,
  toSessionSummaryPreview,
} from "./summaries";
export { claimFreeTrialSessionAtomic, createSessionTrialClaim, getTrialAvailability } from "./trial-claims";
