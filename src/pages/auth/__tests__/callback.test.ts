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

const { GET } = await import("@/pages/auth/callback");

const exchangeCodeForSession = vi.fn();

function createContext(search: Record<string, string> = {}) {
  const url = new URL("https://safespace.local/auth/callback");

  for (const [param, value] of Object.entries(search)) {
    url.searchParams.set(param, value);
  }

  return {
    request: new Request(url),
    cookies: {},
    locals: {},
    url,
    redirect: vi.fn(
      (target: string, status?: number) =>
        new Response(null, {
          status: status ?? 302,
          headers: { Location: target },
        }),
    ),
  } as never;
}

function location(response: Response) {
  return response.headers.get("Location");
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildOperationalRequestContext.mockResolvedValue({ requestId: "req-1" });
    createClient.mockReturnValue({ auth: { exchangeCodeForSession } });
    exchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it("rejects a provider error or missing code without touching supabase", async () => {
    const providerError = await GET(createContext({ error: "access_denied" }));
    expect(location(providerError)).toBe("/auth/signin?error=oauth_callback_failed");

    const missingCode = await GET(createContext());
    expect(location(missingCode)).toBe("/auth/signin?error=oauth_callback_failed");

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("fails closed when supabase is not configured", async () => {
    createClient.mockReturnValue(null);

    const response = await GET(createContext({ code: "abc" }));

    expect(location(response)).toBe("/auth/signin?error=auth_not_configured");
  });

  it("maps a failed code exchange to a stable code", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "boom" } });

    const response = await GET(createContext({ code: "abc" }));

    expect(location(response)).toBe("/auth/signin?error=oauth_callback_failed");
  });

  it("lands on the dashboard by default and only allows allowlisted next paths", async () => {
    const dashboard = await GET(createContext({ code: "abc" }));
    expect(location(dashboard)).toBe("/dashboard");

    const security = await GET(createContext({ code: "abc", next: "/account/security" }));
    expect(location(security)).toBe("/account/security");

    const unsafe = await GET(createContext({ code: "abc", next: "https://evil.example/phish" }));
    expect(location(unsafe)).toBe("/dashboard");

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });
});
