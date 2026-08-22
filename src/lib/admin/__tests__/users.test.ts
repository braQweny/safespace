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

function createAdminContext(rpc = vi.fn()): AdminContext {
  return {
    supabase: {
      rpc,
    },
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
    expect(parseAdminUserBlockInput("user-1", { action: "block", reasonCode: "policy_violation" })).toEqual({
      ok: true,
      data: {
        targetUserId: "user-1",
        action: "block",
        reasonCode: "policy_violation",
      },
    });
    expect(parseAdminUserBlockInput("user-1", { action: "delete", reasonCode: "policy_violation" })).toEqual({
      ok: false,
      error: {
        code: "invalid_filter",
      },
    });
  });

  it("blocks users and writes audit intent without deleting private data", async () => {
    const updateBlockState = vi.fn().mockResolvedValue(adminOk(createListItem("blocked")));
    const writeAuditEvent = vi.fn().mockResolvedValue(adminOk(auditEvent));

    const result = await setAdminUserBlockState(
      createAdminContext(),
      {
        targetUserId: "user-1",
        action: "block",
        reasonCode: "policy_violation",
      },
      {
        updateBlockState,
        writeAuditEvent,
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
    expect(writeAuditEvent).toHaveBeenCalledWith(expect.any(Object), {
      targetUserId: "user-1",
      action: "account_blocked",
      reasonCode: "policy_violation",
    });
    expect(JSON.stringify(updateBlockState.mock.calls)).not.toContain("session_messages");
    expect(JSON.stringify(updateBlockState.mock.calls)).not.toContain("delete");
  });

  it("returns target_not_found and write_failed without raw errors", async () => {
    const targetMissing = await setAdminUserBlockState(
      createAdminContext(),
      {
        targetUserId: "missing",
        action: "unblock",
        reasonCode: "owner_request",
      },
      {
        updateBlockState: vi.fn().mockResolvedValue(adminError("target_not_found")),
        writeAuditEvent: vi.fn(),
      },
    );

    expect(targetMissing).toEqual({
      ok: false,
      error: {
        code: "target_not_found",
      },
    });

    const auditFailed = await setAdminUserBlockState(
      createAdminContext(),
      {
        targetUserId: "user-1",
        action: "unblock",
        reasonCode: "owner_request",
      },
      {
        updateBlockState: vi.fn().mockResolvedValue(adminOk(createListItem("active"))),
        writeAuditEvent: vi.fn().mockResolvedValue(adminError("write_failed")),
      },
    );

    expect(auditFailed).toEqual({
      ok: false,
      error: {
        code: "write_failed",
      },
    });
  });
});

describe("admin plan actions", () => {
  it("parses explicit grant and revoke payloads with plan reason codes only", () => {
    expect(parseAdminUserPlanInput("user-1", { action: "grant", reasonCode: "subscription_paid" })).toEqual({
      ok: true,
      data: {
        targetUserId: "user-1",
        action: "grant",
        reasonCode: "subscription_paid",
      },
    });
    expect(parseAdminUserPlanInput("user-1", { action: "revoke", reasonCode: "subscription_ended" })).toMatchObject({
      ok: true,
      data: {
        action: "revoke",
      },
    });
    // Block-only reasons are not valid plan reasons, and vice versa.
    expect(parseAdminUserPlanInput("user-1", { action: "grant", reasonCode: "policy_violation" })).toEqual({
      ok: false,
      error: {
        code: "invalid_filter",
      },
    });
    expect(parseAdminUserPlanInput("user-1", { action: "block", reasonCode: "subscription_paid" })).toEqual({
      ok: false,
      error: {
        code: "invalid_filter",
      },
    });
    expect(parseAdminUserPlanInput(undefined, { action: "grant", reasonCode: "subscription_paid" })).toEqual({
      ok: false,
      error: {
        code: "invalid_filter",
      },
    });
  });

  it("grants premium and writes a premium_granted audit event", async () => {
    const updatePlanState = vi.fn().mockResolvedValue(adminOk(createListItem("active", "premium")));
    const writeAuditEvent = vi.fn().mockResolvedValue(
      adminOk({
        ...auditEvent,
        action: "premium_granted",
        reasonCode: "subscription_paid",
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
        updatePlanState,
        writeAuditEvent,
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
    expect(writeAuditEvent).toHaveBeenCalledWith(expect.any(Object), {
      targetUserId: "user-1",
      action: "premium_granted",
      reasonCode: "subscription_paid",
    });
    expect(JSON.stringify(updatePlanState.mock.calls)).not.toContain("session_messages");
  });

  it("revokes premium with a premium_revoked audit event and maps failures to stable codes", async () => {
    const writeAuditEvent = vi.fn().mockResolvedValue(
      adminOk({
        ...auditEvent,
        action: "premium_revoked",
        reasonCode: "subscription_ended",
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
        updatePlanState: vi.fn().mockResolvedValue(adminOk(createListItem("active", "free"))),
        writeAuditEvent,
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
    expect(writeAuditEvent).toHaveBeenCalledWith(expect.any(Object), {
      targetUserId: "user-1",
      action: "premium_revoked",
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
        updatePlanState: vi.fn().mockResolvedValue(adminError("target_not_found")),
        writeAuditEvent: vi.fn(),
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
