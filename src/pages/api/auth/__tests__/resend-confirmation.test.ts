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

const { POST } = await import("@/pages/api/auth/resend-confirmation");

const resend = vi.fn();

const supabaseStub = {
  auth: {
    resend,
  },
};

function createContext(fields: Record<string, string> = {}) {
  const form = new FormData();

  for (const [field, value] of Object.entries(fields)) {
    form.append(field, value);
  }

  const url = new URL("https://safespace.local/api/auth/resend-confirmation");

  return {
    request: new Request(url, { method: "POST", body: form }),
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

beforeEach(() => {
  vi.clearAllMocks();
  buildOperationalRequestContext.mockResolvedValue({ requestId: "req-1" });
  createClient.mockReturnValue(supabaseStub);
});

describe("POST /api/auth/resend-confirmation", () => {
  it("rejects an invalid email before touching supabase", async () => {
    const response = await POST(createContext({ email: "nie-email" }));

    expect(response.status).toBe(303);
    expect(location(response)).toBe("/auth/confirm-email?error=invalid_email");
    expect(resend).not.toHaveBeenCalled();
    expect(logOperationalEvent).toHaveBeenCalledWith(
      {
        event: "auth.resend_confirmation",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "invalid_email",
      },
      { requestId: "req-1" },
    );
  });

  it("fails closed when supabase is not configured", async () => {
    createClient.mockReturnValue(null);

    const response = await POST(createContext({ email: "user@example.com" }));

    expect(location(response)).toBe("/auth/confirm-email?error=auth_not_configured");
    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "auth.resend_confirmation",
        level: "error",
        reasonCode: "auth_not_configured",
        provider: "supabase",
      }),
      { requestId: "req-1" },
    );
  });

  it("resends the signup link with the shared callback URL and lands on the generic confirmation", async () => {
    resend.mockResolvedValue({ data: {}, error: null });

    const response = await POST(createContext({ email: " user@example.com " }));

    expect(response.status).toBe(303);
    expect(location(response)).toBe("/auth/confirm-email?resent=1");
    expect(resend).toHaveBeenCalledWith({
      type: "signup",
      email: "user@example.com",
      options: { emailRedirectTo: "https://safespace.local/auth/callback" },
    });
    expect(logOperationalEvent).toHaveBeenCalledWith(
      {
        event: "auth.resend_confirmation",
        level: "info",
        outcome: "success",
        status: 303,
        provider: "supabase",
      },
      { requestId: "req-1" },
    );
  });

  it("hides provider failures behind the same confirmation but logs them as failures", async () => {
    resend.mockResolvedValue({ data: {}, error: { message: "User not found", status: 400 } });

    const response = await POST(createContext({ email: "user@example.com" }));

    expect(response.status).toBe(303);
    expect(location(response)).toBe("/auth/confirm-email?resent=1");
    expect(logOperationalEvent).toHaveBeenCalledTimes(1);
    expect(logOperationalEvent).toHaveBeenCalledWith(
      {
        event: "auth.resend_confirmation",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "resend_confirmation_failed",
        provider: "supabase",
      },
      { requestId: "req-1" },
    );
  });

  it("treats a provider rate limit like success for the user and as blocked in the log", async () => {
    resend.mockResolvedValue({
      data: {},
      error: { message: "For security purposes, you can only request this after 59 seconds.", status: 429 },
    });

    const response = await POST(createContext({ email: "user@example.com" }));

    expect(location(response)).toBe("/auth/confirm-email?resent=1");
    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "blocked", reasonCode: "rate_limited", provider: "supabase" }),
      { requestId: "req-1" },
    );

    resend.mockResolvedValue({
      data: {},
      error: { message: "Email rate limit exceeded", status: 429, code: "over_email_send_rate_limit" },
    });

    const byCode = await POST(createContext({ email: "user@example.com" }));

    expect(location(byCode)).toBe("/auth/confirm-email?resent=1");
    expect(logOperationalEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ outcome: "blocked", reasonCode: "rate_limited" }),
      { requestId: "req-1" },
    );
  });
});
