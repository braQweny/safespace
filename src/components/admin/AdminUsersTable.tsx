import { Ban, RotateCcw, Search } from "lucide-react";
import { useAdminUsers } from "@/components/hooks/useAdminUsers";
import type { AdminApiFailureCode, AdminUsersResponse } from "@/lib/admin/contracts";
import type { AdminBlockReasonCode, AdminUserListItem, AdminUserSort, AdminUserStatusFilter } from "@/lib/admin/types";

interface AdminUsersTableProps {
  initialResponse: AdminUsersResponse;
  currentAdminUserId: string;
}

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
    <div className="border-danger-line bg-danger-soft text-danger rounded-lg border p-4 text-sm">
      Nie udało się pobrać danych admina. Kod: {code}
    </div>
  );
}

export default function AdminUsersTable({ initialResponse, currentAdminUserId }: AdminUsersTableProps) {
  const {
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
  } = useAdminUsers(initialResponse);

  return (
    <section className="space-y-4">
      <form
        className="border-line grid gap-3 rounded-lg border bg-white p-4 lg:grid-cols-[minmax(0,1fr)_180px_220px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void refreshUsers(1);
        }}
      >
        <label className="text-ink-soft text-sm font-medium">
          Email
          <input
            type="search"
            name="q"
            value={emailSearch}
            onChange={(event) => {
              setEmailSearch(event.target.value);
            }}
            className="border-brand-soft text-ink focus:border-brand-strong focus:ring-line-accent mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2"
          />
        </label>
        <label className="text-ink-soft text-sm font-medium">
          Status
          <select
            name="status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as AdminUserStatusFilter);
            }}
            className="border-brand-soft text-ink focus:border-brand-strong focus:ring-line-accent mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-ink-soft text-sm font-medium">
          Sortowanie
          <select
            name="sort"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as AdminUserSort);
            }}
            className="border-brand-soft text-ink focus:border-brand-strong focus:ring-line-accent mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2"
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
          className="bg-brand-strong focus:ring-line-accent inline-flex h-10 items-center justify-center gap-2 self-end rounded-md px-4 text-sm font-medium text-white transition-colors hover:bg-[#1a4b44] focus:ring-2 focus:outline-none"
        >
          <Search aria-hidden="true" className="size-4" />
          Szukaj
        </button>
      </form>

      {errorCode ? <ErrorNotice code={errorCode} /> : null}

      <div className="border-line overflow-hidden rounded-lg border bg-white">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="text-ink-soft bg-[#edf3f1]">
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
                <td className="text-ink-muted px-4 py-5" colSpan={7}>
                  Brak użytkowników dla wybranych filtrów.
                </td>
              </tr>
            ) : (
              result.users.map((user) => {
                const isBlocked = user.accountStatus === "blocked";
                const isSelf = user.profile.userId === currentAdminUserId;

                return (
                  <tr key={user.profile.userId} className="border-surface-hover border-t" data-admin-user-row>
                    <td className="text-ink px-4 py-3 font-medium">{user.profile.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          isBlocked
                            ? "inline-flex rounded-md bg-[#f8e7e7] px-2 py-1 text-xs font-medium text-[#8a3434]"
                            : "text-brand-strong inline-flex rounded-md bg-[#e5f3ee] px-2 py-1 text-xs font-medium"
                        }
                      >
                        {getStatusLabel(user)}
                      </span>
                    </td>
                    <td className="text-ink-muted px-4 py-3">{formatDate(user.profile.accountCreatedAt)}</td>
                    <td className="text-ink-muted px-4 py-3">{formatDate(user.profile.lastActivityAt)}</td>
                    <td className="text-ink-muted px-4 py-3">
                      {user.counters.totalSessions} razem, {user.counters.activeSessions} aktywne
                    </td>
                    <td className="text-ink-muted px-4 py-3">{user.counters.approvedSummaries}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {!isBlocked ? (
                          <select
                            value={getReason(user.profile.userId)}
                            onChange={(event) => {
                              setReason(user.profile.userId, event.target.value as AdminBlockReasonCode);
                            }}
                            className="border-brand-soft text-ink h-9 rounded-md border bg-white px-2 text-xs"
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
                          className="border-brand-soft text-brand-strong hover:bg-surface-hover inline-flex h-9 items-center justify-center gap-2 rounded-md border bg-white px-3 text-xs font-medium transition-colors disabled:opacity-50"
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

      <div className="text-ink-muted flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
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
            className="border-brand-soft text-brand-strong h-9 rounded-md border bg-white px-3 text-sm font-medium disabled:opacity-50"
          >
            Poprzednia
          </button>
          <button
            type="button"
            disabled={!result.pagination.hasNextPage}
            onClick={() => {
              void refreshUsers(result.pagination.page + 1);
            }}
            className="border-brand-soft text-brand-strong h-9 rounded-md border bg-white px-3 text-sm font-medium disabled:opacity-50"
          >
            Następna
          </button>
        </div>
      </div>
    </section>
  );
}
