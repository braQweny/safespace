import type { APIRoute } from "astro";
import { getAuthErrorRedirect } from "@/lib/auth-errors";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext } from "@/lib/operational-visibility/request-context";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const operationalContext = await buildOperationalRequestContext(context);
  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      logOperationalEvent(
        {
          event: "auth.signout",
          level: "warn",
          outcome: "failure",
          status: 303,
          reasonCode: "signout_failed",
          provider: "supabase",
        },
        operationalContext,
      );

      return context.redirect(getAuthErrorRedirect("/auth/signin", "signout_failed"), 303);
    }
  } else {
    logOperationalEvent(
      {
        event: "auth.signout",
        level: "error",
        outcome: "failure",
        status: 303,
        reasonCode: "auth_not_configured",
        provider: "supabase",
      },
      operationalContext,
    );
  }

  logOperationalEvent(
    {
      event: "auth.signout",
      level: "info",
      outcome: "success",
      status: 303,
      provider: "supabase",
    },
    operationalContext,
  );

  return context.redirect("/", 303);
};
