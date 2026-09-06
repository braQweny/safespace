import type { APIRoute } from "astro";
import { deletePersonFact, updatePersonFact } from "@/lib/session-flow/people-cards";
import {
  getPeopleFailureStatus,
  parseFactUpdateRequest,
  parsePersonIdParam,
  PEOPLE_LIMITS,
  peopleFailure,
  type PersonFactDeleteResponse,
  type PersonUpdateResponse,
} from "@/lib/session-flow/people-contract";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";

export const prerender = false;

function jsonResponse(
  body:
    | PersonUpdateResponse
    | PersonFactDeleteResponse
    | (ReturnType<typeof peopleFailure> & { limits?: typeof PEOPLE_LIMITS }),
) {
  return Response.json(body, {
    status: body.ok ? 200 : getPeopleFailureStatus(body.code),
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function resolveIds(context: Parameters<APIRoute>[0]) {
  const sessionContext = await requireSessionRouteAccess(context);
  if (!sessionContext.ok)
    return { ok: false as const, response: jsonResponse(peopleFailure(sessionContext.error.code)) };
  const personId = parsePersonIdParam(context.params.personId);
  const factId = parsePersonIdParam(context.params.factId);
  if (!personId || !factId) return { ok: false as const, response: jsonResponse(peopleFailure("fact_not_found")) };
  return { ok: true as const, sessionContext: sessionContext.data, personId, factId };
}

/** Poprawiony wpis zostaje oznaczony jako ustalony przez użytkownika; model go nie zastąpi. */
export const PATCH: APIRoute = async (context) => {
  const ids = await resolveIds(context);
  if (!ids.ok) return ids.response;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    body = null;
  }
  const input = parseFactUpdateRequest(body);
  if (!input) return jsonResponse({ ...peopleFailure("validation_failed"), limits: PEOPLE_LIMITS });

  const response = await updatePersonFact(ids.sessionContext, ids.factId, input.text);
  if (response.ok && response.card.id !== ids.personId) return jsonResponse(peopleFailure("fact_not_found"));
  return jsonResponse(response);
};

/** Usunięcie wpisu odświeża przypięte briefy; działa niezależnie od flagi. */
export const DELETE: APIRoute = async (context) => {
  const ids = await resolveIds(context);
  if (!ids.ok) return ids.response;

  const response = await deletePersonFact(ids.sessionContext, ids.factId);
  if (response.ok && response.personId !== ids.personId) return jsonResponse(peopleFailure("fact_not_found"));
  return jsonResponse(response);
};
