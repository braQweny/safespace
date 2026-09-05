import type { APIRoute } from "astro";
import { billingUserAction } from "@/lib/billing/routes";
export const prerender = false;
export const POST: APIRoute = (context) => billingUserAction(context, "portal");
