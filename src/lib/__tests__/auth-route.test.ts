import { beforeEach, describe, expect, it, vi } from "vitest";

const buildOperationalRequestContext = vi.fn();
const logOperationalEvent = vi.fn();
const createClient = vi.fn();

vi.mock("@/lib/operational-visibility/request-context", () => ({
  buildOperationalRequestContext,
}));

vi.mock("@/lib/operational-visibility/logger", () => ({
  logOperationalEvent,
}));

vi.mock("@/lib/supabase", () => ({
  createClient,
}));

const { createAuthRoute } = await import("@/lib/auth-route");

const operationalContext = { requestId: "req-1", route: "/api/auth/signin", method: "POST" };

function createContext() {
  return {
    request: new Request("https://safespace.local/api/auth/signin", { method: "POST" }),
    cookies: {},
    redirect: vi.fn(
      (target: string, status?: number) =>
        new Response(null, {
          status: status ?? 302,
          headers: { Location: target },
        }),
    ),
  } as never;
}

describe("createAuthRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildOperationalRequestContext.mockResolvedValue(operationalContext);
    createClient.mockReturnValue(null);
  });

  it("exposes the resolved supabase client (or null when unconfigured)", async () => {
    const supabase = { auth: {} };
    createClient.mockReturnValue(supabase);

    const route = await createAuthRoute(createContext(), "auth.signin");

    expect(route.supabase).toBe(supabase);
  });

  it("pairs a failure redirect with a warn-level failure log by default", async () => {
    const context = createContext();
    const route = await createAuthRoute(context, "auth.signin");

    const response = route.failureRedirect("/auth/signin", "invalid_email");

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/auth/signin?error=invalid_email");
    expect(logOperationalEvent).toHaveBeenCalledWith(
      {
        event: "auth.signin",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "invalid_email",
      },
      operationalContext,
    );
  });

  it("honours level, provider, and status overrides on failure", async () => {
    const context = createContext();
    const route = await createAuthRoute(context, "auth.reset_password");

    const response = route.failureRedirect("/auth/forgot-password", "auth_not_configured", {
      level: "error",
      provider: "supabase",
      status: 302,
    });

    expect(response.status).toBe(302);
    expect(logOperationalEvent).toHaveBeenCalledWith(
      {
        event: "auth.reset_password",
        level: "error",
        outcome: "failure",
        status: 302,
        reasonCode: "auth_not_configured",
        provider: "supabase",
      },
      operationalContext,
    );
  });

  it("logs a failure without redirecting via logFailure", async () => {
    const context = createContext();
    const route = await createAuthRoute(context, "auth.password_update");

    route.logFailure("missing_auth");

    expect(logOperationalEvent).toHaveBeenCalledWith(
      {
        event: "auth.password_update",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "missing_auth",
      },
      operationalContext,
    );
  });

  it("logs success with the supabase provider by default and redirects", async () => {
    const context = createContext();
    const route = await createAuthRoute(context, "auth.signin");

    const response = route.successRedirect("/dashboard");

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/dashboard");
    expect(logOperationalEvent).toHaveBeenCalledWith(
      {
        event: "auth.signin",
        level: "info",
        outcome: "success",
        status: 303,
        provider: "supabase",
      },
      operationalContext,
    );
  });

  it("supports a non-supabase provider on success", async () => {
    const context = createContext();
    const route = await createAuthRoute(context, "auth.oauth_start");

    route.successRedirect("https://accounts.google.com/o/oauth2/v2/auth", { provider: "google" });

    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google" }),
      operationalContext,
    );
  });
});
