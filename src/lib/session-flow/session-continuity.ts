import { getOwnedSessionPinnedContext, listNewestApprovedSessionSummaryContexts } from "@/lib/session-data/repository";
import type { SessionDataResult } from "@/lib/session-data/errors";
import type { ApprovedSessionSummaryContext, SessionDataContext, SessionMetadata } from "@/lib/session-data/types";
import { isPeopleMemoryEnabled } from "./people-memory-mode";

export type SessionContinuity = SessionDataResult<ApprovedSessionSummaryContext[]> & {
  avatarMemory?: string;
  /** Brief kart osób z tej samej przypiętej kopii; tylko gdy funkcja jest włączona. */
  peopleBrief?: string;
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
    return { ok: true, data: [], avatarMemory: pinned.data.avatarMemory, ...(peopleBrief ? { peopleBrief } : {}) };
  }
  // Trwające sesje ze starej wersji zachowują wcześniejszy tryb kontekstu.
  return listNewestApprovedSessionSummaryContexts(context, { avatarId: session.avatarId ?? undefined });
}
