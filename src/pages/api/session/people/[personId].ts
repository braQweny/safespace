import type { APIRoute } from "astro";
import { updatePersonCard } from "@/lib/session-flow/people-cards";
import {
  getPeopleFailureStatus,
  parsePersonIdParam,
  parsePersonUpdateRequest,
  PEOPLE_LIMITS,
  peopleFailure,
  type PersonUpdateResponse,
} from "@/lib/session-flow/people-contract";
import { isPeopleMemoryEnabled } from "@/lib/session-flow/people-memory-mode";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";

export const prerender = false;

function jsonResponse(
  body: PersonUpdateResponse | (ReturnType<typeof peopleFailure> & { limits?: typeof PEOPLE_LIMITS }),
) {
  return Response.json(body, {
    status: body.ok ? 200 : getPeopleFailureStatus(body.code),
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Edycja imienia, relacji i notatki. Zmieniona wartość zostaje zablokowana
 * przed modelem (RPC). Bez logowania: imiona to treść rozmów.
 */
export const PATCH: APIRoute = async (context) => {
  if (!isPeopleMemoryEnabled()) return jsonResponse(peopleFailure("people_memory_unavailable"));
  const sessionContext = await requireSessionRouteAccess(context);
  if (!sessionContext.ok) return jsonResponse(peopleFailure(sessionContext.error.code));
  const personId = parsePersonIdParam(context.params.personId);
  if (!personId) return jsonResponse(peopleFailure("person_not_found"));

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    body = null;
  }
  const input = parsePersonUpdateRequest(body);
  if (!input) return jsonResponse({ ...peopleFailure("validation_failed"), limits: PEOPLE_LIMITS });

  return jsonResponse(await updatePersonCard(sessionContext.data, personId, input));
};
