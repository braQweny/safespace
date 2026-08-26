import { describe, expect, it, vi } from "vitest";
import {
  checkSessionRateLimit,
  getRateLimitKey,
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
