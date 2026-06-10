/**
 * Per-user rate limiting for AI-backed session endpoints, backed by the
 * Cloudflare Workers rate limiting binding (`SESSION_RATE_LIMITER` in
 * wrangler.jsonc).
 *
 * Fail-open by design: the binding exists only in the Workers runtime, so
 * local dev (`npm run dev`) and tests run without limiting instead of
 * breaking. The limiter protects provider cost and abuse, not correctness —
 * quota-grade guarantees stay in the database (trial claim constraint).
 */

export interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

const RATE_LIMITED_API_PATHS = new Set(["/api/session/message", "/api/session/start", "/api/session/start-next"]);

export type RateLimitVerdict = "allowed" | "limited";

export function isRateLimitedApiRequest(method: string, pathname: string) {
  return method === "POST" && RATE_LIMITED_API_PATHS.has(pathname);
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
): Promise<RateLimitVerdict> {
  if (!limiter) {
    return "allowed";
  }

  try {
    const { success } = await limiter.limit({ key });
    return success ? "allowed" : "limited";
  } catch {
    // A failing limiter must not take the product down with it.
    return "allowed";
  }
}
