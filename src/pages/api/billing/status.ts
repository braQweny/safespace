import type { APIRoute } from "astro";
import { getOwnBillingStatus } from "@/lib/billing/status";
export const prerender = false;
export const GET: APIRoute = async (context) => {
  const result = await getOwnBillingStatus(context);
  return Response.json(result, { status: result.ok ? 200 : context.locals.user ? 503 : 401 });
};
