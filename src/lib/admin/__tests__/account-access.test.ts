import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import type { AdminRouteContext, AdminSupabaseClient } from "@/lib/admin/types";

const createClient = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createClient,
}));

const { readAccountAccessState, toAccountAccessState } = await import("@/lib/admin/account-access");

function createUser(overrides: Partial<User> = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-06-07T09:00:00.000Z",
    ...overrides,
  } satisfies User;
}

function createContext(user: User | null = createUser()): AdminRouteContext {
  return {
    request: new Request("https://safespace.local/dashboard"),
    cookies: {},
    locals: {
      user,
      requestId: "req-1",
    },
  } as AdminRouteContext;
}

function createAccountClient(profileResult: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(profileResult);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  return {
    from,
    select,
    eq,
    maybeSingle,
  };
}

const activeState = {
  userId: "user-1",
  status: "active",
  blockedAt: null,
  blockReasonCode: null,
};

describe("toAccountAccessState", () => {
  it("defaults to an active account when there is no profile row", () => {
    expect(toAccountAccessState("user-1", null)).toEqual(activeState);
  });

  it("treats a row without a block timestamp as active", () => {
    expect(
      toAccountAccessState("user-1", {
        user_id: "user-1",
        blocked_at: null,
        block_reason_code: null,
      }),
    ).toEqual(activeState);
  });

  it("maps a blocked row to a blocked state with its reason", () => {
    expect(
      toAccountAccessState("user-1", {
        user_id: "user-1",
        blocked_at: "2026-06-07T10:00:00.000Z",
        block_reason_code: "policy_violation",
      }),
    ).toEqual({
      userId: "user-1",
      status: "blocked",
      blockedAt: "2026-06-07T10:00:00.000Z",
      blockReasonCode: "policy_violation",
    });
  });

  it("keeps a blocked state even when the reason code is missing", () => {
    expect(
      toAccountAccessState("user-1", {
        user_id: "user-1",
        blocked_at: "2026-06-07T10:00:00.000Z",
        block_reason_code: null,
      }),
    ).toMatchObject({
      status: "blocked",
      blockReasonCode: null,
    });
  });
});

describe("readAccountAccessState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the active state from a well-formed profile row", async () => {
    const client = createAccountClient({
      data: {
        user_id: "user-1",
        blocked_at: null,
        block_reason_code: null,
      },
      error: null,
    });

    const result = await readAccountAccessState(createContext(), client as unknown as AdminSupabaseClient);

    expect(result).toEqual({
      ok: true,
      data: activeState,
    });
    expect(client.from).toHaveBeenCalledWith("admin_user_profiles");
    expect(client.select).toHaveBeenCalledWith("user_id,blocked_at,block_reason_code");
    expect(client.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns the blocked state for a blocked profile row", async () => {
    const client = createAccountClient({
      data: {
        user_id: "user-1",
        blocked_at: "2026-06-07T10:00:00.000Z",
        block_reason_code: "safety_risk",
      },
      error: null,
    });

    const result = await readAccountAccessState(createContext(), client as unknown as AdminSupabaseClient);

    expect(result).toEqual({
      ok: true,
      data: {
        userId: "user-1",
        status: "blocked",
        blockedAt: "2026-06-07T10:00:00.000Z",
        blockReasonCode: "safety_risk",
      },
    });
  });

  it("treats a missing profile row as an active account", async () => {
    const client = createAccountClient({ data: null, error: null });

    const result = await readAccountAccessState(createContext(), client as unknown as AdminSupabaseClient);

    expect(result).toEqual({
      ok: true,
      data: activeState,
    });
  });

  it("coerces malformed row fields instead of trusting them", async () => {
    const client = createAccountClient({
      data: {
        user_id: "user-1",
        blocked_at: 1765100000000,
        block_reason_code: { raw: "object" },
      },
      error: null,
    });

    const result = await readAccountAccessState(createContext(), client as unknown as AdminSupabaseClient);

    expect(result).toEqual({
      ok: true,
      data: activeState,
    });
  });

  it("discards a row without a string user_id entirely", async () => {
    const client = createAccountClient({
      data: {
        blocked_at: "2026-06-07T10:00:00.000Z",
        block_reason_code: "policy_violation",
      },
      error: null,
    });

    const result = await readAccountAccessState(createContext(), client as unknown as AdminSupabaseClient);

    expect(result).toEqual({
      ok: true,
      data: activeState,
    });
  });

  it("rejects unauthenticated requests before any account query", async () => {
    const result = await readAccountAccessState(createContext(null));

    expect(result).toEqual({
      ok: false,
      error: {
        code: "missing_auth",
      },
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("maps raw Supabase read failures to a stable code without leaking details", async () => {
    const client = createAccountClient({
      data: null,
      error: {
        code: "42501",
        message: "raw database failure with table details",
      },
    });

    const result = await readAccountAccessState(createContext(), client as unknown as AdminSupabaseClient);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "account_access_unavailable",
      },
    });
    expect(JSON.stringify(result)).not.toContain("raw database failure");
  });

  it("returns account_access_unavailable when no client can be created", async () => {
    const result = await readAccountAccessState(createContext(), null);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "account_access_unavailable",
      },
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("falls back to a request-bound client when none is provided", async () => {
    const client = createAccountClient({ data: null, error: null });
    createClient.mockReturnValue(client);
    const context = createContext();

    const result = await readAccountAccessState(context);

    expect(createClient).toHaveBeenCalledWith(context.request.headers, context.cookies);
    expect(result).toEqual({
      ok: true,
      data: activeState,
    });
  });
});
