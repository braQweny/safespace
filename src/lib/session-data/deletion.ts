import { sessionDataError, type SessionDataResult } from "./errors";
import {
  getOwnedSessionMetadata,
  purgeOwnedSessionMessages,
  purgeOwnedSessionSummaries,
  updateSessionTombstone,
} from "./repository";
import type { DeletedSessionTombstone, DeleteOwnedSessionInput, SessionDataContext } from "./types";

export interface DeletionRepository {
  getOwnedSessionMetadata: typeof getOwnedSessionMetadata;
  purgeOwnedSessionMessages: typeof purgeOwnedSessionMessages;
  purgeOwnedSessionSummaries: typeof purgeOwnedSessionSummaries;
  updateSessionTombstone: typeof updateSessionTombstone;
}

const defaultDeletionRepository: DeletionRepository = {
  getOwnedSessionMetadata,
  purgeOwnedSessionMessages,
  purgeOwnedSessionSummaries,
  updateSessionTombstone,
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

  const messages = await repository.purgeOwnedSessionMessages(context, input.sessionId);

  if (!messages.ok) {
    return sessionDataError("delete_failed");
  }

  const summaries = await repository.purgeOwnedSessionSummaries(context, input.sessionId);

  if (!summaries.ok) {
    return sessionDataError("delete_failed");
  }

  const tombstone = await repository.updateSessionTombstone(context, input);

  if (!tombstone.ok) {
    return sessionDataError("delete_failed");
  }

  return tombstone;
}
