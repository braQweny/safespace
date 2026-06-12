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

const [{ POST: SIGNIN }, { POST: SIGNUP }, { POST: SIGNOUT }, { POST: PASSWORD }, { POST: RESET }, { POST: GOOGLE }] =
  await Promise.all([
    import("@/pages/api/auth/signin"),
    import("@/pages/api/auth/signup"),
    import("@/pages/api/auth/signout"),
    import("@/pages/api/auth/password"),
    import("@/pages/api/auth/reset-password"),
    import("@/pages/api/auth/google"),
  ]);

const signInWithPassword = vi.fn();
const signUp = vi.fn();
const signOut = vi.fn();
const getUser = vi.fn();
const updateUser = vi.fn();
const resetPasswordForEmail = vi.fn();
const signInWithOAuth = vi.fn();

const supabaseStub = {
  auth: {
    signInWithPassword,
    signUp,
    signOut,
    getUser,
    updateUser,
    resetPasswordForEmail,
    signInWithOAuth,
  },
};

function createContext(fields: Record<string, string> = {}, path = "/api/auth/signin") {
  const form = new FormData();

  for (const [field, value] of Object.entries(fields)) {
    form.append(field, value);
  }

  const url = new URL(`https://safespace.local${path}`);

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

describe("POST /api/auth/signin", () => {
  it("rejects an invalid email before touching supabase", async () => {
    const response = await SIGNIN(createContext({ email: "nie-email", password: "haslo123" }));

    expect(response.status).toBe(303);
    expect(location(response)).toBe("/auth/signin?error=invalid_email");
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(logOperationalEvent).toHaveBeenCalledWith(
      {
        event: "auth.signin",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "invalid_email",
      },
      { requestId: "req-1" },
    );
  });

  it("rejects a missing password", async () => {
    const response = await SIGNIN(createContext({ email: "user@example.com" }));

    expect(location(response)).toBe("/auth/signin?error=missing_password");
  });

  it("fails closed when supabase is not configured", async () => {
    createClient.mockReturnValue(null);

    const response = await SIGNIN(createContext({ email: "user@example.com", password: "haslo123" }));

    expect(location(response)).toBe("/auth/signin?error=auth_not_configured");
    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ level: "error", reasonCode: "auth_not_configured", provider: "supabase" }),
      { requestId: "req-1" },
    );
  });

  it("maps provider errors to stable codes without leaking the raw message", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "Email not confirmed", status: 422 } });

    const response = await SIGNIN(createContext({ email: "user@example.com", password: "haslo123" }));

    expect(location(response)).toBe("/auth/signin?error=email_not_confirmed");
  });

  it("redirects to the dashboard on success and honours a safe redirectTo", async () => {
    signInWithPassword.mockResolvedValue({ error: null });

    const fallback = await SIGNIN(createContext({ email: "user@example.com", password: "haslo123" }));
    expect(location(fallback)).toBe("/dashboard");

    const custom = await SIGNIN(
      createContext({ email: "user@example.com", password: "haslo123", redirectTo: "/dashboard/session" }),
    );
    expect(location(custom)).toBe("/dashboard/session");

    const unsafe = await SIGNIN(
      createContext({ email: "user@example.com", password: "haslo123", redirectTo: "https://evil.example" }),
    );
    expect(location(unsafe)).toBe("/dashboard");

    expect(signInWithPassword).toHaveBeenCalledWith({ email: "user@example.com", password: "haslo123" });
  });
});

describe("POST /api/auth/signup", () => {
  const validFields = { email: "user@example.com", password: "haslo123", confirmPassword: "haslo123" };

  it("rejects a too-short password", async () => {
    const response = await SIGNUP(createContext({ ...validFields, password: "abc", confirmPassword: "abc" }));

    expect(location(response)).toBe("/auth/signup?error=password_too_short");
  });

  it("rejects mismatched passwords", async () => {
    const response = await SIGNUP(createContext({ ...validFields, confirmPassword: "inne-haslo" }));

    expect(location(response)).toBe("/auth/signup?error=passwords_do_not_match");
  });

  it("maps provider errors to stable codes", async () => {
    signUp.mockResolvedValue({ data: {}, error: { message: "boom" } });

    const response = await SIGNUP(createContext(validFields));

    expect(location(response)).toBe("/auth/signup?error=signup_failed");
  });

  it("sends a session-less signup to email confirmation, a signed-in one to the dashboard", async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    const confirm = await SIGNUP(createContext(validFields));
    expect(location(confirm)).toBe("/auth/confirm-email");

    signUp.mockResolvedValue({ data: { session: {} }, error: null });
    const dashboard = await SIGNUP(createContext(validFields));
    expect(location(dashboard)).toBe("/dashboard");

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        password: "haslo123",
        options: { emailRedirectTo: "https://safespace.local/auth/callback" },
      }),
    );
  });
});

describe("POST /api/auth/signout", () => {
  it("maps a signout error to a stable code", async () => {
    signOut.mockResolvedValue({ error: { message: "boom" } });

    const response = await SIGNOUT(createContext());

    expect(location(response)).toBe("/auth/signin?error=signout_failed");
  });

  it("still redirects home when supabase is not configured, but logs the failure", async () => {
    createClient.mockReturnValue(null);

    const response = await SIGNOUT(createContext());

    expect(location(response)).toBe("/");
    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: "auth_not_configured", level: "error" }),
      { requestId: "req-1" },
    );
  });

  it("redirects home after a successful local signout", async () => {
    signOut.mockResolvedValue({ error: null });

    const response = await SIGNOUT(createContext());

    expect(location(response)).toBe("/");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("POST /api/auth/password", () => {
  const validFields = { password: "noweHaslo1", confirmPassword: "noweHaslo1" };

  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("sends an unauthenticated user to signin without an error code", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await PASSWORD(createContext(validFields));

    expect(response.status).toBe(303);
    expect(location(response)).toBe("/auth/signin");
    expect(logOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({ reasonCode: "missing_auth" }), {
      requestId: "req-1",
    });
  });

  it("validates the new password before calling supabase", async () => {
    const tooShort = await PASSWORD(createContext({ password: "abc", confirmPassword: "abc" }));
    expect(location(tooShort)).toBe("/account/security?error=password_too_short");

    const mismatch = await PASSWORD(createContext({ password: "noweHaslo1", confirmPassword: "inne" }));
    expect(location(mismatch)).toBe("/account/security?error=passwords_do_not_match");

    expect(updateUser).not.toHaveBeenCalled();
  });

  it("maps a rate-limited update to its stable code", async () => {
    updateUser.mockResolvedValue({ error: { message: "Rate limit exceeded" } });

    const response = await PASSWORD(createContext(validFields));

    expect(location(response)).toBe("/account/security?error=rate_limited");
  });

  it("confirms a successful update on the security page", async () => {
    updateUser.mockResolvedValue({ error: null });

    const response = await PASSWORD(createContext(validFields));

    expect(location(response)).toBe("/account/security?status=password_updated");
    expect(updateUser).toHaveBeenCalledWith({ password: "noweHaslo1" });
  });
});

describe("POST /api/auth/reset-password", () => {
  it("rejects an invalid email with a 302 redirect", async () => {
    const response = await RESET(createContext({ email: "nie-email" }));

    expect(response.status).toBe(302);
    expect(location(response)).toBe("/auth/forgot-password?error=invalid_email");
  });

  it("maps provider errors to stable codes", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { message: "boom" } });

    const response = await RESET(createContext({ email: "user@example.com" }));

    expect(location(response)).toBe("/auth/forgot-password?error=reset_password_failed");
  });

  it("always ends on the same confirmation and routes recovery through the security page", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });

    const response = await RESET(createContext({ email: "user@example.com" }));

    expect(response.status).toBe(302);
    expect(location(response)).toBe("/auth/forgot-password?sent=1");
    expect(resetPasswordForEmail).toHaveBeenCalledWith("user@example.com", {
      redirectTo: `https://safespace.local/auth/callback?next=${encodeURIComponent("/account/security")}`,
    });
  });
});

describe("POST /api/auth/google", () => {
  it("fails closed with the google provider when supabase is not configured", async () => {
    createClient.mockReturnValue(null);

    const response = await GOOGLE(createContext());

    expect(location(response)).toBe("/auth/signin?error=auth_not_configured");
    expect(logOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({ provider: "google", level: "error" }), {
      requestId: "req-1",
    });
  });

  it("maps a missing OAuth URL to a stable code", async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });

    const response = await GOOGLE(createContext());

    expect(location(response)).toBe("/auth/signin?error=oauth_start_failed");
  });

  it("redirects to the provider URL on success", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/v2/auth?state=abc" },
      error: null,
    });

    const response = await GOOGLE(createContext());

    expect(location(response)).toBe("https://accounts.google.com/o/oauth2/v2/auth?state=abc");
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { redirectTo: "https://safespace.local/auth/callback" },
      }),
    );
  });
});
