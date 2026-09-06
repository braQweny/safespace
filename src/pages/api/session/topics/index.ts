import type { APIRoute } from "astro";
import { isSessionAvatarId } from "@/lib/session-data/types";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";
import { readDifficultyCards } from "@/lib/session-flow/topic-cards";
import { getTopicFailureStatus, topicFailure, type TopicListResponse } from "@/lib/session-flow/topic-map-contract";
import { isTopicMapEnabled } from "@/lib/session-flow/topic-map-mode";

export const prerender = false;

function jsonResponse(body: TopicListResponse) {
  return Response.json(body, {
    status: body.ok ? 200 : getTopicFailureStatus(body.code),
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** Lista trudności właściciela dla jednej perspektywy — odświeżenie po przygotowaniu w tle. */
export const GET: APIRoute = async (context) => {
  if (!isTopicMapEnabled()) return jsonResponse(topicFailure("topic_map_unavailable"));
  const sessionContext = await requireSessionRouteAccess(context);
  if (!sessionContext.ok) return jsonResponse(topicFailure(sessionContext.error.code));
  const avatarId = context.url.searchParams.get("avatar");
  if (!isSessionAvatarId(avatarId)) return jsonResponse(topicFailure("validation_failed"));

  return jsonResponse(await readDifficultyCards(sessionContext.data, avatarId));
};
