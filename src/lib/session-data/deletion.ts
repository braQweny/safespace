import { sessionDataError, type SessionDataResult } from "./errors";
import { getOwnedSessionMetadata, purgeAndTombstoneOwnedSession } from "./repository";
import type { DeletedSessionTombstone, DeleteOwnedSessionInput, SessionDataContext } from "./types";

export interface DeletionRepository {
  getOwnedSessionMetadata: typeof getOwnedSessionMetadata;
  purgeAndTombstoneOwnedSession: typeof purgeAndTombstoneOwnedSession;
}

const defaultDeletionRepository: DeletionRepository = {
  getOwnedSessionMetadata,
  purgeAndTombstoneOwnedSession,
};

export async function deleteOwnedSession(
  context: SessionDataContext,
  input: DeleteOwnedSessionInput,
  repository: DeletionRepository = defaultDeletionRepository,
): Promise<SessionDataResult<DeletedSessionTombstone>> {
  const session = await repository.getOwnedSessionMetadata(context, input.sessionId);

  if (!session.ok) {
    return session;
  }

  if (session.data.status === "deleted") {
    return sessionDataError("invalid_lifecycle_transition");
  }

  // Message purge, summary purge and the tombstone update run in one DB
  // transaction, so a mid-flight failure cannot leave a partially purged session.
  const tombstone = await repository.purgeAndTombstoneOwnedSession(context, input);

  if (!tombstone.ok) {
    const code = tombstone.error.code;
    return code === "session_not_found" || code === "invalid_lifecycle_transition"
      ? tombstone
      : sessionDataError("delete_failed");
  }

  return tombstone;
}
