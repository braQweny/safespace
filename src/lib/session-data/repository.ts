/**
 * Public entry point for owner-bound reads and writes of private rows
 * (sessions, messages, summaries, avatar memory, people cards, topic map,
 * message turns, plans). The implementation lives in per-entity modules; code
 * outside `session-data/` imports these functions from this barrel, never from
 * those modules, so the public privacy surface stays in one place.
 *
 * Deliberately imported directly instead: `auth.ts` (`getSessionDataContext`,
 * which creates the context every function here takes), the contracts
 * `types.ts` and `errors.ts`, the plan and allowance reads `quota.ts` and
 * `voice-quota.ts` (limits, the free-trial claim), `deletion.ts`
 * (`deleteOwnedSession`) and the work types session-flow's memory pipelines
 * take from `avatar-memory.ts` / `people-memory.ts`.
 */
export { toDeletedSessionTombstone } from "./rows";
export {
  getOwnedAvatarMemoryWork,
  saveOwnedAvatarMemoryWork,
  getOwnedSessionAvatarMemory,
  getOwnedSessionPinnedContext,
  getOwnedAvatarMemoryPreview,
} from "./avatar-memory";
export {
  countOwnedPersonCards,
  deleteOwnedPersonFact,
  disableAndDeleteOwnedPeopleMemory,
  forgetOwnedPerson,
  getOwnedPeopleMemoryWork,
  getOwnedPersonCard,
  hasOwnedPeopleRows,
  listOwnedPersonCards,
  readOwnedPeopleMemoryEnabled,
  saveOwnedPeopleMemoryWork,
  setOwnedPeopleMemoryEnabled,
  updateOwnedPersonCard,
  updateOwnedPersonFact,
} from "./people-memory";
export {
  countOwnedDifficultyCards,
  decideOwnedDifficultyPerson,
  deleteOwnedDifficulty,
  deleteOwnedDifficultyEntry,
  disableAndDeleteOwnedTopicMap,
  getOwnedDifficultyCard,
  hasOwnedDifficultyRows,
  listOwnedDifficultyCards,
  mergeOwnedDifficulties,
  readOwnedTopicMapEnabled,
  setOwnedTopicMapEnabled,
  updateOwnedDifficultyCard,
  updateOwnedDifficultyEntry,
} from "./topic-map";
export { claimSessionMessageTurn, completeSessionMessageTurn, releaseSessionMessageTurn } from "./message-turns";
export { getOwnedAccountPlan, toOwnedAccountPlan } from "./account-plan";
export {
  canTransitionSessionLifecycle,
  countOwnedSessions,
  countOwnedSessionsByAvatar,
  countOwnedVoiceSessions,
  createPendingSession,
  getOwnedSessionMetadata,
  listOwnedActiveSessionMetadata,
  listOwnedSessionHistoryPage,
  listOwnedSessionMetadata,
  listOwnedVoiceObserverSessionIds,
  markVoiceSessionConnected,
  purgeAndTombstoneOwnedSession,
  readOwnedVoiceUsage,
  readSafeSessionTombstone,
  setOwnedSessionLens,
  transitionSessionLifecycle,
} from "./sessions";
export { appendVoiceSessionUtterances } from "./voice-utterances";
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
