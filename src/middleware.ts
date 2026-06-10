import { defineMiddleware } from "astro:middleware";
import { readAccountAccessState } from "@/lib/admin/account-access";
import { AUTHENTICATED_REDIRECT_PATH } from "@/lib/auth-redirect";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import {
  createOperationalRequestId,
  withOperationalRequestIdHeader,
} from "@/lib/operational-visibility/request-context";
import { checkSessionRateLimit, getRateLimitKey, isRateLimitedApiRequest } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase";

const BLOCKED_ACCOUNT_PATH = "/account/blocked";
const PROTECTED_ROUTES = [AUTHENTICATED_REDIRECT_PATH, "/account", "/admin"] as const;

// Generous compared to the largest accepted payload (a 3000-char session
// message); blocks oversized bodies before any JSON parsing happens.
const API_BODY_LIMIT_BYTES = 32 * 1024;
const API_BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

// Baseline browser hardening for every response. A full Content-Security-Policy
// is intentionally absent: Astro islands rely on inline hydration scripts, so a
// meaningful CSP needs nonce plumbing rather than a blanket header here.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function withSecurityHeaders(response: Response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }

  return response;
}

function isApiBodyTooLarge(request: Request, pathname: string) {
  if (!pathname.startsWith("/api/") || !API_BODY_METHODS.has(request.method)) {
    return false;
  }

  const contentLength = Number(request.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength > API_BODY_LIMIT_BYTES;
}

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

  if (isApiBodyTooLarge(context.request, context.url.pathname)) {
    logOperationalEvent(
      {
        event: "route.request_rejected",
        level: "warn",
        route: context.url.pathname,
        method: context.request.method,
        outcome: "blocked",
        status: 413,
        reasonCode: "payload_too_large",
      },
      { requestId },
    );

    return withSecurityHeaders(
      withOperationalRequestIdHeader(
        Response.json({ ok: false, code: "payload_too_large" }, { status: 413 }),
        requestId,
      ),
    );
  }

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

  if (isRateLimitedApiRequest(context.request.method, context.url.pathname)) {
    const limiter = context.locals.runtime?.env?.SESSION_RATE_LIMITER;
    const key = getRateLimitKey(context.locals.user?.id ?? null, context.request);
    const verdict = await checkSessionRateLimit(limiter, key);

    if (verdict === "limited") {
      logOperationalEvent(
        {
          event: "route.request_rejected",
          level: "warn",
          route: context.url.pathname,
          method: context.request.method,
          outcome: "blocked",
          status: 429,
          reasonCode: "rate_limited",
        },
        { requestId },
      );

      return withSecurityHeaders(
        withOperationalRequestIdHeader(
          Response.json({ ok: false, code: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } }),
          requestId,
        ),
      );
    }
  }

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

      return withSecurityHeaders(withOperationalRequestIdHeader(context.redirect("/auth/signin"), requestId));
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

        return withSecurityHeaders(
          withOperationalRequestIdHeader(context.redirect(`${BLOCKED_ACCOUNT_PATH}?state=unavailable`), requestId),
        );
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

        return withSecurityHeaders(withOperationalRequestIdHeader(context.redirect(BLOCKED_ACCOUNT_PATH), requestId));
      }
    }
  }

  const response = await next();
  return withSecurityHeaders(withOperationalRequestIdHeader(response, requestId));
});
