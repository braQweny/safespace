import type { APIRoute } from "astro";
import { getAdminContext } from "@/lib/admin/auth";
import { adminApiFailure, getAdminApiFailureStatus, type AdminUserPlanResponse } from "@/lib/admin/contracts";
import { parseAdminUserPlanInput, setAdminUserPlanState } from "@/lib/admin/users";

export const prerender = false;

function jsonResponse(body: AdminUserPlanResponse) {
  const status = body.ok ? 200 : getAdminApiFailureStatus(body.code);
  return Response.json(body, { status });
}

async function parseBody(request: Request) {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * Grants or revokes the premium plan for one account. Premium lifts the
 * free-plan session cap; the change is audited like a block/unblock. There is
 * no payment provider behind this yet — the admin confirms the payment fact.
 */
export const POST: APIRoute = async (context) => {
  const adminContext = await getAdminContext(context);

  if (!adminContext.ok) {
    return jsonResponse(adminApiFailure(adminContext.error.code));
  }

  const input = parseAdminUserPlanInput(context.params.userId, await parseBody(context.request));

  if (!input.ok) {
    return jsonResponse(adminApiFailure(input.error.code));
  }

  const result = await setAdminUserPlanState(adminContext.data, input.data);

  if (!result.ok) {
    return jsonResponse(adminApiFailure(result.error.code));
  }

  return jsonResponse({
    ok: true,
    type: "admin_user_plan",
    result: result.data,
  });
};
