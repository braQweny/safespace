import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import type { AdminRouteContext, AdminSupabaseClient } from "@/lib/admin/types";

const createClient = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createClient,
}));

const { getAdminContext } = await import("@/lib/admin/auth");
const { readAccountAccessState, requireActiveAccountAccess } = await import("@/lib/admin/account-access");
const { mapAdminReadError } = await import("@/lib/admin/errors");

const activeProfileRow = {
  user_id: "user-1",
  blocked_at: null,
  block_reason_code: null,
};

const blockedProfileRow = {
  user_id: "user-1",
  blocked_at: "2026-06-07T10:00:00.000Z",
  block_reason_code: "policy_violation",
};

function createUser(overrides: Partial<User> = {}) {
  return {
    id: "user-1",
    email: "admin@example.com",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-06-07T09:00:00.000Z",
    ...overrides,
  } satisfies User;
}

function createContext(user: User | null = createUser()): AdminRouteContext {
  return {
    request: new Request("https://safespace.local/admin"),
    cookies: {},
    locals: {
      user,
      requestId: "req-1",
    },
  } as AdminRouteContext;
}

function createAdminClient(
  profileResult: { data: unknown; error: unknown } = { data: activeProfileRow, error: null },
  adminResult: { data: unknown; error: unknown } = { data: true, error: null },
) {
  const maybeSingle = vi.fn().mockResolvedValue(profileResult);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn().mockResolvedValue(adminResult);

  return {
    from,
    select,
    eq,
    maybeSingle,
    rpc,
  };
}

describe("admin account access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active account state from safe profile metadata", async () => {
    const client = createAdminClient();

    const result = await readAccountAccessState(createContext(), client as unknown as AdminSupabaseClient);

    expect(result).toEqual({
      ok: true,
      data: {
        userId: "user-1",
        status: "active",
        blockedAt: null,
        blockReasonCode: null,
        plan: "free",
        premiumGrantedAt: null,
      },
    });
    expect(client.from).toHaveBeenCalledWith("account_access");
    expect(client.select).toHaveBeenCalledWith(
      "user_id,blocked_at,block_reason_code,premium_granted_at,effective_premium",
    );
  });

  it("returns blocked account state without raw profile data", async () => {
    const client = createAdminClient({
      data: blockedProfileRow,
      error: null,
    });

    const result = await readAccountAccessState(createContext(), client as unknown as AdminSupabaseClient);

    expect(result).toEqual({
      ok: true,
      data: {
        userId: "user-1",
        status: "blocked",
        blockedAt: "2026-06-07T10:00:00.000Z",
        blockReasonCode: "policy_violation",
        plan: "free",
        premiumGrantedAt: null,
      },
    });
    expect(JSON.stringify(result)).not.toContain("email");
  });

  it("maps blocked accounts to a stable account_blocked code", async () => {
    const client = createAdminClient({
      data: blockedProfileRow,
      error: null,
    });

    const result = await requireActiveAccountAccess(createContext(), client as unknown as AdminSupabaseClient);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "account_blocked",
      },
    });
  });

  it("rejects missing auth before querying account state", async () => {
    const result = await readAccountAccessState(createContext(null));

    expect(result).toEqual({
      ok: false,
      error: {
        code: "missing_auth",
      },
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("getAdminContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns admin context for an active admin with an active account", async () => {
    const client = createAdminClient();
    createClient.mockReturnValue(client);

    const result = await getAdminContext(createContext());

    expect(result).toMatchObject({
      ok: true,
      data: {
        user: {
          id: "user-1",
          email: "admin@example.com",
        },
        account: {
          status: "active",
        },
      },
    });
    expect(client.rpc).toHaveBeenCalledWith("is_private_admin");
  });

  it("rejects non-admin users with a stable not_admin code", async () => {
    const client = createAdminClient({ data: activeProfileRow, error: null }, { data: false, error: null });
    createClient.mockReturnValue(client);

    const result = await getAdminContext(createContext());

    expect(result).toEqual({
      ok: false,
      error: {
        code: "not_admin",
      },
    });
  });

  it("rejects blocked admin accounts before admin membership is trusted", async () => {
    const client = createAdminClient({
      data: blockedProfileRow,
      error: null,
    });
    createClient.mockReturnValue(client);

    const result = await getAdminContext(createContext());

    expect(result).toEqual({
      ok: false,
      error: {
        code: "blocked_admin",
      },
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("maps raw Supabase failures to stable safe codes", async () => {
    const client = createAdminClient({
      data: null,
      error: {
        code: "42501",
        message: "raw database failure with table details",
      },
    });
    createClient.mockReturnValue(client);

    const result = await getAdminContext(createContext());

    expect(result).toEqual({
      ok: false,
      error: {
        code: "admin_data_unavailable",
      },
    });
    expect(JSON.stringify(result)).not.toContain("raw database failure");
    expect(mapAdminReadError({ code: "PGRST116", details: "raw detail" })).toBe("target_not_found");
    expect(mapAdminReadError({ code: "42501", message: "raw detail" })).toBe("admin_data_unavailable");
  });
});
