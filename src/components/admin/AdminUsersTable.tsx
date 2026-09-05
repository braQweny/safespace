import { Ban, CircleMinus, Crown, RotateCcw, Search } from "lucide-react";
import { useAdminUsers } from "@/components/hooks/useAdminUsers";
import type { AdminApiFailureCode, AdminUsersResponse } from "@/lib/admin/contracts";
import type {
  AdminBlockReasonCode,
  AdminUserPlanFilter,
  AdminUserSort,
  AdminUserStatusFilter,
} from "@/lib/admin/types";
import { formatDay } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locale";
import { getAdminCopy } from "./admin-copy";

interface AdminUsersTableProps {
  locale: Locale;
  initialResponse: AdminUsersResponse;
  currentAdminUserId: string;
}

const SELECT_CLASS_NAME =
  "border-brand-soft text-ink focus:border-brand-strong focus:ring-line-accent mt-1 h-10 w-full rounded-md border bg-surface px-3 text-sm outline-none focus:ring-2";

function formatDate(locale: Locale, value: string | null) {
  if (!value) {
    return getAdminCopy(locale).table.none;
  }

  return formatDay(locale, new Date(value));
}

export function getAdminUsersErrorMessage(locale: Locale, code: AdminApiFailureCode) {
  const { table } = getAdminCopy(locale);

  return table.errors[code] ?? table.defaultError;
}

function ErrorNotice({ locale, code }: { locale: Locale; code: AdminApiFailureCode }) {
  return (
    <div className="border-danger-line bg-danger-soft text-danger rounded-lg border p-4 text-sm">
      {getAdminUsersErrorMessage(locale, code)} {getAdminCopy(locale).table.errorCode(code)}
    </div>
  );
}

export default function AdminUsersTable({ locale, initialResponse, currentAdminUserId }: AdminUsersTableProps) {
  const copy = getAdminCopy(locale).table;
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
        className="border-line bg-surface grid gap-3 rounded-lg border p-4 lg:grid-cols-[minmax(0,1fr)_160px_160px_220px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void refreshUsers(1);
        }}
      >
        <label className="text-ink-soft text-sm font-medium">
          {copy.emailLabel}
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
          {copy.statusLabel}
          <select
            name="status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as AdminUserStatusFilter);
            }}
            className={SELECT_CLASS_NAME}
          >
            {copy.statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-ink-soft text-sm font-medium">
          {copy.planLabel}
          <select
            name="plan"
            value={plan}
            onChange={(event) => {
              setPlan(event.target.value as AdminUserPlanFilter);
            }}
            className={SELECT_CLASS_NAME}
          >
            {copy.planOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-ink-soft text-sm font-medium">
          {copy.sortLabel}
          <select
            name="sort"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as AdminUserSort);
            }}
            className={SELECT_CLASS_NAME}
          >
            {copy.sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="bg-brand-strong text-surface focus-visible:ring-brand-ring hover:bg-brand-deep inline-flex h-11 items-center justify-center gap-2 self-end rounded-md px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
        >
          <Search aria-hidden="true" className="size-4" />
          {copy.search}
        </button>
      </form>

      {errorCode ? <ErrorNotice locale={locale} code={errorCode} /> : null}

      <div className="border-line bg-surface overflow-x-auto rounded-lg border">
        <table aria-label={copy.tableAria} className="w-full min-w-[1000px] border-collapse text-left text-sm">
          <thead className="text-ink-soft bg-brand-tint">
            <tr>
              <th className="px-4 py-3 font-semibold">{copy.headers.email}</th>
              <th className="px-4 py-3 font-semibold">{copy.headers.status}</th>
              <th className="px-4 py-3 font-semibold">{copy.headers.plan}</th>
              <th className="px-4 py-3 font-semibold">{copy.headers.created}</th>
              <th className="px-4 py-3 font-semibold">{copy.headers.activity}</th>
              <th className="px-4 py-3 font-semibold">{copy.headers.sessions}</th>
              <th className="px-4 py-3 font-semibold">{copy.headers.summaries}</th>
              <th className="px-4 py-3 font-semibold">{copy.headers.actions}</th>
            </tr>
          </thead>
          <tbody>
            {result.users.length === 0 ? (
              <tr>
                <td className="text-ink-muted px-4 py-5" colSpan={8}>
                  {copy.empty}
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
                            ? "bg-danger-soft text-danger inline-flex rounded-md px-2 py-1 text-xs font-medium"
                            : "text-brand-strong bg-brand-tint inline-flex rounded-md px-2 py-1 text-xs font-medium"
                        }
                      >
                        {isBlocked ? copy.statusBlocked : copy.statusActive}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        data-admin-user-plan={user.plan}
                        className={
                          isPremium
                            ? "bg-warn-soft text-warn inline-flex rounded-md px-2 py-1 text-xs font-medium"
                            : "text-ink-muted bg-surface-soft inline-flex rounded-md px-2 py-1 text-xs font-medium"
                        }
                      >
                        {isPremium ? copy.planPremium : copy.planFree}
                      </span>
                    </td>
                    <td className="text-ink-muted px-4 py-3">{formatDate(locale, user.profile.accountCreatedAt)}</td>
                    <td className="text-ink-muted px-4 py-3">{formatDate(locale, user.profile.lastActivityAt)}</td>
                    <td className="text-ink-muted px-4 py-3">
                      {copy.sessionsCell(user.counters.totalSessions, user.counters.activeSessions)}
                    </td>
                    <td className="text-ink-muted px-4 py-3">{user.counters.approvedSummaries}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isSelf || isPending}
                          onClick={() => {
                            void togglePlan(user);
                          }}
                          className="border-brand-soft text-brand-strong hover:bg-surface-hover bg-surface inline-flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          {isPremium ? (
                            <CircleMinus aria-hidden="true" className="size-4" />
                          ) : (
                            <Crown aria-hidden="true" className="size-4" />
                          )}
                          {isPremium ? copy.revokePremium : copy.grantPremium}
                        </button>
                        {!isBlocked ? (
                          <select
                            value={getReason(user.profile.userId)}
                            aria-label={copy.blockReasonAria}
                            onChange={(event) => {
                              setReason(user.profile.userId, event.target.value as AdminBlockReasonCode);
                            }}
                            className="border-brand-soft text-ink bg-surface h-11 rounded-md border px-2 text-xs"
                          >
                            {copy.reasonOptions.map((option) => (
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
                          className="border-brand-soft text-brand-strong hover:bg-surface-hover bg-surface inline-flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          {isBlocked ? (
                            <RotateCcw aria-hidden="true" className="size-4" />
                          ) : (
                            <Ban aria-hidden="true" className="size-4" />
                          )}
                          {isBlocked ? copy.unblock : copy.block}
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
        <span>{copy.pageSummary(result.pagination.page, result.pagination.totalCount)}</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!result.pagination.hasPreviousPage}
            onClick={() => {
              void refreshUsers(result.pagination.page - 1);
            }}
            className="border-brand-soft text-brand-strong bg-surface h-11 rounded-md border px-3 text-sm font-medium disabled:opacity-50"
          >
            {copy.previous}
          </button>
          <button
            type="button"
            disabled={!result.pagination.hasNextPage}
            onClick={() => {
              void refreshUsers(result.pagination.page + 1);
            }}
            className="border-brand-soft text-brand-strong bg-surface h-11 rounded-md border px-3 text-sm font-medium disabled:opacity-50"
          >
            {copy.next}
          </button>
        </div>
      </div>
    </section>
  );
}
