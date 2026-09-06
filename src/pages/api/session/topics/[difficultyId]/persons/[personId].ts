import type { APIRoute } from "astro";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";
import { decideDifficultyPerson } from "@/lib/session-flow/topic-cards";
import {
  getTopicFailureStatus,
  parseDifficultyIdParam,
  parseDifficultyPersonDecisionRequest,
  topicFailure,
  type DifficultyUpdateResponse,
} from "@/lib/session-flow/topic-map-contract";
import { isTopicMapEnabled } from "@/lib/session-flow/topic-map-mode";

export const prerender = false;

function jsonResponse(body: DifficultyUpdateResponse) {
  return Response.json(body, {
    status: body.ok ? 200 : getTopicFailureStatus(body.code),
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Decyzja o powiązaniu trudności z osobą: `confirmed` albo `rejected`, zawsze
 * z `user_decided`, więc model już jej nie zmieni. Odrzucenie usuwa wpisy
 * przy tej osobie; potwierdzenie bez krawędzi tworzy ją (użytkownik sam łączy).
 */
export const POST: APIRoute = async (context) => {
  if (!isTopicMapEnabled()) return jsonResponse(topicFailure("topic_map_unavailable"));
  const sessionContext = await requireSessionRouteAccess(context);
  if (!sessionContext.ok) return jsonResponse(topicFailure(sessionContext.error.code));
  const difficultyId = parseDifficultyIdParam(context.params.difficultyId);
  if (!difficultyId) return jsonResponse(topicFailure("difficulty_not_found"));
  const personId = parseDifficultyIdParam(context.params.personId);
  if (!personId) return jsonResponse(topicFailure("person_not_found"));

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    body = null;
  }
  const input = parseDifficultyPersonDecisionRequest(body);
  if (!input) return jsonResponse(topicFailure("validation_failed"));

  return jsonResponse(await decideDifficultyPerson(sessionContext.data, difficultyId, personId, input.state));
};
