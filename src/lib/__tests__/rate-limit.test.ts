import { describe, expect, it, vi } from "vitest";
import {
  checkAuthRateLimit,
  checkSessionRateLimit,
  getAuthRateLimitRedirect,
  getRateLimitKey,
  isAuthRateLimitedRequest,
  isRateLimitedApiRequest,
  type RateLimiterBinding,
} from "../rate-limit";

function requestWithHeaders(headers: Record<string, string> = {}) {
  return new Request("https://safespace.example/api/session/message", {
    method: "POST",
    headers,
  });
}

describe("isRateLimitedApiRequest", () => {
  it("matches POST requests to AI-backed session endpoints", () => {
    expect(isRateLimitedApiRequest("POST", "/api/session/message")).toBe(true);
    expect(isRateLimitedApiRequest("POST", "/api/session/start")).toBe(true);
    expect(isRateLimitedApiRequest("POST", "/api/session/start-next")).toBe(true);
    expect(isRateLimitedApiRequest("POST", "/api/session/prepare-memory")).toBe(true);
    expect(isRateLimitedApiRequest("POST", "/api/session/prepare-people")).toBe(true);
    expect(isRateLimitedApiRequest("POST", "/api/session/transcribe")).toBe(true);
  });

  it("matches summary generation under its dynamic session segment", () => {
    expect(isRateLimitedApiRequest("POST", "/api/session/summary/123e4567-e89b-42d3-a456-426614174000")).toBe(true);
  });

  it("ignores other methods and routes", () => {
    expect(isRateLimitedApiRequest("GET", "/api/session/message")).toBe(false);
    expect(isRateLimitedApiRequest("POST", "/api/session/history")).toBe(false);
    expect(isRateLimitedApiRequest("POST", "/dashboard/session")).toBe(false);
    expect(isRateLimitedApiRequest("PATCH", "/api/session/summary/123e4567-e89b-42d3-a456-426614174000")).toBe(false);
  });

  it("leaves the auth forms to the auth limiter", () => {
    expect(isRateLimitedApiRequest("POST", "/api/auth/signin")).toBe(false);
  });
});

describe("isAuthRateLimitedRequest", () => {
  it("matches POSTs to the credential-handling auth forms", () => {
    for (const pathname of [
      "/api/auth/signin",
      "/api/auth/signup",
      "/api/auth/reset-password",
      "/api/auth/resend-confirmation",
      "/api/auth/password",
    ]) {
      expect(isAuthRateLimitedRequest("POST", pathname)).toBe(true);
    }
  });

  it("does not throttle sign-out, the OAuth start, other methods or look-alike paths", () => {
    expect(isAuthRateLimitedRequest("POST", "/api/auth/signout")).toBe(false);
    expect(isAuthRateLimitedRequest("POST", "/api/auth/google")).toBe(false);
    expect(isAuthRateLimitedRequest("GET", "/api/auth/signin")).toBe(false);
    expect(isAuthRateLimitedRequest("POST", "/api/auth/signin/")).toBe(false);
    expect(isAuthRateLimitedRequest("POST", "/auth/signin")).toBe(false);
    expect(isAuthRateLimitedRequest("POST", "/api/session/message")).toBe(false);
    // Prototype names must not match through the lookup table.
    expect(isAuthRateLimitedRequest("POST", "constructor")).toBe(false);
    expect(isAuthRateLimitedRequest("POST", "__proto__")).toBe(false);
  });
});

describe("getAuthRateLimitRedirect", () => {
  it("maps every throttled API path back to its own page with the rate_limited copy", () => {
    expect(getAuthRateLimitRedirect("/api/auth/signin")).toBe("/auth/signin?error=rate_limited");
    expect(getAuthRateLimitRedirect("/api/auth/signup")).toBe("/auth/signup?error=rate_limited");
    expect(getAuthRateLimitRedirect("/api/auth/reset-password")).toBe("/auth/forgot-password?error=rate_limited");
    expect(getAuthRateLimitRedirect("/api/auth/resend-confirmation")).toBe("/auth/confirm-email?error=rate_limited");
    expect(getAuthRateLimitRedirect("/api/auth/password")).toBe("/account/security?error=rate_limited");
  });

  it("knows no redirect for paths outside the allowlist", () => {
    expect(getAuthRateLimitRedirect("/api/auth/signout")).toBeNull();
    expect(getAuthRateLimitRedirect("/api/auth/google")).toBeNull();
    expect(getAuthRateLimitRedirect("/api/session/message")).toBeNull();
    expect(getAuthRateLimitRedirect("toString")).toBeNull();
  });
});

describe("getRateLimitKey", () => {
  it("prefers the authenticated user id", () => {
    expect(getRateLimitKey("user-1", requestWithHeaders({ "cf-connecting-ip": "203.0.113.7" }))).toBe("user:user-1");
  });

  it("falls back to the client ip for unauthenticated requests", () => {
    expect(getRateLimitKey(null, requestWithHeaders({ "cf-connecting-ip": "203.0.113.7" }))).toBe("ip:203.0.113.7");
  });

  it("uses a shared anonymous bucket when no ip is available", () => {
    expect(getRateLimitKey(null, requestWithHeaders())).toBe("anonymous");
  });
});

describe("checkSessionRateLimit", () => {
  it("allows the request when the limiter approves", async () => {
    const limit = vi.fn(() => Promise.resolve({ success: true }));
    const limiter: RateLimiterBinding = { limit };

    await expect(checkSessionRateLimit(limiter, "user:user-1")).resolves.toBe("allowed");
    expect(limit).toHaveBeenCalledWith({ key: "user:user-1" });
  });

  it("limits the request when the limiter rejects", async () => {
    const limiter: RateLimiterBinding = {
      limit: vi.fn(() => Promise.resolve({ success: false })),
    };

    await expect(checkSessionRateLimit(limiter, "user:user-1")).resolves.toBe("limited");
  });

  it("fails open when the binding is missing (local dev, tests)", async () => {
    await expect(checkSessionRateLimit(undefined, "user:user-1")).resolves.toBe("allowed");
  });

  it("fails closed when the production caller requires an abuse boundary", async () => {
    await expect(checkSessionRateLimit(undefined, "user:user-1", { failClosed: true })).resolves.toBe("unavailable");

    const limiter: RateLimiterBinding = {
      limit: vi.fn(() => Promise.reject(new Error("binding unavailable"))),
    };

    await expect(checkSessionRateLimit(limiter, "user:user-1", { failClosed: true })).resolves.toBe("unavailable");
  });

  it("fails open when the limiter throws", async () => {
    const limiter: RateLimiterBinding = {
      limit: vi.fn(() => Promise.reject(new Error("binding unavailable"))),
    };

    await expect(checkSessionRateLimit(limiter, "user:user-1")).resolves.toBe("allowed");
  });
});

describe("checkAuthRateLimit", () => {
  it("passes the ip key to the binding and honours its verdict", async () => {
    const limit = vi.fn(() => Promise.resolve({ success: false }));

    await expect(checkAuthRateLimit({ limit }, "ip:203.0.113.7")).resolves.toBe("limited");
    expect(limit).toHaveBeenCalledWith({ key: "ip:203.0.113.7" });

    limit.mockResolvedValueOnce({ success: true });
    await expect(checkAuthRateLimit({ limit }, "ip:203.0.113.7")).resolves.toBe("allowed");
  });

  it("always fails open: a missing or failing limiter must not lock users out of signing in", async () => {
    await expect(checkAuthRateLimit(undefined, "ip:203.0.113.7")).resolves.toBe("allowed");

    const limiter: RateLimiterBinding = {
      limit: vi.fn(() => Promise.reject(new Error("binding unavailable"))),
    };

    await expect(checkAuthRateLimit(limiter, "ip:203.0.113.7")).resolves.toBe("allowed");
  });
});
