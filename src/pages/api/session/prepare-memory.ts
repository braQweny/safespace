import type { APIRoute } from "astro";
import { getValidAvatarChoice } from "@/lib/modalities";
import { readSessionQuota } from "@/lib/session-data/quota";
import { prepareOwnedAvatarMemory } from "@/lib/session-flow/avatar-memory";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";
import { isRecord } from "@/lib/type-guards";

export const prerender = false;

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** Przygotowuje wyłącznie pamięć właściciela. Nie tworzy sesji ani nie uruchamia czasu. */
export const POST: APIRoute = async (context) => {
  const access = await requireSessionRouteAccess(context);
  if (!access.ok) return json({ ok: false, code: access.error.code }, access.error.status);

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, code: "validation_failed" }, 400);
  }
  const avatar =
    isRecord(body) && typeof body.modalityId === "string" && typeof body.avatarId === "string"
      ? getValidAvatarChoice(body.modalityId, body.avatarId)
      : null;
  if (!avatar) return json({ ok: false, code: "validation_failed" }, 400);

  const quota = await readSessionQuota(access.data);
  if (!quota.ok) return json({ ok: false, code: "session_quota_unavailable" }, 503);
  if (!quota.data.canStartSession) return json({ ok: false, code: "session_limit_reached" }, 403);

  const memory = await prepareOwnedAvatarMemory(access.data, avatar);
  if (!memory.ok) return json({ ok: false, code: "summary_context_unavailable" }, 503);
  return json(
    { ok: true, type: memory.ready ? "avatar_memory_ready" : "avatar_memory_preparing" },
    memory.ready ? 200 : 202,
  );
};
