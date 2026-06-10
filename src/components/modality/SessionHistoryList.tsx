import { Loader2, MessageSquareText, Trash2 } from "lucide-react";
import type { SessionHistoryListItem } from "@/lib/session-data/types";
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
        const isSelected = selectedSessionId === item.id;
        const isConfirming = pendingDeleteId === item.id;
        const isDeleting = deletingId === item.id;

        return (
          <li
            key={item.id}
            data-history-item={item.id}
            className={cn(
              "rounded-lg border p-4 text-sm leading-6 transition-colors",
              isSelected ? "border-[#1f6f65] bg-[#f4faf7]" : "border-[#d7e5e0] bg-white",
            )}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold text-[#10231f]">{formatDateTime(item.startedAt ?? item.createdAt)}</p>
                <p className="mt-1 text-[#52645f]">
                  {statusLabels[item.status]} · {getDurationLabel(item)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onOpenDetail(item.id);
                  }}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#9cc8bc] bg-white px-3 text-sm font-medium text-[#1f6f65] transition-colors hover:bg-[#eef8f4] focus:ring-2 focus:ring-[#2d8a7d] focus:outline-none"
                >
                  <MessageSquareText aria-hidden="true" className="h-4 w-4" />
                  Otwórz
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRequestDelete(item.id);
                  }}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#e2b8b8] bg-white px-3 text-sm font-medium text-[#7d2d2d] transition-colors hover:bg-[#fff8f8] focus:ring-2 focus:ring-[#c46d6d] focus:outline-none"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                  Usuń
                </button>
              </div>
            </div>

            {isConfirming ? (
              <div className="mt-4 rounded-lg border border-[#edd3a1] bg-[#fffaf0] p-4 text-sm leading-6 text-[#654b16]">
                <p className="font-semibold">Potwierdź usunięcie rozmowy</p>
                <p className="mt-1">
                  Usunięcie jest nieodwracalne. Treść rozmowy zostanie usunięta i nie przywraca darmowej próby.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onCancelDelete();
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-[#d7c38d] bg-white px-3 text-sm font-medium text-[#654b16] transition-colors hover:bg-[#fff6df] focus:ring-2 focus:ring-[#d6af53] focus:outline-none"
                  >
                    Anuluj
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => {
                      onConfirmDelete(item.id);
                    }}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#7d2d2d] px-3 text-sm font-medium text-white transition-colors hover:bg-[#6b2424] focus:ring-2 focus:ring-[#c46d6d] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#caa0a0]"
                  >
                    {isDeleting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
                    Potwierdź usunięcie
                  </button>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
