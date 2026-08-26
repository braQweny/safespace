/**
 * Per-user rate limiting for AI-backed session endpoints, backed by the
 * Cloudflare Workers rate limiting binding (`SESSION_RATE_LIMITER` in
 * wrangler.jsonc).
 *
 * Local development may opt into fail-open because the binding exists only in
 * the Workers runtime. Production callers use fail-closed so a missing or
 * failing binding cannot turn provider-backed endpoints into an unbounded
 * abuse/cost path.
 */

export interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

const RATE_LIMITED_API_PATHS = new Set([
  "/api/session/message",
  "/api/session/start",
  "/api/session/start-next",
  "/api/session/transcribe",
]);

// Summary generation hits the AI provider too, but lives under a dynamic
// `[sessionId]` segment, so it is matched by prefix instead of exact path.
const RATE_LIMITED_API_PATH_PREFIXES = ["/api/session/summary/"];

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
