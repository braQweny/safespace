import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountAccessState } from "@/lib/admin/types";
import { LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { TIME_ZONE_COOKIE_NAME } from "@/lib/i18n/time-zone";
import { OPERATIONAL_REQUEST_ID_HEADER } from "@/lib/operational-visibility/request-context";
import type { RateLimiterBinding } from "@/lib/rate-limit";

const { createClient, getUser, readAccountAccessState, logOperationalEvent } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  readAccountAccessState: vi.fn(),
  logOperationalEvent: vi.fn(),
}));

type BindingName = "AUTH_RATE_LIMITER" | "SESSION_RATE_LIMITER" | "VOICE_RATE_LIMITER";

const workerEnv: Partial<Record<BindingName, RateLimiterBinding>> = {};

vi.mock("cloudflare:workers", () => ({ env: workerEnv }));
vi.mock("astro:middleware", () => ({ defineMiddleware: <T>(handler: T) => handler }));
vi.mock("astro:env/server", () => ({ OPERATIONAL_LOG_HASH_SECRET: undefined, getSecret: () => undefined }));
vi.mock("@/lib/supabase", () => ({ createClient }));
vi.mock("@/lib/admin/account-access", () => ({ readAccountAccessState }));
vi.mock("@/lib/operational-visibility/logger", () => ({ logOperationalEvent }));

const { onRequest } = await import("@/middleware");

const USER = { id: "11111111-1111-4111-8111-111111111111" };
const CLIENT_IP = "203.0.113.7";

function limiter() {
  return { limit: vi.fn(() => Promise.resolve({ success: true })) };
}

let authLimiter = limiter();
let sessionLimiter = limiter();
let voiceLimiter = limiter();

function breakBinding(name: BindingName, failure: "missing" | "throwing") {
  workerEnv[name] =
    failure === "missing" ? undefined : { limit: () => Promise.reject(new Error("binding unavailable")) };
}

function accessState(status: AccountAccessState["status"]): AccountAccessState {
  return {
    userId: USER.id,
    status,
    blockedAt: status === "blocked" ? "2026-09-01T00:00:00.000Z" : null,
    blockReasonCode: status === "blocked" ? "safety_risk" : null,
    plan: "free",
    premiumGrantedAt: null,
  };
}

interface RequestOptions {
  method?: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}

function createContext(path: string, { method = "GET", body = null, headers = {}, cookies = {} }: RequestOptions = {}) {
  const url = new URL(path, "https://safespace.test");
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: { "cf-connecting-ip": CLIENT_IP, ...headers },
  };

  if (body !== null) {
    init.body = body;
    init.duplex = "half";
  }

  const locals: Partial<App.Locals> = {};
  const context = {
    url,
    request: new Request(url, init),
    cookies: {
      get: vi.fn((name: string) => (name in cookies ? { value: cookies[name] } : undefined)),
      set: vi.fn(),
    },
    locals,
    redirect: (target: string, status = 302) => new Response(null, { status, headers: { Location: target } }),
  };

  return { context: context as unknown as APIContext, locals };
}

// A body with no declared length (a chunked upload): the guard must refuse it
// before anything reads it.
function streamedBody() {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("{}"));
      controller.close();
    },
  });
}

function jsonPost(body = "{}"): RequestOptions {
  return {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "content-length": String(body.length) },
  };
}

function formPost(): RequestOptions {
  const body = "email=a%40b.test&password=x";
  return {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded", "content-length": String(body.length) },
  };
}

function createNext(response?: () => Response) {
  return vi.fn(() => Promise.resolve(response ? response() : new Response("ok")));
}

async function run(context: APIContext, next: ReturnType<typeof createNext> = createNext()) {
  const response = await onRequest(context, next);

  if (!(response instanceof Response)) {
    throw new Error("middleware returned no response");
  }

  return response;
}

async function jsonBody(response: Response) {
  return (await response.json()) as { ok: boolean; code: string };
}

describe("middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authLimiter = limiter();
    sessionLimiter = limiter();
    voiceLimiter = limiter();
    workerEnv.AUTH_RATE_LIMITER = authLimiter;
    workerEnv.SESSION_RATE_LIMITER = sessionLimiter;
    workerEnv.VOICE_RATE_LIMITER = voiceLimiter;
    getUser.mockResolvedValue({ data: { user: USER } });
    createClient.mockReturnValue({ auth: { getUser } });
    readAccountAccessState.mockResolvedValue({ ok: true, data: accessState("active") });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("request id and locale", () => {
    it("stamps the request id on locals and on the response header", async () => {
      const { context, locals } = createContext("/privacy");

      const response = await run(context);

      expect(locals.requestId).toEqual(expect.any(String));
      expect(locals.requestId).not.toBe("");
      expect(response.headers.get(OPERATIONAL_REQUEST_ID_HEADER)).toBe(locals.requestId);
    });

    it("defaults the locale to English without a cookie and ignores an unknown value", async () => {
      const missing = createContext("/privacy");
      const unknown = createContext("/privacy", { cookies: { [LOCALE_COOKIE_NAME]: "de" } });

      await run(missing.context);
      await run(unknown.context);

      expect(missing.locals.locale).toBe("en");
      expect(unknown.locals.locale).toBe("en");
    });

    it("resolves the cookie locale before an early rejection returns", async () => {
      const { context, locals } = createContext("/api/session/message", {
        method: "POST",
        body: streamedBody(),
        cookies: { [LOCALE_COOKIE_NAME]: "pl" },
      });

      const response = await run(context);

      expect(response.status).toBe(411);
      expect(locals.locale).toBe("pl");
      expect(response.headers.get(OPERATIONAL_REQUEST_ID_HEADER)).toBe(locals.requestId);
    });

    it("resolves the viewer's time zone from its cookie, falling back to Warsaw, and never logs it", async () => {
      const newYork = createContext("/privacy", { cookies: { [TIME_ZONE_COOKIE_NAME]: "America/New_York" } });
      const unknown = createContext("/privacy", { cookies: { [TIME_ZONE_COOKIE_NAME]: "Mars/Olympus_Mons" } });
      const missing = createContext("/privacy");
      const rejected = createContext("/api/session/message", {
        method: "POST",
        body: streamedBody(),
        cookies: { [TIME_ZONE_COOKIE_NAME]: "America/New_York" },
      });

      await run(newYork.context);
      await run(unknown.context);
      await run(missing.context);
      const response = await run(rejected.context);

      expect(newYork.locals.timeZone).toBe("America/New_York");
      expect(unknown.locals.timeZone).toBe("Europe/Warsaw");
      expect(missing.locals.timeZone).toBe("Europe/Warsaw");
      // Ustawiana przed każdym wczesnym `return`, tak jak język.
      expect(response.status).toBe(411);
      expect(rejected.locals.timeZone).toBe("America/New_York");
      expect(JSON.stringify(logOperationalEvent.mock.calls)).not.toContain("America/New_York");
    });
  });

  describe("body guard", () => {
    it.each(["/api/session/message", "/api/session/message/", "/api/session//message", "/api/session/%6Dessage"])(
      "refuses a body without Content-Length on %s with 411 before any other work",
      async (path) => {
        const next = createNext();
        const { context } = createContext(path, { method: "POST", body: streamedBody() });

        const response = await run(context, next);

        expect(response.status).toBe(411);
        expect(await jsonBody(response)).toEqual({ ok: false, code: "length_required" });
        expect(createClient).not.toHaveBeenCalled();
        expect(sessionLimiter.limit).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
      },
    );

    it.each(["/api/session/message", "/api/session/message/"])(
      "refuses an oversized declared body on %s with 413",
      async (path) => {
        const { context } = createContext(path, {
          method: "POST",
          body: "{}",
          headers: { "content-length": String(32 * 1024 + 1) },
        });

        const response = await run(context);

        expect(response.status).toBe(413);
        expect(await jsonBody(response)).toEqual({ ok: false, code: "payload_too_large" });
        expect(createClient).not.toHaveBeenCalled();
      },
    );

    it("keeps the transcription cap for the trailing-slash spelling", async () => {
      const { context } = createContext("/api/session/transcribe/", {
        method: "POST",
        body: "{}",
        headers: { "content-length": String(1024 * 1024) },
      });

      const response = await run(context);

      expect(response.status).not.toBe(413);
      expect(sessionLimiter.limit).toHaveBeenCalledTimes(1);
    });

    it("runs before the auth limiter on an auth form", async () => {
      const { context } = createContext("/api/auth/signin", {
        method: "POST",
        body: "x",
        headers: { "content-length": String(32 * 1024 + 1) },
      });

      const response = await run(context);

      expect(response.status).toBe(413);
      expect(authLimiter.limit).not.toHaveBeenCalled();
    });

    it("logs the rejection with the normalized route and never the raw spelling", async () => {
      const { context, locals } = createContext("/api/session/%6Dessage/", { method: "POST", body: streamedBody() });

      await run(context);

      expect(logOperationalEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "route.request_rejected",
          route: "/api/session/message",
          status: 411,
          reasonCode: "length_required",
        }),
        { requestId: locals.requestId },
      );
    });

    it("lets a bodiless POST through", async () => {
      const next = createNext();
      const { context } = createContext("/api/session/start", { method: "POST" });

      const response = await run(context, next);

      expect(response.status).toBe(200);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe("auth form limiter", () => {
    it.each([
      ["/api/auth/signin", "/auth/signin?error=rate_limited"],
      ["/api/auth/signin/", "/auth/signin?error=rate_limited"],
      ["/api/auth/signup", "/auth/signup?error=rate_limited"],
      ["/api/auth/reset-password", "/auth/forgot-password?error=rate_limited"],
      ["/api/auth/resend-confirmation", "/auth/confirm-email?error=rate_limited"],
      ["/api/auth/password", "/account/security?error=rate_limited"],
    ])("redirects an over-limit POST %s back to its form with 303", async (path, target) => {
      authLimiter.limit.mockResolvedValue({ success: false });
      const next = createNext();
      const { context } = createContext(path, formPost());

      const response = await run(context, next);

      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe(target);
      expect(createClient).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it("keys the budget by client IP, even for a signed-in visitor", async () => {
      const { context } = createContext("/api/auth/password", formPost());

      await run(context);

      expect(authLimiter.limit).toHaveBeenCalledWith({ key: `ip:${CLIENT_IP}` });
    });

    it("lets the form through when the limiter allows it", async () => {
      const next = createNext();
      const { context } = createContext("/api/auth/signin", formPost());

      const response = await run(context, next);

      expect(response.status).toBe(200);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it.each(["missing", "throwing"] as const)("fails open in production when the binding is %s", async (failure) => {
      vi.stubEnv("PROD", true);
      breakBinding("AUTH_RATE_LIMITER", failure);
      const next = createNext();
      const { context } = createContext("/api/auth/signin/", formPost());

      const response = await run(context, next);

      expect(response.status).toBe(200);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("does not throttle sign-out, the OAuth start or a GET of the form page", async () => {
      authLimiter.limit.mockResolvedValue({ success: false });

      for (const [path, options] of [
        ["/api/auth/signout", formPost()],
        ["/api/auth/google", formPost()],
        ["/api/auth/signin", { method: "GET" }],
      ] as const) {
        const response = await run(createContext(path, options).context);
        expect(response.status).toBe(200);
      }

      expect(authLimiter.limit).not.toHaveBeenCalled();
    });
  });

  describe("billing webhook", () => {
    it.each(["/api/billing/webhook", "/api/billing/webhook/"])(
      "skips Supabase and the body guard for %s",
      async (path) => {
        const next = createNext();
        const { context, locals } = createContext(path, {
          method: "POST",
          body: streamedBody(),
          headers: { "stripe-signature": "t=1,v1=fixture" },
        });

        const response = await run(context, next);

        expect(response.status).toBe(200);
        expect(next).toHaveBeenCalledTimes(1);
        expect(createClient).not.toHaveBeenCalled();
        expect(getUser).not.toHaveBeenCalled();
        expect(locals.user).toBeNull();
        expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
        expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      },
    );
  });

  describe("session limiter", () => {
    it.each([
      "/api/session/message",
      "/api/session/message/",
      "/api/session/%6Dessage",
      "/API/Session/Message",
      "/api/session/start",
      "/api/session/start-next",
      "/api/session/prepare-memory",
      "/api/session/prepare-people",
      "/api/session/transcribe",
      "/api/session/summary/22222222-2222-4222-8222-222222222222",
    ])("answers an over-limit POST %s with 429", async (path) => {
      sessionLimiter.limit.mockResolvedValue({ success: false });
      const next = createNext();
      const { context } = createContext(path, jsonPost());

      const response = await run(context, next);

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("60");
      expect(await jsonBody(response)).toEqual({ ok: false, code: "rate_limited" });
      expect(next).not.toHaveBeenCalled();
    });

    it("keys the budget by the resolved user", async () => {
      const { context } = createContext("/api/session/message/", jsonPost());

      await run(context);

      expect(getUser).toHaveBeenCalledTimes(1);
      expect(sessionLimiter.limit).toHaveBeenCalledWith({ key: `user:${USER.id}` });
    });

    it("falls back to the client IP without a user", async () => {
      getUser.mockResolvedValue({ data: { user: null } });
      const { context } = createContext("/api/session/message", jsonPost());

      await run(context);

      expect(sessionLimiter.limit).toHaveBeenCalledWith({ key: `ip:${CLIENT_IP}` });
    });

    it("does not throttle a GET on the same path", async () => {
      sessionLimiter.limit.mockResolvedValue({ success: false });
      const { context } = createContext("/api/session/message", { method: "GET" });

      const response = await run(context);

      expect(response.status).toBe(200);
      expect(sessionLimiter.limit).not.toHaveBeenCalled();
    });

    it.each(["missing", "throwing"] as const)(
      "fails closed with 503 in production when the binding is %s",
      async (failure) => {
        vi.stubEnv("PROD", true);
        breakBinding("SESSION_RATE_LIMITER", failure);
        const next = createNext();
        const { context } = createContext("/api/session/message/", jsonPost());

        const response = await run(context, next);

        expect(response.status).toBe(503);
        expect(await jsonBody(response)).toEqual({ ok: false, code: "rate_limiter_unavailable" });
        expect(next).not.toHaveBeenCalled();
        expect(logOperationalEvent).toHaveBeenCalledWith(
          expect.objectContaining({ level: "error", status: 503, reasonCode: "rate_limiter_unavailable" }),
          expect.anything(),
        );
      },
    );

    it.each(["missing", "throwing"] as const)(
      "fails open outside production when the binding is %s",
      async (failure) => {
        vi.stubEnv("PROD", false);
        breakBinding("SESSION_RATE_LIMITER", failure);
        const next = createNext();
        const { context } = createContext("/api/session/message", jsonPost());

        const response = await run(context, next);

        expect(response.status).toBe(200);
        expect(next).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe("voice limiters", () => {
    it.each(["/api/session/voice/heartbeat", "/api/session/voice/heartbeat/"])(
      "puts %s on the voice budget, not the session one",
      async (path) => {
        voiceLimiter.limit.mockResolvedValue({ success: false });
        const { context } = createContext(path, jsonPost());

        const response = await run(context);

        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("20");
        expect(voiceLimiter.limit).toHaveBeenCalledWith({ key: `user:${USER.id}` });
        expect(sessionLimiter.limit).not.toHaveBeenCalled();
      },
    );

    it.each(["/api/session/voice/connect", "/api/session/voice/connect/"])(
      "keeps %s on the strict session budget only",
      async (path) => {
        sessionLimiter.limit.mockResolvedValue({ success: false });
        const { context } = createContext(path, jsonPost());

        const response = await run(context);

        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("60");
        expect(voiceLimiter.limit).not.toHaveBeenCalled();
      },
    );

    it("fails the heartbeat closed in production without its binding", async () => {
      vi.stubEnv("PROD", true);
      breakBinding("VOICE_RATE_LIMITER", "missing");
      const { context } = createContext("/api/session/voice/heartbeat", jsonPost());

      const response = await run(context);

      expect(response.status).toBe(503);
      expect(await jsonBody(response)).toEqual({ ok: false, code: "rate_limiter_unavailable" });
    });

    it("fails the heartbeat open outside production without its binding", async () => {
      vi.stubEnv("PROD", false);
      breakBinding("VOICE_RATE_LIMITER", "missing");
      const next = createNext();
      const { context } = createContext("/api/session/voice/heartbeat", jsonPost());

      const response = await run(context, next);

      expect(response.status).toBe(200);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe("protected routes", () => {
    it.each(["/dashboard", "/dashboard/", "/dashboard/session", "/account/security", "/admin", "/admin/users"])(
      "redirects an anonymous visitor on %s to sign-in",
      async (path) => {
        getUser.mockResolvedValue({ data: { user: null } });
        const next = createNext();
        const { context } = createContext(path);

        const response = await run(context, next);

        expect(response.status).toBe(302);
        expect(response.headers.get("Location")).toBe("/auth/signin");
        expect(readAccountAccessState).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
      },
    );

    it("treats a missing Supabase configuration as signed out", async () => {
      createClient.mockReturnValue(null);
      const { context, locals } = createContext("/dashboard");

      const response = await run(context);

      expect(locals.user).toBeNull();
      expect(response.headers.get("Location")).toBe("/auth/signin");
    });

    it("sends a blocked account to the blocked page", async () => {
      readAccountAccessState.mockResolvedValue({ ok: true, data: accessState("blocked") });
      const next = createNext();
      const { context, locals } = createContext("/dashboard");

      const response = await run(context, next);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/account/blocked");
      expect(locals.accountAccess).toEqual(accessState("blocked"));
      expect(next).not.toHaveBeenCalled();
    });

    it("sends an unreadable access state to the unavailable variant, never a false block", async () => {
      readAccountAccessState.mockResolvedValue({ ok: false, error: { code: "account_access_unavailable" } });
      const { context, locals } = createContext("/account/security");

      const response = await run(context);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/account/blocked?state=unavailable");
      expect(locals.accountAccess).toBeNull();
    });

    it("passes an active account through with its access state on locals", async () => {
      const next = createNext();
      const { context, locals } = createContext("/dashboard/memory");

      const response = await run(context, next);

      expect(response.status).toBe(200);
      expect(next).toHaveBeenCalledTimes(1);
      expect(locals.user).toEqual(USER);
      expect(locals.accountAccess).toEqual(accessState("active"));
      expect(readAccountAccessState).toHaveBeenCalledWith(context, expect.objectContaining({ auth: { getUser } }));
    });

    it.each(["/account/delete", "/account/billing", "/account/blocked", "/account/delete/"])(
      "lets a blocked account reach %s without the block check",
      async (path) => {
        readAccountAccessState.mockResolvedValue({ ok: true, data: accessState("blocked") });
        const next = createNext();
        const { context, locals } = createContext(path);

        const response = await run(context, next);

        expect(response.status).toBe(200);
        expect(next).toHaveBeenCalledTimes(1);
        expect(readAccountAccessState).not.toHaveBeenCalled();
        expect(locals.accountAccess).toBeNull();
      },
    );

    it("still requires sign-in on the pages that skip the block check", async () => {
      getUser.mockResolvedValue({ data: { user: null } });
      const { context } = createContext("/account/delete");

      const response = await run(context);

      expect(response.headers.get("Location")).toBe("/auth/signin");
    });

    it("leaves public pages alone for an anonymous visitor", async () => {
      getUser.mockResolvedValue({ data: { user: null } });
      const next = createNext();

      for (const path of ["/", "/privacy", "/dashboards", "/auth/signin"]) {
        const response = await run(createContext(path).context, next);
        expect(response.status).toBe(200);
      }

      expect(next).toHaveBeenCalledTimes(4);
      expect(readAccountAccessState).not.toHaveBeenCalled();
    });
  });

  describe("response headers", () => {
    it("stamps the baseline security headers and appends Vary: Cookie", async () => {
      const next = createNext(() => new Response("ok", { headers: { Vary: "Accept-Encoding" } }));
      const { context } = createContext("/privacy");

      const response = await run(context, next);

      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(response.headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
      expect(response.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(self), geolocation=()");
      expect(response.headers.get("Vary")).toBe("Accept-Encoding, Cookie");
      // The CSP comes from Astro's build, never from the middleware.
      expect(response.headers.get("Content-Security-Policy")).toBeNull();
    });

    it("keeps public pages cacheable", async () => {
      const response = await run(createContext("/privacy").context);

      expect(response.headers.get("Cache-Control")).toBeNull();
    });

    it.each(["/api/session/history", "/auth/signin", "/dashboard", "/account/security", "/admin"])(
      "marks %s as private and uncacheable",
      async (path) => {
        const response = await run(createContext(path).context);

        expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
        expect(response.headers.get("Pragma")).toBe("no-cache");
        expect(response.headers.get("Expires")).toBe("0");
      },
    );

    it("puts the same headers on rejections and redirects", async () => {
      sessionLimiter.limit.mockResolvedValue({ success: false });
      getUser.mockResolvedValueOnce({ data: { user: USER } }).mockResolvedValueOnce({ data: { user: null } });

      const limited = await run(createContext("/api/session/message", jsonPost()).context);
      const redirected = await run(createContext("/dashboard").context);

      for (const response of [limited, redirected]) {
        expect(response.headers.get("X-Frame-Options")).toBe("DENY");
        expect(response.headers.get("Vary")).toBe("Cookie");
        expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
        expect(response.headers.get(OPERATIONAL_REQUEST_ID_HEADER)).toEqual(expect.any(String));
      }
    });
  });
});
