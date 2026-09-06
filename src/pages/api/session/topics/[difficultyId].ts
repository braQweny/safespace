import type { APIRoute } from "astro";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";
import { deleteDifficultyCard, updateDifficultyCard } from "@/lib/session-flow/topic-cards";
import {
  getTopicFailureStatus,
  parseDifficultyIdParam,
  parseDifficultyUpdateRequest,
  TOPIC_LIMITS,
  topicFailure,
  type DifficultyDeleteResponse,
  type DifficultyUpdateResponse,
} from "@/lib/session-flow/topic-map-contract";
import { isTopicMapEnabled } from "@/lib/session-flow/topic-map-mode";

export const prerender = false;

function jsonResponse(
  body:
    | DifficultyUpdateResponse
    | DifficultyDeleteResponse
    | (ReturnType<typeof topicFailure> & { limits?: typeof TOPIC_LIMITS }),
) {
  return Response.json(body, {
    status: body.ok ? 200 : getTopicFailureStatus(body.code),
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Edycja etykiety, notatki i oznaczenia „mniej aktualne”. Zmieniona etykieta
 * zostaje zablokowana przed modelem, a stara staje się aliasem (RPC). Zajęta
 * etykieta → 409 `duplicate_difficulty_label`. Bez logowania: etykiety to
 * treść rozmów.
 */
export const PATCH: APIRoute = async (context) => {
  if (!isTopicMapEnabled()) return jsonResponse(topicFailure("topic_map_unavailable"));
  const sessionContext = await requireSessionRouteAccess(context);
  if (!sessionContext.ok) return jsonResponse(topicFailure(sessionContext.error.code));
  const difficultyId = parseDifficultyIdParam(context.params.difficultyId);
  if (!difficultyId) return jsonResponse(topicFailure("difficulty_not_found"));

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    body = null;
  }
  const input = parseDifficultyUpdateRequest(body);
  if (!input) return jsonResponse({ ...topicFailure("validation_failed"), limits: TOPIC_LIMITS });

  return jsonResponse(await updateDifficultyCard(sessionContext.data, difficultyId, input));
};

/**
 * Usunięcie trudności ze wszystkimi wpisami. Działa niezależnie od flagi —
 * zarządzanie zapisami zawsze musi być możliwe. Bez wykluczenia: model może
 * odtworzyć trudność tylko z nowych rozmów.
 */
export const DELETE: APIRoute = async (context) => {
  const sessionContext = await requireSessionRouteAccess(context);
  if (!sessionContext.ok) return jsonResponse(topicFailure(sessionContext.error.code));
  const difficultyId = parseDifficultyIdParam(context.params.difficultyId);
  if (!difficultyId) return jsonResponse(topicFailure("difficulty_not_found"));

  return jsonResponse(await deleteDifficultyCard(sessionContext.data, difficultyId));
};
