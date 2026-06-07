import type { AdminOverviewMetrics, PrivacySafeCount } from "@/lib/admin/types";

interface AdminOverviewProps {
  metrics: AdminOverviewMetrics;
}

const LIFECYCLE_LABELS: Record<string, string> = {
  created: "Utworzone",
  active: "Aktywne",
  completed: "Zakończone",
  expired: "Wygasłe",
  interrupted: "Przerwane",
  deleted: "Usunięte",
};

function formatCount(count: PrivacySafeCount | number) {
  return typeof count === "number" ? String(count) : count.label;
}

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <section className="rounded-lg border border-[#d7e2df] bg-white p-4">
      <p className="text-sm font-medium text-[#5a6d68]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#10231f]">{value}</p>
      {note ? <p className="mt-2 text-sm leading-5 text-[#6a7b76]">{note}</p> : null}
    </section>
  );
}

export default function AdminOverview({ metrics }: AdminOverviewProps) {
  const lifecycleEntries = Object.entries(metrics.sessionsByLifecycle);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Główne statystyki">
        <StatTile label="Użytkownicy" value={formatCount(metrics.totalUsers)} />
        <StatTile label="Zablokowane konta" value={formatCount(metrics.blockedUsers)} />
        <StatTile label="Aktywne sesje" value={formatCount(metrics.activeSessions)} note="Małe kohorty są ukrywane." />
        <StatTile
          label="Zakończone sesje"
          value={formatCount(metrics.completedSessions)}
          note="Status bez treści rozmów."
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-[#d7e2df] bg-white p-4">
          <h2 className="text-base font-semibold text-[#10231f]">Statusy sesji</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {lifecycleEntries.map(([status, count]) => (
              <div key={status} className="flex items-center justify-between border-b border-[#edf2f0] py-2">
                <span className="text-sm text-[#52645f]">{LIFECYCLE_LABELS[status] ?? status}</span>
                <span className="text-sm font-semibold text-[#10231f]">{formatCount(count)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-[#d7e2df] bg-white p-4">
          <h2 className="text-base font-semibold text-[#10231f]">Pozostałe liczniki</h2>
          <dl className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-sm text-[#52645f]">Sesje trial</dt>
              <dd className="text-sm font-semibold text-[#10231f]">{formatCount(metrics.trialSessions)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-sm text-[#52645f]">Kolejne sesje</dt>
              <dd className="text-sm font-semibold text-[#10231f]">{formatCount(metrics.followUpSessions)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-sm text-[#52645f]">Zatwierdzone podsumowania</dt>
              <dd className="text-sm font-semibold text-[#10231f]">{formatCount(metrics.approvedSummaries)}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
