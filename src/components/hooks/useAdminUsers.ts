import { useEffect, useRef, useState } from "react";
import { requestApiJson } from "@/lib/api-client";
import {
  isAdminApiFailure,
  isAdminUserBlockSuccess,
  isAdminUserPlanSuccess,
  isAdminUsersSuccess,
  type AdminApiFailureCode,
  type AdminUsersResponse,
} from "@/lib/admin/contracts";
import type {
  AdminBlockReasonCode,
  AdminPlanReasonCode,
  AdminUserListItem,
  AdminUserListResult,
  AdminUserPlanFilter,
  AdminUserSort,
  AdminUserStatusFilter,
} from "@/lib/admin/types";

export const DEFAULT_BLOCK_REASON: AdminBlockReasonCode = "policy_violation";

/**
 * Plan changes carry a fixed reason per direction: premium is granted because
 * a subscription was paid and revoked because it ended. Other reasons stay
 * available to the API for owner-driven changes, but the table does not ask
 * the admin to pick one on every click.
 */
export const PLAN_REASON_BY_ACTION: Record<"grant" | "revoke", AdminPlanReasonCode> = {
  grant: "subscription_paid",
  revoke: "subscription_ended",
};

const DEFAULT_RESULT: AdminUserListResult = {
  filters: {
    emailSearch: "",
    status: "all",
    plan: "all",
    sort: "created_desc",
    page: 1,
    pageSize: 20,
  },
  users: [],
  pagination: {
    page: 1,
    pageSize: 20,
    totalCount: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  },
};

export function getInitialAdminUsersResult(response: AdminUsersResponse) {
  return response.ok ? response.result : DEFAULT_RESULT;
}

export function getInitialAdminUsersError(response: AdminUsersResponse) {
  return response.ok ? null : response.code;
}

export function buildAdminUsersQuery(filters: {
  emailSearch: string;
  status: AdminUserStatusFilter;
  plan: AdminUserPlanFilter;
  sort: AdminUserSort;
  page: number;
  pageSize: number;
}) {
  return new URLSearchParams({
    q: filters.emailSearch,
    status: filters.status,
    plan: filters.plan,
    sort: filters.sort,
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });
}

export function useAdminUsers(initialResponse: AdminUsersResponse) {
  const [result, setResult] = useState(() => getInitialAdminUsersResult(initialResponse));
  const [emailSearch, setEmailSearch] = useState(result.filters.emailSearch);
  const [status, setStatus] = useState<AdminUserStatusFilter>(result.filters.status);
  const [plan, setPlan] = useState<AdminUserPlanFilter>(result.filters.plan);
  const [sort, setSort] = useState<AdminUserSort>(result.filters.sort);
  const [reasonByUser, setReasonByUser] = useState<Record<string, AdminBlockReasonCode>>({});
  const [errorCode, setErrorCode] = useState<AdminApiFailureCode | null>(() =>
    getInitialAdminUsersError(initialResponse),
  );
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const listAbortRef = useRef<AbortController | null>(null);
  // Block/unblock and plan changes are server-side effects, so they are
  // aborted only on unmount — never by a newer list refresh.
  const mutationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      listAbortRef.current?.abort();
      mutationAbortRef.current?.abort();
    };
  }, []);

  function getReason(userId: string) {
    return reasonByUser[userId] ?? DEFAULT_BLOCK_REASON;
  }

  function setReason(userId: string, reason: AdminBlockReasonCode) {
    setReasonByUser((current) => ({
      ...current,
      [userId]: reason,
    }));
  }

  async function refreshUsers(nextPage = 1) {
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;

    const params = buildAdminUsersQuery({
      emailSearch,
      status,
      plan,
      sort,
      page: nextPage,
      pageSize: result.filters.pageSize,
    });
    const response = await requestApiJson(`/api/admin/users?${params.toString()}`, {
      signal: controller.signal,
    });

    if (controller.signal.aborted || response.kind === "network_error") {
      return;
    }

    const body = response.body;

    if (isAdminUsersSuccess(body)) {
      setResult(body.result);
      setErrorCode(null);
      return;
    }

    setErrorCode(isAdminApiFailure(body) ? body.code : "admin_data_unavailable");
  }

  async function runUserMutation(
    userId: string,
    path: string,
    payload: Record<string, string>,
    isSuccess: (body: unknown) => boolean,
  ) {
    const controller = new AbortController();
    mutationAbortRef.current = controller;
    setPendingUserId(userId);

    try {
      const response = await requestApiJson(`/api/admin/users/${userId}/${path}`, {
        method: "POST",
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (controller.signal.aborted || response.kind === "network_error") {
        return;
      }

      const body = response.body;

      if (!isSuccess(body)) {
        setErrorCode(isAdminApiFailure(body) ? body.code : "write_failed");
        return;
      }

      await refreshUsers(result.pagination.page);
    } finally {
      setPendingUserId(null);
    }
  }

  async function toggleBlock(user: AdminUserListItem) {
    const action = user.accountStatus === "blocked" ? "unblock" : "block";

    await runUserMutation(
      user.profile.userId,
      "block",
      {
        action,
        reasonCode: getReason(user.profile.userId),
      },
      isAdminUserBlockSuccess,
    );
  }

  async function togglePlan(user: AdminUserListItem) {
    const action = user.plan === "premium" ? "revoke" : "grant";

    await runUserMutation(
      user.profile.userId,
      "plan",
      {
        action,
        reasonCode: PLAN_REASON_BY_ACTION[action],
      },
      isAdminUserPlanSuccess,
    );
  }

  return {
    result,
    emailSearch,
    setEmailSearch,
    status,
    setStatus,
    plan,
    setPlan,
    sort,
    setSort,
    errorCode,
    pendingUserId,
    getReason,
    setReason,
    refreshUsers,
    toggleBlock,
    togglePlan,
  };
}
