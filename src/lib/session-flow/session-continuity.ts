import type { Locale } from "@/lib/i18n/locale";
import type { ModalityAvatar } from "@/lib/modalities";
import { getModalityPromptNames } from "@/lib/modality-copy";
import type { SessionAiApprovedSummaryContext, SessionAiModalityContext } from "@/lib/session-ai/types";
import { getOwnedSessionPinnedContext, listNewestApprovedSessionSummaryContexts } from "@/lib/session-data/repository";
import type { SessionDataResult } from "@/lib/session-data/errors";
import type { ApprovedSessionSummaryContext, SessionDataContext, SessionMetadata } from "@/lib/session-data/types";
import { isPeopleMemoryEnabled } from "./people-memory-mode";
import { isTopicMapEnabled } from "./topic-map-mode";

export type SessionContinuity = SessionDataResult<ApprovedSessionSummaryContext[]> & {
  avatarMemory?: string;
  /** Brief kart osób z tej samej przypiętej kopii; tylko gdy funkcja jest włączona. */
  peopleBrief?: string;
  /** Brief mapy tematów z tej samej kopii; tylko gdy jej flaga jest włączona. */
  topicBrief?: string;
};

export async function loadOwnedSessionContinuity(
  context: SessionDataContext,
  session: SessionMetadata,
): Promise<SessionContinuity> {
  if (!session.usesApprovedContext) return { ok: true, data: [] };
  if (session.usesAvatarMemory) {
    const pinned = await getOwnedSessionPinnedContext(context, session);
    if (!pinned.ok) return pinned;
    // Flaga globalna gasi używanie kart nawet dla briefu przypiętego wcześniej.
    const peopleBrief = pinned.data.peopleBrief && isPeopleMemoryEnabled() ? pinned.data.peopleBrief : undefined;
    const topicBrief = pinned.data.topicBrief && isTopicMapEnabled() ? pinned.data.topicBrief : undefined;
    return {
      ok: true,
      data: [],
      avatarMemory: pinned.data.avatarMemory,
      ...(peopleBrief ? { peopleBrief } : {}),
      ...(topicBrief ? { topicBrief } : {}),
    };
  }
  // Trwające sesje ze starej wersji zachowują wcześniejszy tryb kontekstu.
  return listNewestApprovedSessionSummaryContexts(context, { avatarId: session.avatarId ?? undefined });
}

/** Ciągłość odczytana bez błędu — tylko taka trafia do promptu. */
export type LoadedSessionContinuity = Extract<SessionContinuity, { ok: true }>;

/**
 * Część wejścia promptu wspólna dla wszystkich ścieżek generacji: odpowiedzi
 * (`/api/session/message`), otwarcia (`session-opening.ts`) i warstwy backend
 * rozmowy głosowej (`/api/session/voice/connect`). Każde pole ma w prompcie
 * własne ogrodzenie, więc nowy brief dopisuje się tylko tutaj — ścieżka, która
 * by go pominęła, po cichu straciłaby jego granice prywatności.
 */
export interface SessionPromptContext {
  modality: SessionAiModalityContext;
  avatarMemory: string | undefined;
  peopleBrief: string | undefined;
  topicBrief: string | undefined;
  approvedSummaries: SessionAiApprovedSummaryContext[];
}

export function toSessionPromptContext(
  modality: Pick<ModalityAvatar, "modalityId" | "sessionStyleHint" | "registerExamples">,
  continuity: LoadedSessionContinuity,
  locale: Locale,
): SessionPromptContext {
  return {
    modality: {
      // Metadane promptu zawsze po angielsku, niezależnie od języka interfejsu.
      ...getModalityPromptNames(modality.modalityId),
      sessionStyleHint: modality.sessionStyleHint,
      registerExamples: modality.registerExamples[locale],
    },
    avatarMemory: continuity.avatarMemory,
    peopleBrief: continuity.peopleBrief,
    topicBrief: continuity.topicBrief,
    approvedSummaries: continuity.data.map((summary) => ({
      summaryText: summary.summaryText,
      revision: summary.revision,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
    })),
  };
}
