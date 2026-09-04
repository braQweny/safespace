import { getValidAvatarChoice } from "@/lib/modalities";
import { getOwnedAvatarMemoryWork, saveOwnedAvatarMemoryWork } from "@/lib/session-data/repository";
import type { AvatarMemoryWork } from "@/lib/session-data/avatar-memory";
import type { SessionAvatarId, SessionDataContext, SessionModalityId } from "@/lib/session-data/types";
import { generateSessionSummary } from "@/lib/session-summary/provider";
import type { SessionSummaryConversationMessage } from "@/lib/session-summary/types";
import { SessionSummaryError, type SessionSummaryErrorCategory } from "@/lib/session-summary/errors";

export const AVATAR_MEMORY_MAX_CHARS = 6000;
const MEMORY_BATCH_PARTS = 16;
const MEMORY_PART_CHARS = 1200;

/** Każdy znak przechodzi przez podsumowanie, również początek długich rozmów i emoji. */
export function buildAvatarMemoryBatch(work: AvatarMemoryWork) {
  const messages: SessionSummaryConversationMessage[] = [];
  let sequenceIndex = work.sequenceIndex;
  let characterOffset = work.characterOffset;
  for (const message of work.messages) {
    const characters = Array.from(message.content);
    let offset = message.sequenceIndex === work.sequenceIndex ? work.characterOffset : 0;
    while (offset < characters.length && messages.length < MEMORY_BATCH_PARTS) {
      const end = Math.min(characters.length, offset + MEMORY_PART_CHARS);
      messages.push({
        role: message.role,
        content: characters.slice(offset, end).join(""),
        sequenceIndex: message.sequenceIndex,
      });
      sequenceIndex = message.sequenceIndex;
      characterOffset = end;
      offset = end;
    }
    if (messages.length === MEMORY_BATCH_PARTS) break;
  }
  return { messages, sequenceIndex, characterOffset };
}

const dependencies = { getOwnedAvatarMemoryWork, saveOwnedAvatarMemoryWork, generateSessionSummary };

/** Jeden trwały krok na żądanie, bez zużycia sesji i bez licznika czasu. Retry wznawia zapisany postęp. */
export async function prepareOwnedAvatarMemory(
  context: SessionDataContext,
  avatar: { avatarId: SessionAvatarId; modalityId: SessionModalityId },
  repository = dependencies,
): Promise<{ ok: true; ready: boolean } | { ok: false; providerFailure?: SessionSummaryErrorCategory }> {
  const work = await repository.getOwnedAvatarMemoryWork(context, avatar.avatarId);
  if (!work.ok) return { ok: false };
  if (work.data.sessionId === null) return { ok: true, ready: true };
  const batch = buildAvatarMemoryBatch(work.data);
  const modality = getValidAvatarChoice(avatar.modalityId, avatar.avatarId);
  if (!modality || batch.messages.length === 0) return { ok: false };
  try {
    const response = await repository.generateSessionSummary({
      messages: batch.messages,
      continuityMemory: work.data.summaryText,
      modality: {
        modalityName: modality.modalityName,
        avatarName: modality.avatarName,
        summaryLensHint: modality.summaryLensHint,
      },
      locale: "pl",
    });
    const summaryText = response.summaryText.trim();
    // Odrzucamy za długą odpowiedź zamiast ucinać fakty ze starszych rozmów.
    if (!summaryText || Array.from(summaryText).length > AVATAR_MEMORY_MAX_CHARS) return { ok: false };
    const saved = await repository.saveOwnedAvatarMemoryWork(context, avatar.avatarId, {
      revision: work.data.revision,
      sessionId: work.data.sessionId,
      summaryText,
      sequenceIndex: batch.sequenceIndex,
      characterOffset: batch.characterOffset,
    });
    // Przegrany CAS oznacza równoległy postęp lub usunięcie źródła. Kolejny krok odczyta nowy stan.
    return saved.ok ? { ok: true, ready: false } : { ok: false };
  } catch (error) {
    return error instanceof SessionSummaryError ? { ok: false, providerFailure: error.category } : { ok: false };
  }
}
