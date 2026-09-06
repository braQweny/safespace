import type { SessionDataErrorCode } from "@/lib/session-data/errors";
import {
  decideOwnedDifficultyPerson,
  deleteOwnedDifficulty,
  deleteOwnedDifficultyEntry,
  listOwnedDifficultyCards,
  mergeOwnedDifficulties,
  updateOwnedDifficultyCard,
  updateOwnedDifficultyEntry,
} from "@/lib/session-data/repository";
import type { SessionAvatarId, SessionDataContext } from "@/lib/session-data/types";
import {
  topicFailure,
  type DifficultyDeleteResponse,
  type DifficultyEntryDeleteResponse,
  type DifficultyMergeResponse,
  type DifficultyPersonDecision,
  type DifficultyUpdateRequest,
  type DifficultyUpdateResponse,
  type TopicFailureCode,
  type TopicListResponse,
} from "./topic-map-contract";

/** Kody warstwy danych, które przechodzą do klienta bez zmiany znaczenia. */
function mapTopicDataCode(code: SessionDataErrorCode, fallback: TopicFailureCode): TopicFailureCode {
  if (
    code === "missing_auth" ||
    code === "session_data_unavailable" ||
    code === "read_failed" ||
    code === "duplicate_difficulty_label"
  ) {
    return code;
  }
  return fallback;
}

export async function readDifficultyCards(
  context: SessionDataContext,
  avatarId: SessionAvatarId,
): Promise<TopicListResponse> {
  const cards = await listOwnedDifficultyCards(context, avatarId);
  return cards.ok
    ? { ok: true, type: "topic_list", cards: cards.data }
    : topicFailure(mapTopicDataCode(cards.error.code, "read_failed"));
}

/** Zajęta etykieta wraca jako `duplicate_difficulty_label` (409): interfejs proponuje scalenie. */
export async function updateDifficultyCard(
  context: SessionDataContext,
  difficultyId: string,
  input: DifficultyUpdateRequest,
): Promise<DifficultyUpdateResponse> {
  const card = await updateOwnedDifficultyCard(context, { difficultyId, ...input });
  if (!card.ok) return topicFailure(mapTopicDataCode(card.error.code, "update_failed"));
  return card.data ? { ok: true, type: "difficulty_updated", card: card.data } : topicFailure("difficulty_not_found");
}

export async function deleteDifficultyCard(
  context: SessionDataContext,
  difficultyId: string,
): Promise<DifficultyDeleteResponse> {
  const deleted = await deleteOwnedDifficulty(context, difficultyId);
  if (!deleted.ok) return topicFailure(mapTopicDataCode(deleted.error.code, "delete_failed"));
  return deleted.data ? { ok: true, type: "difficulty_deleted", difficultyId } : topicFailure("difficulty_not_found");
}

/** Odrzucenie usuwa wpisy przy tej osobie; potwierdzenie bez krawędzi tworzy ją. */
export async function decideDifficultyPerson(
  context: SessionDataContext,
  difficultyId: string,
  personId: string,
  state: DifficultyPersonDecision,
): Promise<DifficultyUpdateResponse> {
  const card = await decideOwnedDifficultyPerson(context, { difficultyId, personId, state });
  if (!card.ok) return topicFailure(mapTopicDataCode(card.error.code, "update_failed"));
  return card.data ? { ok: true, type: "difficulty_updated", card: card.data } : topicFailure("person_not_found");
}

export async function updateDifficultyEntry(
  context: SessionDataContext,
  entryId: string,
  text: string,
): Promise<DifficultyUpdateResponse> {
  const card = await updateOwnedDifficultyEntry(context, entryId, text);
  if (!card.ok) return topicFailure(mapTopicDataCode(card.error.code, "update_failed"));
  return card.data ? { ok: true, type: "difficulty_updated", card: card.data } : topicFailure("entry_not_found");
}

export async function deleteDifficultyEntry(
  context: SessionDataContext,
  entryId: string,
): Promise<DifficultyEntryDeleteResponse> {
  const result = await deleteOwnedDifficultyEntry(context, entryId);
  if (!result.ok) return topicFailure(mapTopicDataCode(result.error.code, "delete_failed"));
  if (!result.data) return topicFailure("entry_not_found");
  return {
    ok: true,
    type: "difficulty_entry_deleted",
    difficultyId: result.data.difficultyId,
    card: result.data.card,
  };
}

/** Scalenie źródła w cel; obie muszą należeć do właściciela i tej samej perspektywy. */
export async function mergeDifficultyCards(
  context: SessionDataContext,
  sourceId: string,
  targetId: string,
): Promise<DifficultyMergeResponse> {
  if (sourceId === targetId) return topicFailure("validation_failed");
  const card = await mergeOwnedDifficulties(context, { sourceId, targetId });
  if (!card.ok) return topicFailure(mapTopicDataCode(card.error.code, "merge_failed"));
  return card.data
    ? { ok: true, type: "difficulty_merged", sourceId, card: card.data }
    : topicFailure("difficulty_not_found");
}
