import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";
import { ok, sessionDataError, type SessionDataResult } from "./errors";
import type { SessionDataContext } from "./types";

export interface SessionDataRouteContext {
  request: Request;
  cookies: AstroCookies;
  locals: App.Locals;
}

export function getSessionDataContext(context: SessionDataRouteContext): SessionDataResult<SessionDataContext> {
  const supabase = createClient(context.request.headers, context.cookies);

  if (!supabase) {
    return sessionDataError("session_data_unavailable");
  }

  const { user } = context.locals;

  if (!user) {
    return sessionDataError("missing_auth");
  }

  return ok({
    supabase,
    user: {
      id: user.id,
    },
  });
}
