import { useEffect, useRef, useState } from "react";
import { requestApiJson } from "@/lib/api-client";
import {
  isAdminApiFailure,
  isAdminUserBlockSuccess,
  isAdminUsersSuccess,
  type AdminApiFailureCode,
  type AdminUsersResponse,
} from "@/lib/admin/contracts";
import type {
  AdminBlockReasonCode,
  AdminUserListItem,
  AdminUserListResult,
  AdminUserSort,
  AdminUserStatusFilter,
} from "@/lib/admin/types";

export const DEFAULT_BLOCK_REASON: AdminBlockReasonCode = "policy_violation";

const DEFAULT_RESULT: AdminUserListResult = {
  filters: {
    emailSearch: "",
    status: "all",
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
  sort: AdminUserSort;
  page: number;
  pageSize: number;
}) {
  return new URLSearchParams({
    q: filters.emailSearch,
    status: filters.status,
    sort: filters.sort,
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });
}

export function useAdminUsers(initialResponse: AdminUsersResponse) {
  const [result, setResult] = useState(() => getInitialAdminUsersResult(initialResponse));
  const [emailSearch, setEmailSearch] = useState(result.filters.emailSearch);
  const [status, setStatus] = useState<AdminUserStatusFilter>(result.filters.status);
  const [sort, setSort] = useState<AdminUserSort>(result.filters.sort);
  const [reasonByUser, setReasonByUser] = useState<Record<string, AdminBlockReasonCode>>({});
  const [errorCode, setErrorCode] = useState<AdminApiFailureCode | null>(() =>
    getInitialAdminUsersError(initialResponse),
  );
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const listAbortRef = useRef<AbortController | null>(null);
  // Block/unblock is a server-side effect, so it is aborted only on unmount —
  // never by a newer list refresh.
  const blockAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      listAbortRef.current?.abort();
      blockAbortRef.current?.abort();
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

  async function toggleBlock(user: AdminUserListItem) {
    const action = user.accountStatus === "blocked" ? "unblock" : "block";
    const reasonCode = getReason(user.profile.userId);
    const controller = new AbortController();
    blockAbortRef.current = controller;
    setPendingUserId(user.profile.userId);

    try {
      const response = await requestApiJson(`/api/admin/users/${user.profile.userId}/block`, {
        method: "POST",
        body: JSON.stringify({
          action,
          reasonCode,
        }),
        signal: controller.signal,
      });

      if (controller.signal.aborted || response.kind === "network_error") {
        return;
      }

      const body = response.body;

      if (!isAdminUserBlockSuccess(body)) {
        setErrorCode(isAdminApiFailure(body) ? body.code : "write_failed");
        return;
      }

      await refreshUsers(result.pagination.page);
    } finally {
      setPendingUserId(null);
    }
  }

  return {
    result,
    emailSearch,
    setEmailSearch,
    status,
    setStatus,
    sort,
    setSort,
    errorCode,
    pendingUserId,
    getReason,
    setReason,
    refreshUsers,
    toggleBlock,
  };
}
