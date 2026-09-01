/**
 * Public entry point of the owner-bound session-data repository. The
 * implementation lives in per-entity modules (`sessions.ts`, `messages.ts`,
 * `summaries.ts`, `trial-claims.ts`); this barrel is the only import path the
 * rest of the codebase should use, so the public privacy surface stays in one
 * place.
 */
export { toDeletedSessionTombstone } from "./rows";
export { getOwnedAccountPlan, toOwnedAccountPlan } from "./account-plan";
export {
  canTransitionSessionLifecycle,
  countOwnedSessions,
  createPendingSession,
  getOwnedSessionMetadata,
  listOwnedActiveSessionMetadata,
  listOwnedSessionHistoryPage,
  listOwnedSessionMetadata,
  purgeAndTombstoneOwnedSession,
  readSafeSessionTombstone,
  transitionSessionLifecycle,
} from "./sessions";
export {
  appendSessionMessage,
  appendSessionMessages,
  getNextSessionMessageSequenceIndex,
  getOwnedSessionHistoryDetail,
  listOwnedSessionMessages,
  listRecentOwnedSessionMessages,
} from "./messages";
export {
  approveOwnedSessionSummaryRevision,
  getLatestOwnedSessionSummaryState,
  getNextSessionSummaryRevision,
  listNewestApprovedSessionSummaryContexts,
  listOwnedSessionSummaries,
  listOwnedSessionSummaryStates,
  markOlderSessionSummaryRevisionsStale,
  saveGeneratedVisibleSessionSummary,
  saveVisibleSessionSummary,
  toApprovedSessionSummaryContexts,
  toLatestSessionSummaryState,
  toSessionSummaryPreview,
  toSessionSummaryStateKind,
  toSessionSummaryStatesBySession,
} from "./summaries";
export { claimFreeTrialSessionAtomic, createSessionTrialClaim, getTrialAvailability } from "./trial-claims";
