import type { APIRoute } from "astro";
import { createAuthRoute } from "@/lib/auth-route";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const route = await createAuthRoute(context, "auth.signout");

  if (route.supabase) {
    const { error } = await route.supabase.auth.signOut({ scope: "local" });

    if (error) {
      return route.failureRedirect("/auth/signin", "signout_failed", { provider: "supabase" });
    }
  } else {
    route.logFailure("auth_not_configured", { level: "error", provider: "supabase" });
  }

  return route.successRedirect("/");
};
