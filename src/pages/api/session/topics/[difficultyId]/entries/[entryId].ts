import type { APIRoute } from "astro";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";
import { deleteDifficultyEntry, updateDifficultyEntry } from "@/lib/session-flow/topic-cards";
import {
  getTopicFailureStatus,
  parseDifficultyEntryUpdateRequest,
  parseDifficultyIdParam,
  TOPIC_LIMITS,
  topicFailure,
  type DifficultyEntryDeleteResponse,
  type DifficultyUpdateResponse,
} from "@/lib/session-flow/topic-map-contract";

export const prerender = false;

function jsonResponse(
  body:
    | DifficultyUpdateResponse
    | DifficultyEntryDeleteResponse
    | (ReturnType<typeof topicFailure> & { limits?: typeof TOPIC_LIMITS }),
) {
  return Response.json(body, {
    status: body.ok ? 200 : getTopicFailureStatus(body.code),
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function resolveIds(context: Parameters<APIRoute>[0]) {
  const sessionContext = await requireSessionRouteAccess(context);
  if (!sessionContext.ok)
    return { ok: false as const, response: jsonResponse(topicFailure(sessionContext.error.code)) };
  const difficultyId = parseDifficultyIdParam(context.params.difficultyId);
  const entryId = parseDifficultyIdParam(context.params.entryId);
  if (!difficultyId || !entryId) return { ok: false as const, response: jsonResponse(topicFailure("entry_not_found")) };
  return { ok: true as const, sessionContext: sessionContext.data, difficultyId, entryId };
}

/** Poprawiony wpis zostaje oznaczony jako ustalony przez użytkownika; model go nie zastąpi. Niezależnie od flagi. */
export const PATCH: APIRoute = async (context) => {
  const ids = await resolveIds(context);
  if (!ids.ok) return ids.response;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    body = null;
  }
  const input = parseDifficultyEntryUpdateRequest(body);
  if (!input) return jsonResponse({ ...topicFailure("validation_failed"), limits: TOPIC_LIMITS });

  const response = await updateDifficultyEntry(ids.sessionContext, ids.entryId, input.text);
  if (response.ok && response.card.id !== ids.difficultyId) return jsonResponse(topicFailure("entry_not_found"));
  return jsonResponse(response);
};

/** Usunięcie wpisu; ostatni wpis zabiera ze sobą trudność (`card: null`). Niezależnie od flagi. */
export const DELETE: APIRoute = async (context) => {
  const ids = await resolveIds(context);
  if (!ids.ok) return ids.response;

  const response = await deleteDifficultyEntry(ids.sessionContext, ids.entryId);
  if (response.ok && response.difficultyId !== ids.difficultyId) return jsonResponse(topicFailure("entry_not_found"));
  return jsonResponse(response);
};
