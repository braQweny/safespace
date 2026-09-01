import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminError, adminOk } from "@/lib/admin/errors";
import type { AdminContext, AdminOverviewMetrics, AdminUserListResult } from "@/lib/admin/types";

const getAdminContext = vi.fn();
const readAdminOverviewMetrics = vi.fn();
const listAdminUsers = vi.fn();
const parseAdminUserListFilters = vi.fn();
const parseAdminUserBlockInput = vi.fn();
const setAdminUserBlockState = vi.fn();
const parseAdminUserPlanInput = vi.fn();
const setAdminUserPlanState = vi.fn();

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
    parseAdminUserPlanInput,
    setAdminUserPlanState,
  };
});

const [{ GET: GET_OVERVIEW }, { GET: GET_USERS }, { POST: POST_BLOCK }, { POST: POST_PLAN }] = await Promise.all([
  import("@/pages/api/admin/overview"),
  import("@/pages/api/admin/users/index"),
  import("@/pages/api/admin/users/[userId]/block"),
  import("@/pages/api/admin/users/[userId]/plan"),
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
    plan: "free",
    premiumGrantedAt: null,
  },
  supabase: {},
} as AdminContext;

const overviewMetrics: AdminOverviewMetrics = {
  totalUsers: 10,
  blockedUsers: 1,
  premiumUsers: 2,
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
    plan: "all",
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
        premiumGrantedAt: null,
        premiumGrantedBy: null,
        createdAt: "2026-06-01T10:00:00.000Z",
        updatedAt: "2026-06-01T10:00:00.000Z",
      },
      accountStatus: "active",
      plan: "free",
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
    parseAdminUserPlanInput.mockReturnValue(
      adminOk({
        targetUserId: "user-1",
        action: "grant",
        reasonCode: "subscription_paid",
      }),
    );
    setAdminUserPlanState.mockResolvedValue(
      adminOk({
        user: {
          ...userListResult.users[0],
          plan: "premium",
          profile: {
            ...userListResult.users[0].profile,
            premiumGrantedAt: "2026-08-22T10:00:00.000Z",
            premiumGrantedBy: "admin-1",
          },
        },
        auditEvent: {
          id: "audit-2",
          adminUserId: "admin-1",
          targetUserId: "user-1",
          action: "premium_granted",
          reasonCode: "subscription_paid",
          createdAt: "2026-08-22T10:00:00.000Z",
        },
      }),
    );
  });

  it("grants premium through an explicit plan action", async () => {
    const response = await POST_PLAN(
      createContext("https://safespace.local/api/admin/users/user-1/plan", {
        action: "grant",
        reasonCode: "subscription_paid",
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(parseAdminUserPlanInput).toHaveBeenCalledWith("user-1", {
      action: "grant",
      reasonCode: "subscription_paid",
    });
    expect(setAdminUserPlanState).toHaveBeenCalledWith(adminContext, {
      targetUserId: "user-1",
      action: "grant",
      reasonCode: "subscription_paid",
    });
    await expect(readJson(response)).resolves.toMatchObject({
      ok: true,
      type: "admin_user_plan",
      result: {
        user: {
          plan: "premium",
        },
        auditEvent: {
          action: "premium_granted",
        },
      },
    });
  });

  it("rejects plan changes from non-admins and maps invalid payloads", async () => {
    getAdminContext.mockResolvedValueOnce(adminError("not_admin"));

    const forbidden = await POST_PLAN(
      createContext("https://safespace.local/api/admin/users/user-1/plan", {
        action: "grant",
        reasonCode: "subscription_paid",
      }) as never,
    );

    expect(forbidden.status).toBe(403);
    expect(setAdminUserPlanState).not.toHaveBeenCalled();

    parseAdminUserPlanInput.mockReturnValueOnce(adminError("invalid_filter"));

    const invalid = await POST_PLAN(
      createContext("https://safespace.local/api/admin/users/user-1/plan", {
        action: "grant",
        reasonCode: "policy_violation",
      }) as never,
    );

    expect(invalid.status).toBe(400);
    await expect(readJson(invalid)).resolves.toEqual({
      ok: false,
      type: "admin_error",
      code: "invalid_filter",
    });
    expect(setAdminUserPlanState).not.toHaveBeenCalled();
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

  it("answers a self-targeted block or plan change with a stable 400", async () => {
    setAdminUserBlockState.mockResolvedValueOnce(adminError("self_target_forbidden"));

    const selfBlock = await POST_BLOCK(
      createContext("https://safespace.local/api/admin/users/admin-1/block", {
        action: "block",
        reasonCode: "policy_violation",
      }) as never,
    );

    expect(selfBlock.status).toBe(400);
    await expect(readJson(selfBlock)).resolves.toEqual({
      ok: false,
      type: "admin_error",
      code: "self_target_forbidden",
    });

    setAdminUserPlanState.mockResolvedValueOnce(adminError("self_target_forbidden"));

    const selfPlan = await POST_PLAN(
      createContext("https://safespace.local/api/admin/users/admin-1/plan", {
        action: "grant",
        reasonCode: "subscription_paid",
      }) as never,
    );

    expect(selfPlan.status).toBe(400);
    await expect(readJson(selfPlan)).resolves.toMatchObject({ code: "self_target_forbidden" });
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
