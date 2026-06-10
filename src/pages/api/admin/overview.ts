import type { APIRoute } from "astro";
import { getAdminContext } from "@/lib/admin/auth";
import { adminApiFailure, getAdminApiFailureStatus, type AdminOverviewResponse } from "@/lib/admin/contracts";
import { readAdminOverviewMetrics } from "@/lib/admin/aggregates";

export const prerender = false;

function jsonResponse(body: AdminOverviewResponse) {
  const status = body.ok ? 200 : getAdminApiFailureStatus(body.code);
  return Response.json(body, { status });
}

export const GET: APIRoute = async (context) => {
  const adminContext = await getAdminContext(context);

  if (!adminContext.ok) {
    return jsonResponse(adminApiFailure(adminContext.error.code));
  }

  const metrics = await readAdminOverviewMetrics(adminContext.data);

  if (!metrics.ok) {
    return jsonResponse(adminApiFailure(metrics.error.code));
  }

  return jsonResponse({
    ok: true,
    type: "admin_overview",
    metrics: metrics.data,
  });
};
