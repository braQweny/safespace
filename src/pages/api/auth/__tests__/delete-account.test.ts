import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const clearAuthCookies = vi.fn();
const rpc = vi.fn();
const signOut = vi.fn();
const logOperationalEvent = vi.fn();
vi.mock("@/lib/supabase", () => ({ createClient, clearAuthCookies }));
vi.mock("@/lib/operational-visibility/request-context", () => ({
  buildOperationalRequestContext: vi.fn().mockResolvedValue({ requestId: "test-delete" }),
}));
vi.mock("@/lib/operational-visibility/logger", () => ({ logOperationalEvent }));
const { POST } = await import("@/pages/api/auth/delete-account");

function context({
  confirmation = "USUWAM",
  origin = "https://safespace.local",
  user = { id: "owner" },
  json = false,
}: { confirmation?: string; origin?: string; user?: { id: string } | null; json?: boolean } = {}) {
  const url = new URL("https://safespace.local/api/auth/delete-account");
  return {
    url,
    locals: { user, accountAccess: { status: "blocked" } },
    cookies: {},
    request: new Request(url, {
      method: "POST",
      headers: { ...(origin ? { origin } : {}), ...(json ? { "Content-Type": "application/json" } : {}) },
      body: json ? JSON.stringify({ confirmation }) : new URLSearchParams({ confirmation, userId: "someone-else" }),
    }),
    redirect: (location: string, status = 302) => new Response(null, { status, headers: { Location: location } }),
  } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
  createClient.mockReturnValue({ rpc, auth: { signOut } });
  rpc.mockResolvedValue({ data: true, error: null });
  signOut.mockResolvedValue({ error: null });
});

describe("self-service account deletion", () => {
  it.each(["https://attacker.example", "", "null"])("rejects an untrusted or missing origin: %s", async (origin) => {
    expect((await POST(context({ origin }))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires a verified logged-in user", async () => {
    expect((await POST(context({ user: null }))).headers.get("Location")).toBe("/auth/signin");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["", "usuwam", "USUWAM "])("requires exact confirmation: %s", async (confirmation) => {
    expect((await POST(context({ confirmation }))).headers.get("Location")).toBe(
      "/account/delete?error=account_deletion_confirmation_required",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects a JSON body", async () => {
    await POST(context({ json: true }));
    expect(rpc).not.toHaveBeenCalled();
  });
  it("allows a blocked owner, ignores supplied target ids and clears the session after deletion", async () => {
    const response = await POST(context());
    expect(rpc).toHaveBeenCalledWith("delete_own_account", { p_confirmation: "USUWAM" });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(clearAuthCookies).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/auth/signin?status=account_deleted");
  });
  it.each(["error", "throw", "false", "null", "unconfigured"])(
    "handles %s without clearing an existing account session or exposing provider details",
    async (failure) => {
      if (failure === "error") rpc.mockResolvedValue({ data: null, error: { message: "private database details" } });
      if (failure === "throw") rpc.mockRejectedValue(new Error("private database details"));
      if (failure === "false") rpc.mockResolvedValue({ data: false, error: null });
      if (failure === "null") rpc.mockResolvedValue({ data: null, error: null });
      if (failure === "unconfigured") createClient.mockReturnValue(null);
      const response = await POST(context());
      expect(response.headers.get("Location")).toBe("/account/delete?error=account_deletion_failed");
      expect(signOut).not.toHaveBeenCalled();
      expect(clearAuthCookies).not.toHaveBeenCalled();
      expect(JSON.stringify(logOperationalEvent.mock.calls)).not.toContain("private database details");
    },
  );
  it("still clears credentials and reports success if Auth signout is unreachable after deletion", async () => {
    signOut.mockRejectedValue(new Error("offline"));
    expect((await POST(context())).headers.get("Location")).toBe("/auth/signin?status=account_deleted");
    expect(clearAuthCookies).toHaveBeenCalledOnce();
  });
});
