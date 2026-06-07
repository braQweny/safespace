import { defineMiddleware } from "astro:middleware";
import { AUTHENTICATED_REDIRECT_PATH } from "@/lib/auth-redirect";
import {
  createOperationalRequestId,
  withOperationalRequestIdHeader,
} from "@/lib/operational-visibility/request-context";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = [AUTHENTICATED_REDIRECT_PATH, "/account"] as const;

function isProtectedRoute(pathname: string) {
  return PROTECTED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const requestId = createOperationalRequestId();
  context.locals.requestId = requestId;

  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (isProtectedRoute(context.url.pathname)) {
    if (!context.locals.user) {
      return withOperationalRequestIdHeader(context.redirect("/auth/signin"), requestId);
    }
  }

  const response = await next();
  return withOperationalRequestIdHeader(response, requestId);
});
