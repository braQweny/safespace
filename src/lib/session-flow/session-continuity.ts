import { getOwnedSessionAvatarMemory, listNewestApprovedSessionSummaryContexts } from "@/lib/session-data/repository";
import type { SessionDataResult } from "@/lib/session-data/errors";
import type { ApprovedSessionSummaryContext, SessionDataContext, SessionMetadata } from "@/lib/session-data/types";

export async function loadOwnedSessionContinuity(
  context: SessionDataContext,
  session: SessionMetadata,
): Promise<SessionDataResult<ApprovedSessionSummaryContext[]> & { avatarMemory?: string }> {
  if (!session.usesApprovedContext) return { ok: true, data: [] };
  if (session.usesAvatarMemory) {
    const memory = await getOwnedSessionAvatarMemory(context, session);
    return memory.ok ? { ok: true, data: [], avatarMemory: memory.data } : memory;
  }
  // Trwające sesje ze starej wersji zachowują wcześniejszy tryb kontekstu.
  return listNewestApprovedSessionSummaryContexts(context, { avatarId: session.avatarId ?? undefined });
}
