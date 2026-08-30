import type { AdminOverviewMetrics, PrivacySafeCount } from "@/lib/admin/types";

interface AdminOverviewProps {
  metrics: AdminOverviewMetrics;
}

const LIFECYCLE_LABELS: Record<string, string> = {
  created: "Utworzone",
  active: "Aktywne",
  completed: "Zakończone",
  expired: "Po czasie",
  interrupted: "Przerwane",
  deleted: "Usunięte",
};

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

export default function AdminOverview({ metrics }: AdminOverviewProps) {
  const lifecycleEntries = Object.entries(metrics.sessionsByLifecycle);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Główne statystyki">
        <StatTile label="Użytkownicy" value={formatCount(metrics.totalUsers)} />
        <StatTile label="Konta premium" value={formatCount(metrics.premiumUsers)} note="Bez limitu sesji." />
        <StatTile label="Zablokowane konta" value={formatCount(metrics.blockedUsers)} />
        <StatTile label="Aktywne sesje" value={formatCount(metrics.activeSessions)} note="Małe kohorty są ukrywane." />
        <StatTile
          label="Zakończone sesje"
          value={formatCount(metrics.completedSessions)}
          note="Status bez treści rozmów."
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="border-line bg-surface rounded-lg border p-4">
          <h2 className="text-ink text-base font-semibold">Statusy sesji</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {lifecycleEntries.map(([status, count]) => (
              <div key={status} className="border-surface-hover flex items-center justify-between border-b py-2">
                <span className="text-ink-muted text-sm">{LIFECYCLE_LABELS[status] ?? status}</span>
                <span className="text-ink text-sm font-semibold">{formatCount(count)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-line bg-surface rounded-lg border p-4">
          <h2 className="text-ink text-base font-semibold">Pozostałe liczniki</h2>
          <dl className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted text-sm">Sesje próbne</dt>
              <dd className="text-ink text-sm font-semibold">{formatCount(metrics.trialSessions)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted text-sm">Kolejne sesje</dt>
              <dd className="text-ink text-sm font-semibold">{formatCount(metrics.followUpSessions)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted text-sm">Zatwierdzone podsumowania</dt>
              <dd className="text-ink text-sm font-semibold">{formatCount(metrics.approvedSummaries)}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
