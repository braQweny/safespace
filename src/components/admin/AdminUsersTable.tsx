import { Ban, RotateCcw, Search } from "lucide-react";
import { useState } from "react";
import type { AdminApiFailureCode, AdminUsersResponse } from "@/lib/admin/contracts";
import type {
  AdminBlockReasonCode,
  AdminUserListItem,
  AdminUserListResult,
  AdminUserSort,
  AdminUserStatusFilter,
} from "@/lib/admin/types";

interface AdminUsersTableProps {
  initialResponse: AdminUsersResponse;
  currentAdminUserId: string;
}

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

const REASON_OPTIONS: { value: AdminBlockReasonCode; label: string }[] = [
  { value: "policy_violation", label: "Naruszenie zasad" },
  { value: "safety_risk", label: "Ryzyko bezpieczeństwa" },
  { value: "abuse_prevention", label: "Ochrona przed nadużyciem" },
  { value: "owner_request", label: "Decyzja ownera" },
  { value: "other", label: "Inny powód" },
];

const STATUS_OPTIONS: { value: AdminUserStatusFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "active", label: "Aktywne" },
  { value: "blocked", label: "Zablokowane" },
];

const SORT_OPTIONS: { value: AdminUserSort; label: string }[] = [
  { value: "created_desc", label: "Najnowsze konta" },
  { value: "created_asc", label: "Najstarsze konta" },
  { value: "last_activity_desc", label: "Ostatnia aktywność" },
  { value: "last_activity_asc", label: "Najdawniejsza aktywność" },
];

function getInitialResult(response: AdminUsersResponse) {
  return response.ok ? response.result : DEFAULT_RESULT;
}

function getInitialError(response: AdminUsersResponse) {
  return response.ok ? null : response.code;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Brak";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function getStatusLabel(user: AdminUserListItem) {
  return user.accountStatus === "blocked" ? "Zablokowane" : "Aktywne";
}

function ErrorNotice({ code }: { code: AdminApiFailureCode }) {
  return (
    <div className="rounded-lg border border-[#f0c7c7] bg-[#fff8f8] p-4 text-sm text-[#7d2d2d]">
      Nie udało się pobrać danych admina. Kod: {code}
    </div>
  );
}

export default function AdminUsersTable({ initialResponse, currentAdminUserId }: AdminUsersTableProps) {
  const [result, setResult] = useState(() => getInitialResult(initialResponse));
  const [emailSearch, setEmailSearch] = useState(result.filters.emailSearch);
  const [status, setStatus] = useState<AdminUserStatusFilter>(result.filters.status);
  const [sort, setSort] = useState<AdminUserSort>(result.filters.sort);
  const [reasonByUser, setReasonByUser] = useState<Record<string, AdminBlockReasonCode>>({});
  const [errorCode, setErrorCode] = useState<AdminApiFailureCode | null>(() => getInitialError(initialResponse));
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  async function refreshUsers(nextPage = 1) {
    const params = new URLSearchParams({
      q: emailSearch,
      status,
      sort,
      page: String(nextPage),
      pageSize: String(result.filters.pageSize),
    });
    const response = await fetch(`/api/admin/users?${params.toString()}`, {
      headers: {
        Accept: "application/json",
      },
    });
    const body = (await response.json()) as AdminUsersResponse;

    if (body.ok) {
      setResult(body.result);
      setErrorCode(null);
      return;
    }

    setErrorCode(body.code);
  }

  async function toggleBlock(user: AdminUserListItem) {
    const action = user.accountStatus === "blocked" ? "unblock" : "block";
    const reasonCode = reasonByUser[user.profile.userId] ?? "policy_violation";
    setPendingUserId(user.profile.userId);

    try {
      const response = await fetch(`/api/admin/users/${user.profile.userId}/block`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          reasonCode,
        }),
      });
      const body = (await response.json()) as { ok: boolean; code?: AdminApiFailureCode };

      if (!body.ok) {
        setErrorCode(body.code ?? "write_failed");
        return;
      }

      await refreshUsers(result.pagination.page);
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <section className="space-y-4">
      <form
        className="grid gap-3 rounded-lg border border-[#d7e2df] bg-white p-4 lg:grid-cols-[minmax(0,1fr)_180px_220px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void refreshUsers(1);
        }}
      >
        <label className="text-sm font-medium text-[#344f48]">
          Email
          <input
            type="search"
            name="q"
            value={emailSearch}
            onChange={(event) => {
              setEmailSearch(event.target.value);
            }}
            className="mt-1 h-10 w-full rounded-md border border-[#b8c9c5] bg-white px-3 text-sm text-[#10231f] outline-none focus:border-[#235d54] focus:ring-2 focus:ring-[#8fbdb4]"
          />
        </label>
        <label className="text-sm font-medium text-[#344f48]">
          Status
          <select
            name="status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as AdminUserStatusFilter);
            }}
            className="mt-1 h-10 w-full rounded-md border border-[#b8c9c5] bg-white px-3 text-sm text-[#10231f] outline-none focus:border-[#235d54] focus:ring-2 focus:ring-[#8fbdb4]"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[#344f48]">
          Sortowanie
          <select
            name="sort"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as AdminUserSort);
            }}
            className="mt-1 h-10 w-full rounded-md border border-[#b8c9c5] bg-white px-3 text-sm text-[#10231f] outline-none focus:border-[#235d54] focus:ring-2 focus:ring-[#8fbdb4]"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-md bg-[#235d54] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1a4b44] focus:ring-2 focus:ring-[#8fbdb4] focus:outline-none"
        >
          <Search aria-hidden="true" className="size-4" />
          Szukaj
        </button>
      </form>

      {errorCode ? <ErrorNotice code={errorCode} /> : null}

      <div className="overflow-hidden rounded-lg border border-[#d7e2df] bg-white">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="bg-[#edf3f1] text-[#344f48]">
            <tr>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Utworzone</th>
              <th className="px-4 py-3 font-semibold">Aktywność</th>
              <th className="px-4 py-3 font-semibold">Sesje</th>
              <th className="px-4 py-3 font-semibold">Podsumowania</th>
              <th className="px-4 py-3 font-semibold">Akcja</th>
            </tr>
          </thead>
          <tbody>
            {result.users.length === 0 ? (
              <tr>
                <td className="px-4 py-5 text-[#52645f]" colSpan={7}>
                  Brak użytkowników dla wybranych filtrów.
                </td>
              </tr>
            ) : (
              result.users.map((user) => {
                const isBlocked = user.accountStatus === "blocked";
                const isSelf = user.profile.userId === currentAdminUserId;

                return (
                  <tr key={user.profile.userId} className="border-t border-[#edf2f0]" data-admin-user-row>
                    <td className="px-4 py-3 font-medium text-[#10231f]">{user.profile.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          isBlocked
                            ? "inline-flex rounded-md bg-[#f8e7e7] px-2 py-1 text-xs font-medium text-[#8a3434]"
                            : "inline-flex rounded-md bg-[#e5f3ee] px-2 py-1 text-xs font-medium text-[#235d54]"
                        }
                      >
                        {getStatusLabel(user)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#52645f]">{formatDate(user.profile.accountCreatedAt)}</td>
                    <td className="px-4 py-3 text-[#52645f]">{formatDate(user.profile.lastActivityAt)}</td>
                    <td className="px-4 py-3 text-[#52645f]">
                      {user.counters.totalSessions} razem, {user.counters.activeSessions} aktywne
                    </td>
                    <td className="px-4 py-3 text-[#52645f]">{user.counters.approvedSummaries}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {!isBlocked ? (
                          <select
                            value={reasonByUser[user.profile.userId] ?? "policy_violation"}
                            onChange={(event) => {
                              setReasonByUser((current) => ({
                                ...current,
                                [user.profile.userId]: event.target.value as AdminBlockReasonCode,
                              }));
                            }}
                            className="h-9 rounded-md border border-[#b8c9c5] bg-white px-2 text-xs text-[#10231f]"
                          >
                            {REASON_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <button
                          type="button"
                          disabled={isSelf || pendingUserId === user.profile.userId}
                          onClick={() => {
                            void toggleBlock(user);
                          }}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[#b8c9c5] bg-white px-3 text-xs font-medium text-[#235d54] transition-colors hover:bg-[#eef4f2] disabled:opacity-50"
                        >
                          {isBlocked ? (
                            <RotateCcw aria-hidden="true" className="size-4" />
                          ) : (
                            <Ban aria-hidden="true" className="size-4" />
                          )}
                          {isBlocked ? "Odblokuj" : "Zablokuj"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 text-sm text-[#52645f] sm:flex-row sm:items-center sm:justify-between">
        <span>
          Strona {result.pagination.page}, użytkowników: {result.pagination.totalCount}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!result.pagination.hasPreviousPage}
            onClick={() => {
              void refreshUsers(result.pagination.page - 1);
            }}
            className="h-9 rounded-md border border-[#b8c9c5] bg-white px-3 text-sm font-medium text-[#235d54] disabled:opacity-50"
          >
            Poprzednia
          </button>
          <button
            type="button"
            disabled={!result.pagination.hasNextPage}
            onClick={() => {
              void refreshUsers(result.pagination.page + 1);
            }}
            className="h-9 rounded-md border border-[#b8c9c5] bg-white px-3 text-sm font-medium text-[#235d54] disabled:opacity-50"
          >
            Następna
          </button>
        </div>
      </div>
    </section>
  );
}
