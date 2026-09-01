import { describe, expect, it, vi } from "vitest";
import { adminError, adminOk } from "@/lib/admin/errors";
import type { AdminAuditEvent, AdminContext, AdminUserListItem } from "@/lib/admin/types";
import {
  listAdminUsers,
  parseAdminUserBlockInput,
  parseAdminUserListFilters,
  parseAdminUserPlanInput,
  setAdminUserBlockState,
  setAdminUserPlanState,
  toAdminUserListResult,
} from "@/lib/admin/users";

const filters = {
  emailSearch: "anna@example.com",
  status: "blocked",
  plan: "premium",
  sort: "last_activity_desc",
  page: 2,
  pageSize: 10,
} as const;

const TARGET_USER_ID = "11111111-2222-4333-8444-555555555555";
const ADMIN_USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function createAdminContext(rpc = vi.fn()): AdminContext {
  return {
    supabase: {
      rpc,
    },
    user: {
      id: ADMIN_USER_ID,
      email: "admin@example.com",
    },
    account: {
      userId: ADMIN_USER_ID,
      status: "active",
      blockedAt: null,
      blockReasonCode: null,
      plan: "free",
      premiumGrantedAt: null,
    },
  } as unknown as AdminContext;
}

function createListItem(status: "active" | "blocked" = "active", plan: "free" | "premium" = "free"): AdminUserListItem {
  return {
    profile: {
      userId: "user-1",
      email: "user@example.com",
      accountCreatedAt: "2026-06-01T10:00:00.000Z",
      lastSignInAt: "2026-06-06T10:00:00.000Z",
      lastActivityAt: "2026-06-06T10:00:00.000Z",
      blockedAt: status === "blocked" ? "2026-06-07T10:00:00.000Z" : null,
      blockedBy: status === "blocked" ? "admin-1" : null,
      blockReasonCode: status === "blocked" ? "policy_violation" : null,
      premiumGrantedAt: plan === "premium" ? "2026-08-01T10:00:00.000Z" : null,
      premiumGrantedBy: plan === "premium" ? "admin-1" : null,
      createdAt: "2026-06-01T10:00:00.000Z",
      updatedAt: "2026-06-07T10:00:00.000Z",
    },
    accountStatus: status,
    plan,
    counters: {
      totalSessions: 3,
      activeSessions: 1,
      completedSessions: 2,
      approvedSummaries: 1,
    },
  };
}

const auditEvent: AdminAuditEvent = {
  id: "audit-1",
  adminUserId: "admin-1",
  targetUserId: "user-1",
  action: "account_blocked",
  reasonCode: "policy_violation",
  createdAt: "2026-06-07T10:00:00.000Z",
};

function createAtomicRpcData(status: "active" | "blocked", plan: "free" | "premium", event = auditEvent) {
  const { profile } = createListItem(status, plan);

  return {
    profile: {
      user_id: profile.userId,
      email: profile.email,
      account_created_at: profile.accountCreatedAt,
      last_sign_in_at: profile.lastSignInAt,
      last_activity_at: profile.lastActivityAt,
      blocked_at: profile.blockedAt,
      blocked_by: profile.blockedBy,
      block_reason_code: profile.blockReasonCode,
      premium_granted_at: profile.premiumGrantedAt,
      premium_granted_by: profile.premiumGrantedBy,
      created_at: profile.createdAt,
      updated_at: profile.updatedAt,
    },
    auditEvent: {
      id: event.id,
      admin_user_id: event.adminUserId,
      target_user_id: event.targetUserId,
      action: event.action,
      reason_code: event.reasonCode,
      created_at: event.createdAt,
    },
  };
}

describe("admin user filters", () => {
  it("normalizes user list filters", () => {
    const params = new URLSearchParams({
      q: " anna@example.com ",
      status: "blocked",
      plan: "premium",
      sort: "last_activity_desc",
      page: "2",
      pageSize: "10",
    });

    expect(parseAdminUserListFilters(params)).toEqual({
      ok: true,
      data: filters,
    });
  });

  it("defaults the plan filter to all accounts", () => {
    expect(parseAdminUserListFilters(new URLSearchParams())).toMatchObject({
      ok: true,
      data: {
        status: "all",
        plan: "all",
      },
    });
  });

  it("rejects invalid filters with a stable code", () => {
    expect(parseAdminUserListFilters(new URLSearchParams({ status: "deleted" }))).toEqual({
      ok: false,
      error: {
        code: "invalid_filter",
      },
    });
    expect(parseAdminUserListFilters(new URLSearchParams({ plan: "gold" }))).toEqual({
      ok: false,
      error: {
        code: "invalid_filter",
      },
    });
  });
});

describe("admin users list", () => {
  it("maps safe user rows with plan, counters and pagination", () => {
    const result = toAdminUserListResult(filters, [
      {
        user_id: "user-1",
        email: "anna@example.com",
        account_created_at: "2026-06-01T10:00:00.000Z",
        last_sign_in_at: "2026-06-06T10:00:00.000Z",
        last_activity_at: "2026-06-06T10:00:00.000Z",
        blocked_at: "2026-06-07T10:00:00.000Z",
        blocked_by: "admin-1",
        block_reason_code: "policy_violation",
        premium_granted_at: "2026-08-01T10:00:00.000Z",
        premium_granted_by: "admin-1",
        total_sessions: "4",
        active_sessions: "1",
        completed_sessions: "3",
        approved_summaries: "2",
        total_count: "22",
      },
      {
        user_id: "user-2",
        email: "free@example.com",
        account_created_at: "2026-06-02T10:00:00.000Z",
        last_sign_in_at: null,
        last_activity_at: null,
        blocked_at: null,
        blocked_by: null,
        block_reason_code: null,
        premium_granted_at: null,
        premium_granted_by: null,
        total_sessions: "0",
        active_sessions: "0",
        completed_sessions: "0",
        approved_summaries: "0",
        total_count: "22",
      },
    ]);

    expect(result).toMatchObject({
      filters,
      users: [
        {
          accountStatus: "blocked",
          plan: "premium",
          profile: {
            email: "anna@example.com",
            premiumGrantedAt: "2026-08-01T10:00:00.000Z",
          },
          counters: {
            totalSessions: 4,
            completedSessions: 3,
          },
        },
        {
          accountStatus: "active",
          plan: "free",
          profile: {
            premiumGrantedAt: null,
            premiumGrantedBy: null,
          },
        },
      ],
      pagination: {
        hasNextPage: true,
        hasPreviousPage: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("content");
    expect(JSON.stringify(result)).not.toContain("raw_user_meta_data");
  });

  it("treats a row without the premium column as a free account", () => {
    const result = toAdminUserListResult(filters, [
      {
        user_id: "user-1",
        email: "anna@example.com",
        account_created_at: "2026-06-01T10:00:00.000Z",
        last_sign_in_at: null,
        last_activity_at: null,
        blocked_at: null,
        blocked_by: null,
        block_reason_code: null,
        total_sessions: "0",
        active_sessions: "0",
        completed_sessions: "0",
        approved_summaries: "0",
        total_count: "1",
      },
    ]);

    expect(result.users[0]).toMatchObject({
      plan: "free",
      profile: {
        premiumGrantedAt: null,
      },
    });
  });

  it("reads users through the safe admin RPC with the plan filter", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });

    const result = await listAdminUsers(createAdminContext(rpc), filters);

    expect(result).toMatchObject({
      ok: true,
      data: {
        users: [],
      },
    });
    expect(rpc).toHaveBeenCalledWith("list_private_admin_users", {
      input_email_search: "anna@example.com",
      input_status_filter: "blocked",
      input_sort: "last_activity_desc",
      input_page: 2,
      input_page_size: 10,
      input_plan_filter: "premium",
    });
  });
});

describe("admin block actions", () => {
  it("parses explicit block and unblock payloads", () => {
    expect(parseAdminUserBlockInput(TARGET_USER_ID, { action: "block", reasonCode: "policy_violation" })).toEqual({
      ok: true,
      data: {
        targetUserId: TARGET_USER_ID,
        action: "block",
        reasonCode: "policy_violation",
      },
    });
    expect(parseAdminUserBlockInput(TARGET_USER_ID, { action: "delete", reasonCode: "policy_violation" })).toEqual({
      ok: false,
      error: {
        code: "invalid_filter",
      },
    });
  });

  it("refuses a target that is not a uuid as not found, before looking at the body", () => {
    for (const targetUserId of [undefined, "", "user-1", "missing", "1; drop table", `${TARGET_USER_ID}x`]) {
      expect(parseAdminUserBlockInput(targetUserId, { action: "block", reasonCode: "policy_violation" })).toEqual({
        ok: false,
        error: {
          code: "target_not_found",
        },
      });
      expect(parseAdminUserPlanInput(targetUserId, { action: "grant", reasonCode: "subscription_paid" })).toEqual({
        ok: false,
        error: {
          code: "target_not_found",
        },
      });
    }

    // Case and surrounding whitespace are tolerated; the id is normalized.
    expect(
      parseAdminUserBlockInput(` ${TARGET_USER_ID.toUpperCase()} `, { action: "block", reasonCode: "other" }),
    ).toMatchObject({
      ok: true,
      data: { targetUserId: TARGET_USER_ID.toUpperCase() },
    });
  });

  it("refuses to block or unblock the admin's own account without touching the repository", async () => {
    const mutateBlockState = vi.fn();

    const result = await setAdminUserBlockState(
      createAdminContext(),
      {
        targetUserId: ADMIN_USER_ID,
        action: "block",
        reasonCode: "policy_violation",
      },
      { mutateBlockState },
    );

    expect(result).toEqual({ ok: false, error: { code: "self_target_forbidden" } });
    expect(mutateBlockState).not.toHaveBeenCalled();
  });

  it("calls the transactional database RPC and maps its safe response", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: createAtomicRpcData("blocked", "free"),
      error: null,
    });

    const result = await setAdminUserBlockState(createAdminContext(rpc), {
      targetUserId: TARGET_USER_ID,
      action: "block",
      reasonCode: "policy_violation",
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        user: { accountStatus: "blocked" },
        auditEvent: { action: "account_blocked" },
      },
    });
    expect(rpc).toHaveBeenCalledWith("set_private_admin_user_block_state", {
      input_target_user_id: TARGET_USER_ID,
      input_action: "block",
      input_reason_code: "policy_violation",
    });
  });

  it("maps a transactional target miss to the stable public code", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0002", message: "raw" } });

    await expect(
      setAdminUserBlockState(createAdminContext(rpc), {
        targetUserId: "missing",
        action: "unblock",
        reasonCode: "owner_request",
      }),
    ).resolves.toEqual({ ok: false, error: { code: "target_not_found" } });
  });

  it("uses one atomic block-and-audit mutation without deleting private data", async () => {
    const mutateBlockState = vi.fn().mockResolvedValue(
      adminOk({
        user: createListItem("blocked"),
        auditEvent,
      }),
    );

    const result = await setAdminUserBlockState(
      createAdminContext(),
      {
        targetUserId: "user-1",
        action: "block",
        reasonCode: "policy_violation",
      },
      {
        mutateBlockState,
      },
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        user: {
          accountStatus: "blocked",
        },
      },
    });
    expect(mutateBlockState).toHaveBeenCalledWith(expect.any(Object), {
      targetUserId: "user-1",
      action: "block",
      reasonCode: "policy_violation",
    });
    expect(JSON.stringify(mutateBlockState.mock.calls)).not.toContain("session_messages");
    expect(JSON.stringify(mutateBlockState.mock.calls)).not.toContain("delete");
  });

  it("returns target_not_found and write_failed from the atomic mutation without raw errors", async () => {
    const targetMissing = await setAdminUserBlockState(
      createAdminContext(),
      {
        targetUserId: "missing",
        action: "unblock",
        reasonCode: "owner_request",
      },
      {
        mutateBlockState: vi.fn().mockResolvedValue(adminError("target_not_found")),
      },
    );

    expect(targetMissing).toEqual({
      ok: false,
      error: {
        code: "target_not_found",
      },
    });

    const mutationFailed = await setAdminUserBlockState(
      createAdminContext(),
      {
        targetUserId: "user-1",
        action: "unblock",
        reasonCode: "owner_request",
      },
      {
        mutateBlockState: vi.fn().mockResolvedValue(adminError("write_failed")),
      },
    );

    expect(mutationFailed).toEqual({
      ok: false,
      error: {
        code: "write_failed",
      },
    });
  });
});

describe("admin plan actions", () => {
  it("parses explicit grant and revoke payloads with plan reason codes only", () => {
    expect(parseAdminUserPlanInput(TARGET_USER_ID, { action: "grant", reasonCode: "subscription_paid" })).toEqual({
      ok: true,
      data: {
        targetUserId: TARGET_USER_ID,
        action: "grant",
        reasonCode: "subscription_paid",
      },
    });
    expect(
      parseAdminUserPlanInput(TARGET_USER_ID, { action: "revoke", reasonCode: "subscription_ended" }),
    ).toMatchObject({
      ok: true,
      data: {
        action: "revoke",
      },
    });
    // Block-only reasons are not valid plan reasons, and vice versa.
    expect(parseAdminUserPlanInput(TARGET_USER_ID, { action: "grant", reasonCode: "policy_violation" })).toEqual({
      ok: false,
      error: {
        code: "invalid_filter",
      },
    });
    expect(parseAdminUserPlanInput(TARGET_USER_ID, { action: "block", reasonCode: "subscription_paid" })).toEqual({
      ok: false,
      error: {
        code: "invalid_filter",
      },
    });
  });

  it("refuses to change the plan of the admin's own account without touching the repository", async () => {
    const mutatePlanState = vi.fn();

    const result = await setAdminUserPlanState(
      createAdminContext(),
      {
        targetUserId: ADMIN_USER_ID,
        action: "grant",
        reasonCode: "subscription_paid",
      },
      { mutatePlanState },
    );

    expect(result).toEqual({ ok: false, error: { code: "self_target_forbidden" } });
    expect(mutatePlanState).not.toHaveBeenCalled();
  });

  it("grants premium and writes a premium_granted audit event", async () => {
    const mutatePlanState = vi.fn().mockResolvedValue(
      adminOk({
        user: createListItem("active", "premium"),
        auditEvent: {
          ...auditEvent,
          action: "premium_granted",
          reasonCode: "subscription_paid",
        },
      }),
    );

    const result = await setAdminUserPlanState(
      createAdminContext(),
      {
        targetUserId: "user-1",
        action: "grant",
        reasonCode: "subscription_paid",
      },
      {
        mutatePlanState,
      },
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        user: {
          plan: "premium",
        },
        auditEvent: {
          action: "premium_granted",
        },
      },
    });
    expect(mutatePlanState).toHaveBeenCalledWith(expect.any(Object), {
      targetUserId: "user-1",
      action: "grant",
      reasonCode: "subscription_paid",
    });
    expect(JSON.stringify(mutatePlanState.mock.calls)).not.toContain("session_messages");
  });

  it("revokes premium with a premium_revoked audit event and maps failures to stable codes", async () => {
    const mutatePlanState = vi.fn().mockResolvedValue(
      adminOk({
        user: createListItem("active", "free"),
        auditEvent: {
          ...auditEvent,
          action: "premium_revoked",
          reasonCode: "subscription_ended",
        },
      }),
    );

    const revoked = await setAdminUserPlanState(
      createAdminContext(),
      {
        targetUserId: "user-1",
        action: "revoke",
        reasonCode: "subscription_ended",
      },
      {
        mutatePlanState,
      },
    );

    expect(revoked).toMatchObject({
      ok: true,
      data: {
        user: {
          plan: "free",
        },
      },
    });
    expect(mutatePlanState).toHaveBeenCalledWith(expect.any(Object), {
      targetUserId: "user-1",
      action: "revoke",
      reasonCode: "subscription_ended",
    });

    const targetMissing = await setAdminUserPlanState(
      createAdminContext(),
      {
        targetUserId: "missing",
        action: "grant",
        reasonCode: "subscription_paid",
      },
      {
        mutatePlanState: vi.fn().mockResolvedValue(adminError("target_not_found")),
      },
    );

    expect(targetMissing).toEqual({
      ok: false,
      error: {
        code: "target_not_found",
      },
    });
  });
});
