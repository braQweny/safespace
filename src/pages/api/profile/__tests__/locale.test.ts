import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALE_COOKIE_MAX_AGE_SECONDS, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

const createClient = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createClient,
}));

const { POST } = await import("@/pages/api/profile/locale");

const upsert = vi.fn();
const from = vi.fn(() => ({ upsert }));

function createContext(fields: Record<string, string> = {}, user: { id: string } | null = null) {
  const form = new FormData();

  for (const [field, value] of Object.entries(fields)) {
    form.append(field, value);
  }

  return createContextWithBody(form, user);
}

function createContextWithBody(body: BodyInit, user: { id: string } | null, contentType?: string) {
  const url = new URL("https://safespace.local/api/profile/locale");
  const cookies = { set: vi.fn(), get: vi.fn() };

  return {
    context: {
      request: new Request(url, {
        method: "POST",
        body,
        ...(contentType ? { headers: { "Content-Type": contentType } } : {}),
      }),
      cookies,
      locals: { user, locale: "en" },
      url,
      redirect: vi.fn(
        (target: string, status?: number) =>
          new Response(null, {
            status: status ?? 302,
            headers: { Location: target },
          }),
      ),
    } as unknown as APIContext,
    cookies,
  };
}

function location(response: Response) {
  return response.headers.get("Location");
}

describe("POST /api/profile/locale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockReturnValue({ from });
    upsert.mockResolvedValue({ error: null });
  });

  it("sets the cookie for an anonymous visitor and returns to the page", async () => {
    const { context, cookies } = createContext({ locale: "pl", returnTo: "/auth/signin?error=invalid_email" });

    const response = await POST(context);

    expect(response.status).toBe(303);
    expect(location(response)).toBe("/auth/signin?error=invalid_email");
    expect(cookies.set).toHaveBeenCalledWith(
      LOCALE_COOKIE_NAME,
      "pl",
      expect.objectContaining({ path: "/", httpOnly: true, sameSite: "lax", maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS }),
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("changes nothing for an unknown locale", async () => {
    const { context, cookies } = createContext({ locale: "de", returnTo: "/privacy" });

    const response = await POST(context);

    expect(location(response)).toBe("/privacy");
    expect(cookies.set).not.toHaveBeenCalled();
  });

  it("treats a JSON body like an empty form", async () => {
    const { context, cookies } = createContextWithBody(JSON.stringify({ locale: "pl" }), null, "application/json");

    const response = await POST(context);

    expect(response.status).toBe(303);
    expect(location(response)).toBe("/");
    expect(cookies.set).not.toHaveBeenCalled();
  });

  it("falls back to the root for an unsafe return path", async () => {
    const { context } = createContext({ locale: "pl", returnTo: "https://evil.example/phish" });

    expect(location(await POST(context))).toBe("/");
  });

  it("also stores the choice on a signed-in account", async () => {
    const { context, cookies } = createContext({ locale: "pl", returnTo: "/dashboard" }, { id: "user-1" });

    const response = await POST(context);

    expect(location(response)).toBe("/dashboard");
    expect(cookies.set).toHaveBeenCalledWith(LOCALE_COOKIE_NAME, "pl", expect.any(Object));
    expect(from).toHaveBeenCalledWith("user_preferences");
    expect(upsert).toHaveBeenCalledWith({ user_id: "user-1", locale: "pl" }, { onConflict: "user_id" });
  });

  it("keeps the cookie and redirect when the account write fails or supabase is missing", async () => {
    upsert.mockResolvedValue({ error: { message: "private" } });
    const failed = createContext({ locale: "pl", returnTo: "/dashboard" }, { id: "user-1" });
    expect(location(await POST(failed.context))).toBe("/dashboard");
    expect(failed.cookies.set).toHaveBeenCalled();

    createClient.mockReturnValue(null);
    const unconfigured = createContext({ locale: "en", returnTo: "/dashboard" }, { id: "user-1" });
    expect(location(await POST(unconfigured.context))).toBe("/dashboard");
    expect(unconfigured.cookies.set).toHaveBeenCalledWith(LOCALE_COOKIE_NAME, "en", expect.any(Object));
  });
});
