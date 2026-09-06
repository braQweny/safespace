import type { APIRoute } from "astro";
import { forgetPersonCard } from "@/lib/session-flow/people-cards";
import {
  getPeopleFailureStatus,
  parsePersonIdParam,
  peopleFailure,
  type PersonForgetResponse,
} from "@/lib/session-flow/people-contract";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";

export const prerender = false;

function jsonResponse(body: PersonForgetResponse) {
  return Response.json(body, {
    status: body.ok ? 200 : getPeopleFailureStatus(body.code),
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * „Zapomnij o tej osobie”: trwałe wykluczenie plus unieważnienie pamięci
 * awatara. Działa niezależnie od flagi — zarządzanie zapisami zawsze musi
 * być możliwe. Bodiless POST przechodzi przez strażnika rozmiaru bez nagłówka.
 */
export const POST: APIRoute = async (context) => {
  const sessionContext = await requireSessionRouteAccess(context);
  if (!sessionContext.ok) return jsonResponse(peopleFailure(sessionContext.error.code));
  const personId = parsePersonIdParam(context.params.personId);
  if (!personId) return jsonResponse(peopleFailure("person_not_found"));

  return jsonResponse(await forgetPersonCard(sessionContext.data, personId));
};
