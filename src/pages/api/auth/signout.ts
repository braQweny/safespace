import type { APIRoute } from "astro";
import { getAuthErrorRedirect } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (supabase) {
    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      return context.redirect(getAuthErrorRedirect("/auth/signin", "signout_failed"), 303);
    }
  }

  return context.redirect("/", 303);
};
