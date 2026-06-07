import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminError, adminOk } from "@/lib/admin/errors";
import type { AdminContext, AdminOverviewMetrics, AdminUserListResult } from "@/lib/admin/types";

const getAdminContext = vi.fn();
const readAdminOverviewMetrics = vi.fn();
const listAdminUsers = vi.fn();
const parseAdminUserListFilters = vi.fn();
const parseAdminUserBlockInput = vi.fn();
const setAdminUserBlockState = vi.fn();

vi.mock("@/lib/admin/auth", () => ({
  getAdminContext,
}));

vi.mock("@/lib/admin/aggregates", () => ({
  readAdminOverviewMetrics,
}));

vi.mock("@/lib/admin/users", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin/users")>("@/lib/admin/users");

  return {
    ...actual,
    listAdminUsers,
    parseAdminUserListFilters,
    parseAdminUserBlockInput,
    setAdminUserBlockState,
  };
});

const [{ GET: GET_OVERVIEW }, { GET: GET_USERS }, { POST: POST_BLOCK }] = await Promise.all([
  import("@/pages/api/admin/overview"),
  import("@/pages/api/admin/users/index"),
  import("@/pages/api/admin/users/[userId]/block"),
]);

const adminContext = {
  user: {
    id: "admin-1",
    email: "admin@example.com",
  },
  account: {
    userId: "admin-1",
    status: "active",
    blockedAt: null,
    blockReasonCode: null,
  },
  supabase: {},
} as AdminContext;

const overviewMetrics: AdminOverviewMetrics = {
  totalUsers: 10,
  blockedUsers: 1,
  sessionsByLifecycle: {},
  activeSessions: {
    value: null,
    isSuppressed: true,
    label: "<5",
  },
  completedSessions: {
    value: 6,
    isSuppressed: false,
    label: "6",
  },
  trialSessions: {
    value: 6,
    isSuppressed: false,
    label: "6",
  },
  followUpSessions: {
    value: 0,
    isSuppressed: false,
    label: "0",
  },
  approvedSummaries: {
    value: null,
    isSuppressed: true,
    label: "<5",
  },
};

const userListResult: AdminUserListResult = {
  filters: {
    emailSearch: "",
    status: "all",
    sort: "created_desc",
    page: 1,
    pageSize: 20,
  },
  users: [
    {
      profile: {
        userId: "user-1",
        email: "user@example.com",
        accountCreatedAt: "2026-06-01T10:00:00.000Z",
        lastSignInAt: null,
        lastActivityAt: null,
        blockedAt: null,
        blockedBy: null,
        blockReasonCode: null,
        createdAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-01T10:00:00.000Z",
      },
      accountStatus: "active",
      counters: {
        totalSessions: 1,
        activeSessions: 0,
        completedSessions: 1,
        approvedSummaries: 0,
      },
    },
  ],
  pagination: {
    page: 1,
    pageSize: 20,
    totalCount: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
};

function createContext(url = "https://safespace.local/api/admin/users", body?: unknown) {
  return {
    request: new Request(url, {
      method: body ? "POST" : "GET",
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    cookies: {},
    locals: {
      user: {
        id: "admin-1",
      },
      requestId: "req-1",
    },
    params: {
      userId: "user-1",
    },
    url: new URL(url),
  };
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("admin API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAdminContext.mockResolvedValue(adminOk(adminContext));
    readAdminOverviewMetrics.mockResolvedValue(adminOk(overviewMetrics));
    parseAdminUserListFilters.mockReturnValue(adminOk(userListResult.filters));
    listAdminUsers.mockResolvedValue(adminOk(userListResult));
    parseAdminUserBlockInput.mockReturnValue(
      adminOk({
        targetUserId: "user-1",
        action: "block",
        reasonCode: "policy_violation",
      }),
    );
    setAdminUserBlockState.mockResolvedValue(
      adminOk({
        user: {
          ...userListResult.users[0],
          accountStatus: "blocked",
        },
        auditEvent: {
          id: "audit-1",
          adminUserId: "admin-1",
          targetUserId: "user-1",
          action: "account_blocked",
          reasonCode: "policy_violation",
          createdAt: "2026-06-07T10:00:00.000Z",
        },
      }),
    );
  });

  it("rejects non-admin overview reads", async () => {
    getAdminContext.mockResolvedValue(adminError("not_admin"));

    const response = await GET_OVERVIEW(createContext("https://safespace.local/api/admin/overview") as never);

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toEqual({
      ok: false,
      type: "admin_error",
      code: "not_admin",
    });
    expect(readAdminOverviewMetrics).not.toHaveBeenCalled();
  });

  it("rejects blocked admins before listing users", async () => {
    getAdminContext.mockResolvedValue(adminError("blocked_admin"));

    const response = await GET_USERS(createContext() as never);

    expect(response.status).toBe(403);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: false,
      code: "blocked_admin",
    });
    expect(listAdminUsers).not.toHaveBeenCalled();
  });

  it("returns overview metrics for admins", async () => {
    const response = await GET_OVERVIEW(createContext("https://safespace.local/api/admin/overview") as never);

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: true,
      type: "admin_overview",
      metrics: {
        totalUsers: 10,
        activeSessions: {
          label: "<5",
        },
      },
    });
    expect(getAdminContext).toHaveBeenCalled();
  });

  it("returns users list for admins", async () => {
    const response = await GET_USERS(createContext("https://safespace.local/api/admin/users?status=all") as never);

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      ok: true,
      type: "admin_users",
      result: {
        users: [
          {
            profile: {
              email: "user@example.com",
            },
          },
        ],
      },
    });
    expect(listAdminUsers).toHaveBeenCalledWith(adminContext, userListResult.filters);
  });

  it("maps invalid user filters to a stable 400", async () => {
    parseAdminUserListFilters.mockReturnValue(adminError("invalid_filter"));

    const response = await GET_USERS(createContext("https://safespace.local/api/admin/users?status=deleted") as never);

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toEqual({
      ok: false,
      type: "admin_error",
      code: "invalid_filter",
    });
    expect(listAdminUsers).not.toHaveBeenCalled();
  });

  it("blocks users through an explicit action", async () => {
    const response = await POST_BLOCK(
      createContext("https://safespace.local/api/admin/users/user-1/block", {
        action: "block",
        reasonCode: "policy_violation",
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(parseAdminUserBlockInput).toHaveBeenCalledWith("user-1", {
      action: "block",
      reasonCode: "policy_violation",
    });
    await expect(readJson(response)).resolves.toMatchObject({
      ok: true,
      type: "admin_user_block",
      result: {
        user: {
          accountStatus: "blocked",
        },
      },
    });
  });

  it("unblocks users through the same stable route", async () => {
    parseAdminUserBlockInput.mockReturnValue(
      adminOk({
        targetUserId: "user-1",
        action: "unblock",
        reasonCode: "owner_request",
      }),
    );

    const response = await POST_BLOCK(
      createContext("https://safespace.local/api/admin/users/user-1/block", {
        action: "unblock",
        reasonCode: "owner_request",
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(setAdminUserBlockState).toHaveBeenCalledWith(adminContext, {
      targetUserId: "user-1",
      action: "unblock",
      reasonCode: "owner_request",
    });
  });

  it("maps target not found and write failures without raw errors", async () => {
    setAdminUserBlockState.mockResolvedValueOnce(adminError("target_not_found"));

    const missing = await POST_BLOCK(
      createContext("https://safespace.local/api/admin/users/missing/block", {
        action: "block",
        reasonCode: "policy_violation",
      }) as never,
    );

    expect(missing.status).toBe(404);
    await expect(readJson(missing)).resolves.toEqual({
      ok: false,
      type: "admin_error",
      code: "target_not_found",
    });

    setAdminUserBlockState.mockResolvedValueOnce(adminError("write_failed"));

    const failed = await POST_BLOCK(
      createContext("https://safespace.local/api/admin/users/user-1/block", {
        action: "block",
        reasonCode: "policy_violation",
      }) as never,
    );

    expect(failed.status).toBe(409);
    expect(JSON.stringify(await readJson(failed))).not.toContain("raw database error");
  });
});
