import { listOwnedActiveSessionMetadata } from "@/lib/session-data/repository";
import type { SessionAvatarId, SessionDataContext, SessionMetadata } from "@/lib/session-data/types";

/**
 * Nagłówek aplikacji nie ma już zakładki „Sesja”, więc powrót do trwającej
 * rozmowy musi być widoczny kontekstowo — tylko wtedy, gdy taka rozmowa istnieje.
 */
export interface ActiveSessionBadge {
  sessionId: string;
  remainingMinutes: number | null;
  /**
   * Perspektywa, w której toczy się rozmowa. Panel porównuje ją z zapisanym
   * awatarem, żeby uczciwie powiedzieć „to rozmowa z inną perspektywą”.
   * Null, gdy źródło (np. widok sesji) nie niesie tej informacji.
   */
  avatarId: SessionAvatarId | null;
}

const ACTIVE_SESSION_SCAN_LIMIT = 5;

type ActiveSessionCandidate = Pick<SessionMetadata, "id" | "expiresAt"> & Partial<Pick<SessionMetadata, "avatarId">>;

export function toActiveSessionBadge(
  session: ActiveSessionCandidate | null,
  now: Date = new Date(),
): ActiveSessionBadge | null {
  if (!session) {
    return null;
  }

  const expiresAtMs = session.expiresAt ? Date.parse(session.expiresAt) : Number.NaN;

  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) {
    return null;
  }

  return {
    sessionId: session.id,
    // Zaokrąglenie w górę, żeby ostatnia minuta nie pokazywała się jako zero.
    remainingMinutes: Math.max(1, Math.ceil((expiresAtMs - now.getTime()) / 60_000)),
    avatarId: session.avatarId ?? null,
  };
}

export interface ReadActiveSessionBadgeOptions {
  /** Pominięty = dowolna perspektywa (pill w nagłówku). */
  avatarId?: SessionAvatarId;
  now?: Date;
}

export async function readActiveSessionBadge(
  context: SessionDataContext,
  options: ReadActiveSessionBadgeOptions = {},
  listActiveSessions = listOwnedActiveSessionMetadata,
): Promise<ActiveSessionBadge | null> {
  const activeSessions = await listActiveSessions(context, {
    ...(options.avatarId ? { avatarId: options.avatarId } : {}),
    limit: ACTIVE_SESSION_SCAN_LIMIT,
  });

  if (!activeSessions.ok) {
    return null;
  }

  const now = options.now ?? new Date();

  for (const session of activeSessions.data) {
    const badge = toActiveSessionBadge(session, now);

    if (badge) {
      return badge;
    }
  }

  return null;
}
