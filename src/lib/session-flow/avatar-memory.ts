import { getValidAvatarChoice } from "@/lib/modalities";
import type { Locale } from "@/lib/i18n/locale";
import { getModalityPromptNames } from "@/lib/modality-copy";
import { getOwnedAvatarMemoryWork, saveOwnedAvatarMemoryWork } from "@/lib/session-data/repository";
import type { AvatarMemoryCursor, AvatarMemoryWork } from "@/lib/session-data/avatar-memory";
import type { SessionAvatarId, SessionDataContext, SessionModalityId } from "@/lib/session-data/types";
import { generateSessionSummary } from "@/lib/session-summary/provider";
import type { SessionSummaryConversationMessage } from "@/lib/session-summary/types";
import { SessionSummaryError, type SessionSummaryErrorCategory } from "@/lib/session-summary/errors";
import { AVATAR_MEMORY_MAX_CHARS, isWithinAvatarMemoryBudget } from "@/lib/session-summary/avatar-memory-budget";

export { AVATAR_MEMORY_MAX_CHARS };

/** Baza ogranicza partię po długości; identyfikatory źródeł zostają poza promptem. */
export function buildAvatarMemoryBatch(work: AvatarMemoryWork) {
  if (!isWithinAvatarMemoryBudget(work.messages, work.summaryText)) {
    throw new TypeError("Avatar memory input exceeds its bounded batch");
  }
  const messages: SessionSummaryConversationMessage[] = [];
  const cursors = new Map<string, AvatarMemoryCursor>();
  for (const message of work.messages) {
    cursors.set(message.sessionId, {
      sessionId: message.sessionId,
      sequenceIndex: message.sequenceIndex,
      characterOffset: message.characterOffset,
    });
    messages.push({
      role: message.role,
      content: message.content,
      conversationIndex: cursors.size,
    });
  }
  return { messages, cursors: [...cursors.values()] };
}

const dependencies = { getOwnedAvatarMemoryWork, saveOwnedAvatarMemoryWork, generateSessionSummary };

/** Jeden trwały krok na żądanie, bez zużycia sesji i bez licznika czasu. Retry wznawia zapisany postęp. */
export async function prepareOwnedAvatarMemory(
  context: SessionDataContext,
  avatar: { avatarId: SessionAvatarId; modalityId: SessionModalityId },
  options: { locale: Locale },
  repository = dependencies,
): Promise<{ ok: true; ready: boolean } | { ok: false; providerFailure?: SessionSummaryErrorCategory }> {
  const work = await repository.getOwnedAvatarMemoryWork(context, avatar.avatarId);
  if (!work.ok) return { ok: false };
  if (work.data.messages.length === 0) return { ok: true, ready: true };
  const modality = getValidAvatarChoice(avatar.modalityId, avatar.avatarId);
  if (!modality) return { ok: false };
  try {
    const batch = buildAvatarMemoryBatch(work.data);
    const response = await repository.generateSessionSummary({
      messages: batch.messages,
      continuityMemory: work.data.summaryText,
      modality: {
        ...getModalityPromptNames(modality.modalityId),
        summaryLensHint: modality.summaryLensHint,
      },
      locale: options.locale,
    });
    const summaryText = response.summaryText.trim();
    // Odrzucamy za długą odpowiedź zamiast ucinać fakty ze starszych rozmów.
    if (!summaryText || Array.from(summaryText).length > AVATAR_MEMORY_MAX_CHARS) return { ok: false };
    const saved = await repository.saveOwnedAvatarMemoryWork(context, avatar.avatarId, {
      revision: work.data.revision,
      summaryText,
      cursors: batch.cursors,
    });
    // Przegrany CAS oznacza równoległy postęp lub usunięcie źródła. Kolejny krok odczyta nowy stan.
    if (!saved.ok) return { ok: false };
    if (!saved.data) return { ok: true, ready: false };
    // Sprawdzenie ostatniej partii tutaj oszczędza cały kolejny POST startu
    // (autoryzację, odczyt perspektywy i limitu). Insert nadal sprawdza kompletność.
    const remaining = await repository.getOwnedAvatarMemoryWork(context, avatar.avatarId);
    return remaining.ok ? { ok: true, ready: remaining.data.messages.length === 0 } : { ok: false };
  } catch (error) {
    return error instanceof SessionSummaryError ? { ok: false, providerFailure: error.category } : { ok: false };
  }
}
