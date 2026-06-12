import { describe, expect, it } from "vitest";
import type { AdminUsersResponse } from "@/lib/admin/contracts";
import {
  DEFAULT_BLOCK_REASON,
  buildAdminUsersQuery,
  getInitialAdminUsersError,
  getInitialAdminUsersResult,
} from "../useAdminUsers";

const successResponse = {
  ok: true,
  type: "admin_users",
  result: {
    filters: {
      emailSearch: "kowalski",
      status: "blocked",
      sort: "last_activity_desc",
      page: 2,
      pageSize: 20,
    },
    users: [],
    pagination: {
      page: 2,
      pageSize: 20,
      totalCount: 21,
      hasNextPage: false,
      hasPreviousPage: true,
    },
  },
} satisfies AdminUsersResponse;

const failureResponse: AdminUsersResponse = {
  ok: false,
  type: "admin_error",
  code: "admin_data_unavailable",
};

describe("useAdminUsers helpers", () => {
  it("seeds state from a successful response", () => {
    expect(getInitialAdminUsersResult(successResponse)).toBe(successResponse.result);
    expect(getInitialAdminUsersError(successResponse)).toBeNull();
  });

  it("falls back to an empty result and surfaces the code on failure", () => {
    const result = getInitialAdminUsersResult(failureResponse);

    expect(result.users).toEqual([]);
    expect(result.pagination.totalCount).toBe(0);
    expect(getInitialAdminUsersError(failureResponse)).toBe("admin_data_unavailable");
  });

  it("builds the users query from the active filters", () => {
    const params = buildAdminUsersQuery({
      emailSearch: "kowalski",
      status: "blocked",
      sort: "last_activity_desc",
      page: 3,
      pageSize: 20,
    });

    expect(params.get("q")).toBe("kowalski");
    expect(params.get("status")).toBe("blocked");
    expect(params.get("sort")).toBe("last_activity_desc");
    expect(params.get("page")).toBe("3");
    expect(params.get("pageSize")).toBe("20");
  });

  it("defaults the block reason to policy_violation", () => {
    expect(DEFAULT_BLOCK_REASON).toBe("policy_violation");
  });
});
