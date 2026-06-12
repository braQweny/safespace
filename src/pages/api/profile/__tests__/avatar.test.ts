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

const { POST } = await import("@/pages/api/profile/avatar");

const upsert = vi.fn();
const from = vi.fn(() => ({ upsert }));

function createContext(fields: Record<string, string> = {}, user: { id: string } | null = { id: "user-1" }) {
  const form = new FormData();

  for (const [field, value] of Object.entries(fields)) {
    form.append(field, value);
  }

  const url = new URL("https://safespace.local/api/profile/avatar");

  return {
    request: new Request(url, { method: "POST", body: form }),
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
});
