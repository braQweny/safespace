import { defineMiddleware } from "astro:middleware";
import { readAccountAccessState } from "@/lib/admin/account-access";
import { AUTHENTICATED_REDIRECT_PATH } from "@/lib/auth-redirect";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import {
  createOperationalRequestId,
  withOperationalRequestIdHeader,
} from "@/lib/operational-visibility/request-context";
import { createClient } from "@/lib/supabase";

const BLOCKED_ACCOUNT_PATH = "/account/blocked";
const PROTECTED_ROUTES = [AUTHENTICATED_REDIRECT_PATH, "/account", "/admin"] as const;

function isProtectedRoute(pathname: string) {
  return PROTECTED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function getProtectedRouteBucket(pathname: string) {
  return PROTECTED_ROUTES.find((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function shouldCheckAccountAccess(pathname: string) {
  return isProtectedRoute(pathname) && pathname !== BLOCKED_ACCOUNT_PATH;
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
  context.locals.accountAccess = null;

  if (isProtectedRoute(context.url.pathname)) {
    if (!context.locals.user) {
      logOperationalEvent(
        {
          event: "route.protected_redirect",
          level: "warn",
          route: getProtectedRouteBucket(context.url.pathname),
          method: context.request.method,
          outcome: "redirected",
          status: 302,
          reasonCode: "missing_auth",
        },
        { requestId },
      );

      return withOperationalRequestIdHeader(context.redirect("/auth/signin"), requestId);
    }

    if (shouldCheckAccountAccess(context.url.pathname)) {
      const accountAccess = await readAccountAccessState(context, supabase);

      if (!accountAccess.ok) {
        logOperationalEvent(
          {
            event: "route.protected_redirect",
            level: "warn",
            route: getProtectedRouteBucket(context.url.pathname),
            method: context.request.method,
            outcome: "redirected",
            status: 302,
            reasonCode: accountAccess.error.code,
          },
          { requestId },
        );

        return withOperationalRequestIdHeader(context.redirect(`${BLOCKED_ACCOUNT_PATH}?state=unavailable`), requestId);
      }

      context.locals.accountAccess = accountAccess.data;

      if (accountAccess.data.status === "blocked") {
        logOperationalEvent(
          {
            event: "route.protected_redirect",
            level: "warn",
            route: getProtectedRouteBucket(context.url.pathname),
            method: context.request.method,
            outcome: "redirected",
            status: 302,
            reasonCode: "account_blocked",
          },
          { requestId },
        );

        return withOperationalRequestIdHeader(context.redirect(BLOCKED_ACCOUNT_PATH), requestId);
      }
    }
  }

  const response = await next();
  return withOperationalRequestIdHeader(response, requestId);
});
