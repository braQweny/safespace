import { useEffect, useState } from "react";
import { Clock, Loader2, MessageSquareText, PlayCircle, Trash2 } from "lucide-react";
import type { SessionHistoryListItem } from "@/lib/session-data/types";
import { computeClientRemainingSeconds, formatRemainingTime } from "@/lib/session-flow/message-state";
import { cn } from "@/lib/utils";

interface SessionHistoryListProps {
  items: SessionHistoryListItem[];
  selectedSessionId: string | null;
  /**
   * Wyspa hydratuje się z opóźnieniem, a kliknięcie sprzed hydratacji ginęło bez
   * żadnej reakcji — do tego czasu akcje wiersza są wyłączone, a nie nieme.
   */
  isInteractive?: boolean;
  pendingDeleteId: string | null;
  deletingId: string | null;
  onOpenDetail: (sessionId: string) => void;
  onRequestDelete: (sessionId: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (sessionId: string) => void;
}

const statusLabels: Record<SessionHistoryListItem["status"], string> = {
  created: "Utworzona",
  active: "Aktywna",
  completed: "Zakończona",
  expired: "Po czasie",
  interrupted: "Przerwana",
};

const statusBadgeClasses: Record<SessionHistoryListItem["status"], string> = {
  created: "border-line-strong bg-surface-soft text-ink-muted",
  active: "border-brand-soft bg-surface-hover text-brand",
  completed: "border-line-accent bg-surface-hover text-brand-deep",
  expired: "border-line-strong bg-surface-soft text-ink-muted",
  interrupted: "border-warn-line bg-warn-soft text-warn",
};

const SESSION_TIME_ZONE = "Europe/Warsaw";

const dayFormatter = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeZone: SESSION_TIME_ZONE,
});

const timeFormatter = new Intl.DateTimeFormat("pl-PL", {
  timeStyle: "short",
  timeZone: SESSION_TIME_ZONE,
});

/**
 * The list deliberately shows no conversation content, so the date is the only
 * thing telling two entries apart. "Dzisiaj"/"Wczoraj" reads faster than three
 * identical medium dates.
 */
export function formatDateTime(timestamp: string | null, now = new Date()) {
  if (!timestamp) {
    return "Brak daty";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Brak daty";
  }

  const day = dayFormatter.format(date);
  const time = timeFormatter.format(date);

  if (day === dayFormatter.format(now)) {
    return `Dzisiaj, ${time}`;
  }

  if (day === dayFormatter.format(new Date(now.getTime() - 24 * 60 * 60 * 1000))) {
    return `Wczoraj, ${time}`;
  }

  return `${day}, ${time}`;
}

/**
 * `durationBucketSeconds` is a privacy bucket (0/300/900/1800/3600), not the real
 * length — every trial session carries 900, so the list showed "15 min" next to a
 * two-minute conversation. Prefer the actual span and mark the bucket as a bound.
 */
export function getDurationLabel(item: SessionHistoryListItem) {
  if (item.startedAt && item.endedAt) {
    const started = Date.parse(item.startedAt);
    const ended = Date.parse(item.endedAt);

    if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) {
      const minutes = Math.round((ended - started) / 60_000);

      return minutes < 1 ? "krócej niż minutę" : `${minutes} min rozmowy`;
    }
  }

  if (typeof item.durationBucketSeconds === "number" && item.durationBucketSeconds > 0) {
    return `do ${Math.round(item.durationBucketSeconds / 60)} min`;
  }

  return "Czas nieustalony";
}

function getActiveSessionHref(sessionId: string) {
  return `/dashboard/session?sessionId=${encodeURIComponent(sessionId)}`;
}

function getInitialActiveRemainingSeconds(item: SessionHistoryListItem) {
  return item.status === "active" ? computeClientRemainingSeconds(item.expiresAt) : null;
}

interface SessionHistoryListItemRowProps {
  item: SessionHistoryListItem;
  isSelected: boolean;
  isInteractive: boolean;
  isConfirming: boolean;
  isDeleting: boolean;
  onOpenDetail: (sessionId: string) => void;
  onRequestDelete: (sessionId: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (sessionId: string) => void;
}

function SessionHistoryListItemRow({
  item,
  isSelected,
  isInteractive,
  isConfirming,
  isDeleting,
  onOpenDetail,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: SessionHistoryListItemRowProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(() => getInitialActiveRemainingSeconds(item));

  useEffect(() => {
    if (item.status !== "active" || !item.expiresAt) {
      return;
    }

    function updateRemainingSeconds() {
      setRemainingSeconds(computeClientRemainingSeconds(item.expiresAt));
    }

    const intervalId = window.setInterval(updateRemainingSeconds, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [item.expiresAt, item.status]);

  const effectiveStatus = item.status === "active" && remainingSeconds === 0 ? "expired" : item.status;
  const isActive = effectiveStatus === "active";

  return (
    <li
      data-history-item={item.id}
      className={cn(
        "rounded-lg border p-4 text-sm leading-6 transition-colors",
        isSelected ? "border-brand bg-canvas" : "border-line bg-surface hover:border-line-accent",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
                statusBadgeClasses[effectiveStatus],
              )}
            >
              {statusLabels[effectiveStatus]}
            </span>
            <span className="text-ink-faint text-xs">{getDurationLabel(item)}</span>
          </div>
          <p className="text-ink mt-1.5 font-semibold">{formatDateTime(item.startedAt ?? item.createdAt)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isActive ? (
            <>
              <div
                role="timer"
                aria-label="Pozostały czas sesji"
                className="border-brand-soft bg-surface-soft text-brand-deep inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold tabular-nums"
              >
                <Clock aria-hidden="true" className="text-brand h-4 w-4" />
                Pozostało {formatRemainingTime(remainingSeconds)}
              </div>
              <a
                href={getActiveSessionHref(item.id)}
                className="bg-brand hover:bg-brand-strong focus:ring-brand-ring inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-white transition-colors focus:ring-2 focus:outline-none"
              >
                <PlayCircle aria-hidden="true" className="h-4 w-4" />
                Wróć do rozmowy
              </a>
            </>
          ) : null}
          <button
            type="button"
            disabled={!isInteractive}
            onClick={() => {
              onOpenDetail(item.id);
            }}
            className="border-line-accent bg-surface text-brand hover:bg-surface-hover focus:ring-brand-ring inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MessageSquareText aria-hidden="true" className="h-4 w-4" />
            Otwórz
          </button>
          <button
            type="button"
            aria-label="Usuń rozmowę"
            title="Usuń rozmowę"
            disabled={!isInteractive}
            onClick={() => {
              onRequestDelete(item.id);
            }}
            className="text-ink-faint hover:border-danger-line hover:bg-danger-soft hover:text-danger focus:ring-danger-strong inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isConfirming ? (
        <div className="border-warn-line bg-warn-soft text-warn mt-4 rounded-lg border p-4 text-sm leading-6">
          <p className="font-semibold">Potwierdź usunięcie rozmowy</p>
          <p className="mt-1">
            Usunięcie jest nieodwracalne i nie przywraca darmowej próby. Treść rozmowy zostanie trwale usunięta.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onCancelDelete();
              }}
              className="border-warn-line text-warn hover:bg-warn-soft focus:ring-warn-strong inline-flex h-9 items-center justify-center rounded-lg border bg-white px-3 text-sm font-medium transition-colors focus:ring-2 focus:outline-none"
            >
              Anuluj
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => {
                onConfirmDelete(item.id);
              }}
              className="bg-danger hover:bg-danger focus:ring-danger-strong disabled:bg-danger-line inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-white transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed"
            >
              {isDeleting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              Potwierdź usunięcie
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export default function SessionHistoryList({
  items,
  selectedSessionId,
  isInteractive = true,
  pendingDeleteId,
  deletingId,
  onOpenDetail,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: SessionHistoryListProps) {
  return (
    <ol className="space-y-3">
      {items.map((item) => {
        return (
          <SessionHistoryListItemRow
            key={item.id}
            item={item}
            isSelected={selectedSessionId === item.id}
            isInteractive={isInteractive}
            isConfirming={pendingDeleteId === item.id}
            isDeleting={deletingId === item.id}
            onOpenDetail={onOpenDetail}
            onRequestDelete={onRequestDelete}
            onCancelDelete={onCancelDelete}
            onConfirmDelete={onConfirmDelete}
          />
        );
      })}
    </ol>
  );
}
