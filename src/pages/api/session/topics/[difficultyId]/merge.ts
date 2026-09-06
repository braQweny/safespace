import type { APIRoute } from "astro";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";
import { mergeDifficultyCards } from "@/lib/session-flow/topic-cards";
import {
  getTopicFailureStatus,
  parseDifficultyIdParam,
  parseDifficultyMergeRequest,
  topicFailure,
  type DifficultyMergeResponse,
} from "@/lib/session-flow/topic-map-contract";
import { isTopicMapEnabled } from "@/lib/session-flow/topic-map-mode";

export const prerender = false;

function jsonResponse(body: DifficultyMergeResponse) {
  return Response.json(body, {
    status: body.ok ? 200 : getTopicFailureStatus(body.code),
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * „Scal z…”: trudność z adresu jest źródłem i znika, `targetId` z body dostaje
 * jej wpisy, osoby, inne nazwy i wzmianki. Nic nie ginie; limity nie są
 * egzekwowane. Ten sam id po obu stronach → 400.
 */
export const POST: APIRoute = async (context) => {
  if (!isTopicMapEnabled()) return jsonResponse(topicFailure("topic_map_unavailable"));
  const sessionContext = await requireSessionRouteAccess(context);
  if (!sessionContext.ok) return jsonResponse(topicFailure(sessionContext.error.code));
  const sourceId = parseDifficultyIdParam(context.params.difficultyId);
  if (!sourceId) return jsonResponse(topicFailure("difficulty_not_found"));

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    body = null;
  }
  const input = parseDifficultyMergeRequest(body);
  if (!input) return jsonResponse(topicFailure("validation_failed"));

  return jsonResponse(await mergeDifficultyCards(sessionContext.data, sourceId, input.targetId));
};
