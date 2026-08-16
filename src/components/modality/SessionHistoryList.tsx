import { useEffect, useState } from "react";
import { Clock, Loader2, MessageSquareText, PlayCircle, Trash2 } from "lucide-react";
import type { SessionHistoryListItem } from "@/lib/session-data/types";
import { computeClientRemainingSeconds, formatRemainingTime } from "@/lib/session-flow/message-state";
import { cn } from "@/lib/utils";

interface SessionHistoryListProps {
  items: SessionHistoryListItem[];
  selectedSessionId: string | null;
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

function formatDateTime(timestamp: string | null) {
  if (!timestamp) {
    return "Brak daty";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Brak daty";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(date);
}

function getDurationLabel(item: SessionHistoryListItem) {
  if (typeof item.durationBucketSeconds === "number" && item.durationBucketSeconds > 0) {
    return `${Math.round(item.durationBucketSeconds / 60)} min`;
  }

  if (item.startedAt && item.endedAt) {
    const started = Date.parse(item.startedAt);
    const ended = Date.parse(item.endedAt);

    if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) {
      return `${Math.max(1, Math.round((ended - started) / 60_000))} min`;
    }
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
            onClick={() => {
              onOpenDetail(item.id);
            }}
            className="border-line-accent bg-surface text-brand hover:bg-surface-hover focus:ring-brand-ring inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus:ring-2 focus:outline-none"
          >
            <MessageSquareText aria-hidden="true" className="h-4 w-4" />
            Otwórz
          </button>
          <button
            type="button"
            aria-label="Usuń rozmowę"
            title="Usuń rozmowę"
            onClick={() => {
              onRequestDelete(item.id);
            }}
            className="text-ink-faint hover:border-danger-line hover:bg-danger-soft hover:text-danger focus:ring-danger-strong inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent transition-colors focus:ring-2 focus:outline-none"
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
