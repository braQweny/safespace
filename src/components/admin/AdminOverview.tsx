import type { AdminOverviewMetrics, PrivacySafeCount } from "@/lib/admin/types";
import type { Locale } from "@/lib/i18n/locale";
import { getAdminCopy } from "./admin-copy";

interface AdminOverviewProps {
  /** Komponent renderowany tylko na serwerze, więc język idzie propsem, bez providera. */
  locale: Locale;
  metrics: AdminOverviewMetrics;
}

function formatCount(count: PrivacySafeCount | number) {
  return typeof count === "number" ? String(count) : count.label;
}

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <section className="border-line bg-surface rounded-lg border p-4">
      <p className="text-ink-muted text-sm font-medium">{label}</p>
      <p className="text-ink mt-2 text-3xl font-semibold">{value}</p>
      {note ? <p className="text-ink-muted mt-2 text-sm leading-5">{note}</p> : null}
    </section>
  );
}

export default function AdminOverview({ locale, metrics }: AdminOverviewProps) {
  const copy = getAdminCopy(locale).overview;
  const lifecycleEntries = Object.entries(metrics.sessionsByLifecycle);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label={copy.mainStatsAria}>
        <StatTile label={copy.users} value={formatCount(metrics.totalUsers)} />
        <StatTile label={copy.premium} value={formatCount(metrics.premiumUsers)} note={copy.premiumNote} />
        <StatTile label={copy.blocked} value={formatCount(metrics.blockedUsers)} />
        <StatTile label={copy.activeSessions} value={formatCount(metrics.activeSessions)} note={copy.activeNote} />
        <StatTile
          label={copy.completedSessions}
          value={formatCount(metrics.completedSessions)}
          note={copy.completedNote}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="border-line bg-surface rounded-lg border p-4">
          <h2 className="text-ink text-base font-semibold">{copy.lifecycleTitle}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {lifecycleEntries.map(([status, count]) => (
              <div key={status} className="border-surface-hover flex items-center justify-between border-b py-2">
                <span className="text-ink-muted text-sm">{copy.lifecycleLabels[status] ?? status}</span>
                <span className="text-ink text-sm font-semibold">{formatCount(count)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-line bg-surface rounded-lg border p-4">
          <h2 className="text-ink text-base font-semibold">{copy.otherTitle}</h2>
          <dl className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted text-sm">{copy.trialSessions}</dt>
              <dd className="text-ink text-sm font-semibold">{formatCount(metrics.trialSessions)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted text-sm">{copy.followUpSessions}</dt>
              <dd className="text-ink text-sm font-semibold">{formatCount(metrics.followUpSessions)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted text-sm">{copy.approvedSummaries}</dt>
              <dd className="text-ink text-sm font-semibold">{formatCount(metrics.approvedSummaries)}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
