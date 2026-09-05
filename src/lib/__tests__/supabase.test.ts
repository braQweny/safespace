import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerClient = vi.fn();

vi.mock("astro:env/server", () => ({
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_KEY: "anon-key",
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient,
  parseCookieHeader: (header: string) =>
    header
      .split(";")
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const [name, ...rest] = pair.split("=");
        return { name, value: rest.join("=") };
      }),
}));

const { createClient, clearAuthCookies } = await import("@/lib/supabase");

it("clears all project auth cookie chunks without deleting unrelated preferences", () => {
  const deleteCookie = vi.fn();
  clearAuthCookies(
    new Headers({
      Cookie:
        "sb-project-auth-token.0=a; sb-project-auth-token.1=b; sb-project-auth-token-code-verifier=c; theme=dark; sb-other-auth-token=d",
    }),
    {
      delete: deleteCookie,
      headers: () => ["sb-project-auth-token.2=refreshed; Path=/", "theme=light; Path=/"],
    } as never,
  );
  expect(deleteCookie.mock.calls).toEqual([
    ["sb-project-auth-token.0", { path: "/" }],
    ["sb-project-auth-token.1", { path: "/" }],
    ["sb-project-auth-token-code-verifier", { path: "/" }],
    ["sb-project-auth-token.2", { path: "/" }],
  ]);
});

interface CapturedOptions {
  cookieOptions?: { secure?: boolean };
  cookies: {
    getAll(): { name: string; value: string }[];
    setAll(cookies: { name: string; value: string; options: Record<string, unknown> }[]): void;
  };
}

function capturedOptions(): CapturedOptions {
  return createServerClient.mock.calls[0]?.[2] as CapturedOptions;
}

describe("createClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerClient.mockReturnValue({ auth: {} });
  });

  it("marks the auth cookies Secure in production builds only", () => {
    createClient(new Headers(), { set: vi.fn() } as never);

    // Vitest runs in development mode, so the flag mirrors `import.meta.env.PROD`
    // (false here) — the point is that it is derived from the build mode, not
    // hard-coded either way.
    expect(capturedOptions().cookieOptions).toEqual({ secure: import.meta.env.PROD });
    expect(typeof capturedOptions().cookieOptions?.secure).toBe("boolean");
  });

  it("reads request cookies and writes them back through the Astro cookie jar with the provided options", () => {
    const set = vi.fn();
    createClient(new Headers({ Cookie: "sb-a=1; sb-b=2" }), { set } as never);

    const { cookies } = capturedOptions();

    expect(cookies.getAll()).toEqual([
      { name: "sb-a", value: "1" },
      { name: "sb-b", value: "2" },
    ]);

    cookies.setAll([{ name: "sb-a", value: "3", options: { secure: true, sameSite: "lax" } }]);
    expect(set).toHaveBeenCalledWith("sb-a", "3", { secure: true, sameSite: "lax" });
  });

  it("returns null when the Supabase configuration is missing", async () => {
    vi.doMock("astro:env/server", () => ({ SUPABASE_URL: "", SUPABASE_KEY: "" }));
    vi.resetModules();

    const { createClient: createUnconfiguredClient } = await import("@/lib/supabase");

    expect(createUnconfiguredClient(new Headers(), { set: vi.fn() } as never)).toBeNull();
  });
});
