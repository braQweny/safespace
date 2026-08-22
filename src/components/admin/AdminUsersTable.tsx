import { Ban, CircleMinus, Crown, RotateCcw, Search } from "lucide-react";
import { useAdminUsers } from "@/components/hooks/useAdminUsers";
import type { AdminApiFailureCode, AdminUsersResponse } from "@/lib/admin/contracts";
import type {
  AdminBlockReasonCode,
  AdminUserListItem,
  AdminUserPlanFilter,
  AdminUserSort,
  AdminUserStatusFilter,
} from "@/lib/admin/types";

interface AdminUsersTableProps {
  initialResponse: AdminUsersResponse;
  currentAdminUserId: string;
}

const REASON_OPTIONS: { value: AdminBlockReasonCode; label: string }[] = [
  { value: "policy_violation", label: "Naruszenie zasad" },
  { value: "safety_risk", label: "Ryzyko bezpieczeństwa" },
  { value: "abuse_prevention", label: "Ochrona przed nadużyciem" },
  { value: "owner_request", label: "Decyzja właściciela" },
  { value: "other", label: "Inny powód" },
];

const STATUS_OPTIONS: { value: AdminUserStatusFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "active", label: "Aktywne" },
  { value: "blocked", label: "Zablokowane" },
];

const PLAN_OPTIONS: { value: AdminUserPlanFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "free", label: "Bezpłatny" },
  { value: "premium", label: "Premium" },
];

const SORT_OPTIONS: { value: AdminUserSort; label: string }[] = [
  { value: "created_desc", label: "Najnowsze konta" },
  { value: "created_asc", label: "Najstarsze konta" },
  { value: "last_activity_desc", label: "Ostatnia aktywność" },
  { value: "last_activity_asc", label: "Najdawniejsza aktywność" },
];

const SELECT_CLASS_NAME =
  "border-brand-soft text-ink focus:border-brand-strong focus:ring-line-accent mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2";

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

function getPlanLabel(user: AdminUserListItem) {
  return user.plan === "premium" ? "Premium" : "Bezpłatny";
}

function ErrorNotice({ code }: { code: AdminApiFailureCode }) {
  return (
    <div className="border-danger-line bg-danger-soft text-danger rounded-lg border p-4 text-sm">
      Nie udało się pobrać danych administracyjnych (kod: {code}). Spróbuj ponownie za chwilę.
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
  } = useAdminUsers(initialResponse);

  return (
    <section className="space-y-4">
      <form
        className="border-line grid gap-3 rounded-lg border bg-white p-4 lg:grid-cols-[minmax(0,1fr)_160px_160px_220px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void refreshUsers(1);
        }}
      >
        <label className="text-ink-soft text-sm font-medium">
          E-mail
          <input
            type="search"
            name="q"
            value={emailSearch}
            onChange={(event) => {
              setEmailSearch(event.target.value);
            }}
            className={SELECT_CLASS_NAME}
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
            className={SELECT_CLASS_NAME}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-ink-soft text-sm font-medium">
          Plan
          <select
            name="plan"
            value={plan}
            onChange={(event) => {
              setPlan(event.target.value as AdminUserPlanFilter);
            }}
            className={SELECT_CLASS_NAME}
          >
            {PLAN_OPTIONS.map((option) => (
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
            className={SELECT_CLASS_NAME}
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
        <table aria-label="Lista użytkowników" className="w-full min-w-[1000px] border-collapse text-left text-sm">
          <thead className="text-ink-soft bg-[#edf3f1]">
            <tr>
              <th className="px-4 py-3 font-semibold">E-mail</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Utworzone</th>
              <th className="px-4 py-3 font-semibold">Aktywność</th>
              <th className="px-4 py-3 font-semibold">Sesje</th>
              <th className="px-4 py-3 font-semibold">Podsumowania</th>
              <th className="px-4 py-3 font-semibold">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {result.users.length === 0 ? (
              <tr>
                <td className="text-ink-muted px-4 py-5" colSpan={8}>
                  Brak użytkowników dla wybranych filtrów.
                </td>
              </tr>
            ) : (
              result.users.map((user) => {
                const isBlocked = user.accountStatus === "blocked";
                const isPremium = user.plan === "premium";
                const isSelf = user.profile.userId === currentAdminUserId;
                const isPending = pendingUserId === user.profile.userId;

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
                    <td className="px-4 py-3">
                      <span
                        data-admin-user-plan={user.plan}
                        className={
                          isPremium
                            ? "inline-flex rounded-md bg-[#fbf1d9] px-2 py-1 text-xs font-medium text-[#7a5a0c]"
                            : "text-ink-muted inline-flex rounded-md bg-[#eef1f0] px-2 py-1 text-xs font-medium"
                        }
                      >
                        {getPlanLabel(user)}
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
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => {
                            void togglePlan(user);
                          }}
                          className="border-brand-soft text-brand-strong hover:bg-surface-hover inline-flex h-9 items-center justify-center gap-2 rounded-md border bg-white px-3 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          {isPremium ? (
                            <CircleMinus aria-hidden="true" className="size-4" />
                          ) : (
                            <Crown aria-hidden="true" className="size-4" />
                          )}
                          {isPremium ? "Odbierz premium" : "Nadaj premium"}
                        </button>
                        {!isBlocked ? (
                          <select
                            value={getReason(user.profile.userId)}
                            aria-label="Powód blokady"
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
                          disabled={isSelf || isPending}
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
