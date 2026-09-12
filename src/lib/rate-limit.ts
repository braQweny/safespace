/**
 * Rate limiting backed by the Cloudflare Workers rate limiting bindings
 * declared in wrangler.jsonc. Two independent budgets:
 *
 * - `SESSION_RATE_LIMITER` — per-user cap on AI-backed session endpoints.
 *   Local development may opt into fail-open because the binding exists only
 *   in the Workers runtime. Production callers use fail-closed so a missing or
 *   failing binding cannot turn provider-backed endpoints into an unbounded
 *   abuse/cost path.
 * - `VOICE_RATE_LIMITER` — per-user cap on the voice heartbeat/drain endpoints
 *   under `/api/session/voice/` (a few calls a minute per conversation).
 *   `connect` creates a paid provider session, so it stays under the stricter
 *   `SESSION_RATE_LIMITER`. Same fail-closed rule in production as the session
 *   limiter: a broken binding must not turn the observer drain into an
 *   unbounded loop.
 * - `AUTH_RATE_LIMITER` — per-IP cap on the credential-handling auth forms
 *   (sign-in, sign-up, password reset, confirmation resend, password change).
 *   Always fail-open, production included: an outage of the limiter must not
 *   lock every user out of signing in, and Supabase enforces its own auth
 *   rate limits behind us, so the worst case is the pre-existing behaviour.
 */
import { getAuthErrorRedirect } from "@/lib/auth-errors";

export interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

const RATE_LIMITED_API_PATHS = new Set([
  "/api/session/message",
  "/api/session/start",
  "/api/session/start-next",
  "/api/session/prepare-memory",
  "/api/session/prepare-people",
  "/api/session/transcribe",
  "/api/session/voice/connect",
]);

// Heartbeat (and any later voice endpoint that does not create a provider
// session) has its own, looser budget: one call every 20 s per conversation.
const VOICE_RATE_LIMITED_API_PATH_PREFIX = "/api/session/voice/";

// Summary generation hits the AI provider too, but lives under a dynamic
// `[sessionId]` segment, so it is matched by prefix instead of exact path.
const RATE_LIMITED_API_PATH_PREFIXES = ["/api/session/summary/"];

/**
 * Form-based auth endpoints and the page each one redirects back to when the
 * limiter says no. These routes answer with `?error=<code>` redirects rather
 * than JSON, so the user reads Polish copy instead of a raw 429. The target is
 * taken from this allowlist — never from `Referer`. `signout` (no credential
 * to guess) and `google` (OAuth start, no secret in the form) are deliberately
 * not listed.
 */
const AUTH_RATE_LIMITED_ROUTES: Readonly<Record<string, string>> = {
  "/api/auth/signin": "/auth/signin",
  "/api/auth/signup": "/auth/signup",
  "/api/auth/reset-password": "/auth/forgot-password",
  "/api/auth/resend-confirmation": "/auth/confirm-email",
  "/api/auth/password": "/account/security",
};

export type RateLimitVerdict = "allowed" | "limited" | "unavailable";

interface RateLimitOptions {
  failClosed?: boolean;
}

export function isRateLimitedApiRequest(method: string, pathname: string) {
  if (method !== "POST") {
    return false;
  }

  return (
    RATE_LIMITED_API_PATHS.has(pathname) || RATE_LIMITED_API_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export function isVoiceRateLimitedApiRequest(method: string, pathname: string) {
  return (
    method === "POST" &&
    pathname.startsWith(VOICE_RATE_LIMITED_API_PATH_PREFIX) &&
    !RATE_LIMITED_API_PATHS.has(pathname)
  );
}

export function isAuthRateLimitedRequest(method: string, pathname: string) {
  return method === "POST" && Object.prototype.hasOwnProperty.call(AUTH_RATE_LIMITED_ROUTES, pathname);
}

/**
 * Where an over-limit auth POST is sent so the page can show the
 * `rate_limited` copy; `null` for paths outside the allowlist.
 */
export function getAuthRateLimitRedirect(pathname: string) {
  if (!Object.prototype.hasOwnProperty.call(AUTH_RATE_LIMITED_ROUTES, pathname)) {
    return null;
  }

  return getAuthErrorRedirect(AUTH_RATE_LIMITED_ROUTES[pathname], "rate_limited");
}

export function getRateLimitKey(userId: string | null, request: Request) {
  if (userId) {
    return `user:${userId}`;
  }

  const clientIp = request.headers.get("cf-connecting-ip")?.trim();
  return clientIp ? `ip:${clientIp}` : "anonymous";
}

export async function checkSessionRateLimit(
  limiter: RateLimiterBinding | undefined,
  key: string,
  options: RateLimitOptions = {},
): Promise<RateLimitVerdict> {
  if (!limiter) {
    return options.failClosed ? "unavailable" : "allowed";
  }

  try {
    const { success } = await limiter.limit({ key });
    return success ? "allowed" : "limited";
  } catch {
    return options.failClosed ? "unavailable" : "allowed";
  }
}

/**
 * Auth limiter verdict. Never `unavailable`: a missing or failing binding
 * lets the request through (see the module comment for why).
 */
export async function checkAuthRateLimit(
  limiter: RateLimiterBinding | undefined,
  key: string,
): Promise<Exclude<RateLimitVerdict, "unavailable">> {
  const verdict = await checkSessionRateLimit(limiter, key, { failClosed: false });
  return verdict === "limited" ? "limited" : "allowed";
}
