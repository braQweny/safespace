/**
 * How many recent turns of the live transcript the reply model sees.
 *
 * The window scales with the session's own budget: a 15-minute conversation
 * rarely exceeds a handful of exchanges, while a 60-minute one would otherwise
 * lose everything but the last four exchanges. The prompt builder keeps its
 * own hard cap (`MAX_RECENT_CONTEXT_MESSAGES`) and per-message character
 * limit, so this only decides how much of the bounded tail is read.
 */
export const MIN_RECENT_MESSAGE_CONTEXT_LIMIT = 8;
export const MAX_RECENT_MESSAGE_CONTEXT_LIMIT = 20;

const BASE_BUDGET_SECONDS = 900;

export function resolveRecentMessageContextLimit(durationBucketSeconds: number | null | undefined) {
  if (
    typeof durationBucketSeconds !== "number" ||
    !Number.isFinite(durationBucketSeconds) ||
    durationBucketSeconds <= BASE_BUDGET_SECONDS
  ) {
    return MIN_RECENT_MESSAGE_CONTEXT_LIMIT;
  }

  const scaled = Math.round((MIN_RECENT_MESSAGE_CONTEXT_LIMIT * durationBucketSeconds) / BASE_BUDGET_SECONDS);

  return Math.min(MAX_RECENT_MESSAGE_CONTEXT_LIMIT, Math.max(MIN_RECENT_MESSAGE_CONTEXT_LIMIT, scaled));
}
