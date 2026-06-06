import { sessionDataError, type SessionDataResult } from "./errors";
import {
  getOwnedSessionMetadata,
  purgeOwnedSessionMessages,
  purgeOwnedSessionSummaries,
  updateSessionTombstone,
} from "./repository";
import type { DeletedSessionTombstone, DeleteOwnedSessionInput, SessionDataContext } from "./types";

export async function deleteOwnedSession(
  context: SessionDataContext,
  input: DeleteOwnedSessionInput,
): Promise<SessionDataResult<DeletedSessionTombstone>> {
  const session = await getOwnedSessionMetadata(context, input.sessionId);

  if (!session.ok) {
    return session;
  }

  if (session.data.status === "deleted") {
    return sessionDataError("invalid_lifecycle_transition");
  }

  const messages = await purgeOwnedSessionMessages(context, input.sessionId);

  if (!messages.ok) {
    return sessionDataError("delete_failed");
  }

  const summaries = await purgeOwnedSessionSummaries(context, input.sessionId);

  if (!summaries.ok) {
    return sessionDataError("delete_failed");
  }

  const tombstone = await updateSessionTombstone(context, input);

  if (!tombstone.ok) {
    return sessionDataError("delete_failed");
  }

  return tombstone;
}
