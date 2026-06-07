import { describe, expect, it, vi } from "vitest";
import { adminError, adminOk } from "@/lib/admin/errors";
import type { AdminAuditEvent, AdminContext, AdminUserListItem } from "@/lib/admin/types";
import {
  listAdminUsers,
  parseAdminUserBlockInput,
  parseAdminUserListFilters,
  setAdminUserBlockState,
  toAdminUserListResult,
} from "@/lib/admin/users";

const filters = {
  emailSearch: "anna@example.com",
  status: "blocked",
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
    },
  } as unknown as AdminContext;
}

function createListItem(status: "active" | "blocked" = "active"): AdminUserListItem {
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
      createdAt: "2026-06-01T10:00:00.000Z",
      updatedAt: "2026-06-07T10:00:00.000Z",
    },
    accountStatus: status,
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
      sort: "last_activity_desc",
      page: "2",
      pageSize: "10",
    });

    expect(parseAdminUserListFilters(params)).toEqual({
      ok: true,
      data: filters,
    });
  });

  it("rejects invalid filters with a stable code", () => {
    expect(parseAdminUserListFilters(new URLSearchParams({ status: "deleted" }))).toEqual({
      ok: false,
      error: {
        code: "invalid_filter",
      },
    });
  });
});

describe("admin users list", () => {
  it("maps safe user rows with counters and pagination", () => {
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
        total_sessions: "4",
        active_sessions: "1",
        completed_sessions: "3",
        approved_summaries: "2",
        total_count: "22",
      },
    ]);

    expect(result).toMatchObject({
      filters,
      users: [
        {
          accountStatus: "blocked",
          profile: {
            email: "anna@example.com",
          },
          counters: {
            totalSessions: 4,
            completedSessions: 3,
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

  it("reads users through the safe admin RPC", async () => {
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
