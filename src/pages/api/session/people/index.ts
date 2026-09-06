import type { APIRoute } from "astro";
import { isSessionAvatarId } from "@/lib/session-data/types";
import { readPersonCards } from "@/lib/session-flow/people-cards";
import { getPeopleFailureStatus, peopleFailure, type PeopleListResponse } from "@/lib/session-flow/people-contract";
import { isPeopleMemoryEnabled } from "@/lib/session-flow/people-memory-mode";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";

export const prerender = false;

function jsonResponse(body: PeopleListResponse) {
  return Response.json(body, {
    status: body.ok ? 200 : getPeopleFailureStatus(body.code),
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** Lista kart właściciela dla jednej perspektywy — odświeżenie po przygotowaniu w tle. */
export const GET: APIRoute = async (context) => {
  if (!isPeopleMemoryEnabled()) return jsonResponse(peopleFailure("people_memory_unavailable"));
  const sessionContext = await requireSessionRouteAccess(context);
  if (!sessionContext.ok) return jsonResponse(peopleFailure(sessionContext.error.code));
  const avatarId = context.url.searchParams.get("avatar");
  if (!isSessionAvatarId(avatarId)) return jsonResponse(peopleFailure("validation_failed"));

  return jsonResponse(await readPersonCards(sessionContext.data, avatarId));
};
