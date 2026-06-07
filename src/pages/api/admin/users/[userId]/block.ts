import type { APIRoute } from "astro";
import { getAdminContext } from "@/lib/admin/auth";
import { adminApiFailure, getAdminApiFailureStatus, type AdminUserBlockResponse } from "@/lib/admin/contracts";
import { parseAdminUserBlockInput, setAdminUserBlockState } from "@/lib/admin/users";

function jsonResponse(body: AdminUserBlockResponse) {
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

export const POST: APIRoute = async (context) => {
  const adminContext = await getAdminContext(context);

  if (!adminContext.ok) {
    return jsonResponse(adminApiFailure(adminContext.error.code));
  }

  const input = parseAdminUserBlockInput(context.params.userId, await parseBody(context.request));

  if (!input.ok) {
    return jsonResponse(adminApiFailure(input.error.code));
  }

  const result = await setAdminUserBlockState(adminContext.data, input.data);

  if (!result.ok) {
    return jsonResponse(adminApiFailure(result.error.code));
  }

  return jsonResponse({
    ok: true,
    type: "admin_user_block",
    result: result.data,
  });
};
