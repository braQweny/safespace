import { beforeEach, describe, expect, it, vi } from "vitest";

const buildOperationalRequestContext = vi.fn();
const logOperationalEvent = vi.fn();
const createClient = vi.fn();
const requireActiveAccountAccess = vi.fn();

vi.mock("@/lib/operational-visibility/request-context", () => ({
  buildOperationalRequestContext,
}));

vi.mock("@/lib/operational-visibility/logger", () => ({
  logOperationalEvent,
}));

vi.mock("@/lib/supabase", () => ({
  createClient,
}));

vi.mock("@/lib/admin/account-access", () => ({
  requireActiveAccountAccess,
}));

const { POST } = await import("@/pages/api/profile/avatar");

const upsert = vi.fn();
const from = vi.fn(() => ({ upsert }));

function createContext(fields: Record<string, string> = {}, user: { id: string } | null = { id: "user-1" }) {
  const form = new FormData();

  for (const [field, value] of Object.entries(fields)) {
    form.append(field, value);
  }

  return createContextWithBody(form, user);
}

function createJsonContext(payload: unknown, user: { id: string } | null = { id: "user-1" }) {
  return createContextWithBody(JSON.stringify(payload), user, "application/json");
}

function createContextWithBody(body: BodyInit, user: { id: string } | null, contentType?: string) {
  const url = new URL("https://safespace.local/api/profile/avatar");

  return {
    request: new Request(url, {
      method: "POST",
      body,
      ...(contentType ? { headers: { "Content-Type": contentType } } : {}),
    }),
    cookies: {},
    locals: { user },
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

describe("POST /api/profile/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildOperationalRequestContext.mockResolvedValue({ requestId: "req-1" });
    createClient.mockReturnValue({ from });
    upsert.mockResolvedValue({ error: null });
    requireActiveAccountAccess.mockResolvedValue({ ok: true, data: { status: "active" } });
  });

  it("fails closed when supabase is not configured", async () => {
    createClient.mockReturnValue(null);

    const response = await POST(createContext({ modalityId: "psychodynamic" }));

    expect(response.status).toBe(303);
    expect(location(response)).toBe("/dashboard/avatar?avatarError=config_unavailable");
  });

  it("rejects an unauthenticated request", async () => {
    const response = await POST(createContext({ modalityId: "psychodynamic" }, null));

    expect(location(response)).toBe("/dashboard/avatar?avatarError=missing_auth");
    expect(from).not.toHaveBeenCalled();
  });

  it("sends a blocked account to the blocked page without saving", async () => {
    requireActiveAccountAccess.mockResolvedValue({ ok: false, error: { code: "account_blocked" } });

    const response = await POST(createContext({ modalityId: "psychodynamic" }));

    expect(response.status).toBe(303);
    expect(location(response)).toBe("/account/blocked");
    expect(requireActiveAccountAccess).toHaveBeenCalledWith(
      expect.objectContaining({ locals: { user: { id: "user-1" } } }),
      {
        from,
      },
    );
    expect(from).not.toHaveBeenCalled();
    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "avatar.save", reasonCode: "account_blocked", outcome: "blocked" }),
      { requestId: "req-1" },
    );
  });

  it("fails closed when the account state cannot be read", async () => {
    requireActiveAccountAccess.mockResolvedValue({ ok: false, error: { code: "account_access_unavailable" } });

    const response = await POST(createContext({ modalityId: "psychodynamic" }));

    expect(location(response)).toBe("/account/blocked?state=unavailable");
    expect(from).not.toHaveBeenCalled();
  });

  it("treats a JSON body like an empty form instead of crashing", async () => {
    const response = await POST(createJsonContext({ modalityId: "psychodynamic" }));

    expect(response.status).toBe(303);
    expect(location(response)).toBe("/dashboard/avatar?avatarError=invalid_choice");
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a modality outside the catalog", async () => {
    const response = await POST(createContext({ modalityId: "nieistniejaca" }));

    expect(location(response)).toBe("/dashboard/avatar?avatarError=invalid_choice");
    expect(from).not.toHaveBeenCalled();
  });

  it("maps a failed upsert to a stable code without leaking supabase details", async () => {
    upsert.mockResolvedValue({ error: { message: "duplicate key", details: "private" } });

    const response = await POST(createContext({ modalityId: "psychodynamic" }));

    expect(location(response)).toBe("/dashboard/avatar?avatarError=save_failed");
  });

  it("upserts the catalog choice keyed by user and confirms on the dashboard", async () => {
    const response = await POST(createContext({ modalityId: "psychodynamic" }));

    expect(location(response)).toBe("/dashboard?avatar=updated");
    expect(from).toHaveBeenCalledWith("user_avatar_choices");
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        modality_id: "psychodynamic",
        avatar_id: "psychodynamic-listener",
      },
      { onConflict: "user_id" },
    );
  });

  /*
   * Ekran wyboru perspektywy oferuje też start rozmowy. Zapis nie startuje sesji
   * sam — przekazuje intencję adresem, a pulą i limitami zarządzają trasy startu.
   */
  it("sends the user to the panel with the start request after save-and-start", async () => {
    const response = await POST(createContext({ modalityId: "psychodynamic", intent: "save_and_start" }));

    expect(response.status).toBe(303);
    expect(location(response)).toBe("/dashboard?start=now");
  });

  it("keeps the plain save on the confirmation path", async () => {
    const response = await POST(createContext({ modalityId: "psychodynamic", intent: "save" }));

    expect(location(response)).toBe("/dashboard?avatar=updated");
  });

  it("treats an unknown intent as a plain save", async () => {
    const response = await POST(createContext({ modalityId: "psychodynamic", intent: "start_everything" }));

    expect(location(response)).toBe("/dashboard?avatar=updated");
  });
});
