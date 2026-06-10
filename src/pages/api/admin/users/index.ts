import type { APIRoute } from "astro";
import { getAdminContext } from "@/lib/admin/auth";
import { adminApiFailure, getAdminApiFailureStatus, type AdminUsersResponse } from "@/lib/admin/contracts";
import { listAdminUsers, parseAdminUserListFilters } from "@/lib/admin/users";

export const prerender = false;

function jsonResponse(body: AdminUsersResponse) {
  const status = body.ok ? 200 : getAdminApiFailureStatus(body.code);
  return Response.json(body, { status });
}

export const GET: APIRoute = async (context) => {
  const adminContext = await getAdminContext(context);

  if (!adminContext.ok) {
    return jsonResponse(adminApiFailure(adminContext.error.code));
  }

  const filters = parseAdminUserListFilters(context.url.searchParams);

  if (!filters.ok) {
    return jsonResponse(adminApiFailure(filters.error.code));
  }

  const result = await listAdminUsers(adminContext.data, filters.data);

  if (!result.ok) {
    return jsonResponse(adminApiFailure(result.error.code));
  }

  return jsonResponse({
    ok: true,
    type: "admin_users",
    result: result.data,
  });
};
