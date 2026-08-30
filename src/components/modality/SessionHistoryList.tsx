import { useEffect, useState } from "react";
import { ChevronRight, Clock, PlayCircle } from "lucide-react";
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
  onOpenDetail: (sessionId: string) => void;
}

export interface SessionStatusLegendEntry {
  label: string;
  description: string;
}

/**
 * Jedno źródło etykiet i wyjaśnień statusów: `title` odznaki na liście i zwijana
 * legenda w nagłówku sekcji muszą mówić dokładnie to samo.
 */
export const sessionStatusLegend: Record<SessionHistoryListItem["status"], SessionStatusLegendEntry> = {
  created: {
    label: "Utworzona",
    description: "Rozmowa została przygotowana, ale nie zdążyła się rozpocząć.",
  },
  active: {
    label: "Aktywna",
    description: "Rozmowa trwa — możesz do niej wrócić, dopóki nie minie czas sesji.",
  },
  completed: {
    label: "Zakończona",
    description:
      "Rozmowa zamknięta przez Ciebie przyciskiem „Zakończ sesję” — zwykły koniec, więc wiersz nie dostaje odznaki.",
  },
  expired: {
    label: "Po czasie",
    description: "Minął limit czasu rozmowy — nie da się już w niej pisać.",
  },
  interrupted: {
    label: "Przerwana",
    description: "Rozmowa zatrzymana przez mechanizm bezpieczeństwa.",
  },
};

/**
 * Statusy pokazywane w legendzie. `created` to stan przejściowy między startem a
 * aktywacją — lista pokazuje go tylko po nieudanym starcie, więc w legendzie
 * tylko by mylił; odznaka i tak dostaje swój `title`.
 */
export const SESSION_STATUS_LEGEND_ORDER = [
  "active",
  "completed",
  "expired",
  "interrupted",
] as const satisfies readonly SessionHistoryListItem["status"][];

/**
 * Deterministyczny id przycisku „Otwórz” — po zamknięciu podglądu fokus wraca
 * na wiersz, z którego podgląd został otwarty. Id sesji to UUID, więc nadaje
 * się do atrybutu `id` bez ucieczki.
 */
export function getOpenDetailButtonId(sessionId: string) {
  return `session-history-open-${sessionId}`;
}

/**
 * „Zakończona” to stan domyślny i nie zasługuje na odznakę — po dniu i godzinie
 * widać wszystko, co trzeba. Odznakę dostają tylko stany, które czymś się
 * różnią od zwykłego przebiegu rozmowy.
 */
const statusBadgeClasses: Partial<Record<SessionHistoryListItem["status"], string>> = {
  created: "bg-surface-soft text-ink-muted",
  active: "bg-brand-tint text-brand-deep",
  expired: "bg-surface-soft text-ink-muted",
  interrupted: "bg-clay-soft text-clay-strong",
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
 * Nagłówek grupy dnia. Data przenosi się z wiersza do nagłówka, więc w samym
 * wierszu zostaje sama godzina — kilka rozmów z jednego dnia przestaje wyglądać
 * jak kilka kopii tego samego napisu.
 */
export function formatDayGroupLabel(timestamp: string | null, now = new Date()) {
  if (!timestamp) {
    return "Brak daty";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Brak daty";
  }

  const day = dayFormatter.format(date);

  if (day === dayFormatter.format(now)) {
    return "Dzisiaj";
  }

  if (day === dayFormatter.format(new Date(now.getTime() - 24 * 60 * 60 * 1000))) {
    return "Wczoraj";
  }

  return day;
}

export function formatTimeOfDay(timestamp: string | null) {
  if (!timestamp) {
    return "—";
  }

  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? "—" : timeFormatter.format(date);
}

export interface SessionHistoryDayGroup {
  key: string;
  label: string;
  items: SessionHistoryListItem[];
}

function getItemTimestamp(item: SessionHistoryListItem) {
  return item.startedAt ?? item.createdAt;
}

/**
 * Lista przychodzi już posortowana od najnowszej, więc grupowanie zachowuje
 * kolejność i nie sortuje niczego po raz drugi.
 */
export function groupSessionHistoryItemsByDay(
  items: readonly SessionHistoryListItem[],
  now = new Date(),
): SessionHistoryDayGroup[] {
  const groups: SessionHistoryDayGroup[] = [];

  for (const item of items) {
    const label = formatDayGroupLabel(getItemTimestamp(item), now);
    const lastGroup = groups.at(-1);

    if (lastGroup?.key === label) {
      lastGroup.items.push(item);
      continue;
    }

    groups.push({
      key: label,
      label,
      items: [item],
    });
  }

  return groups;
}

/**
 * `durationBucketSeconds` is a privacy bucket (0/300/900/1800/3600), not the real
 * length — it carries the budget the session was started with (900 on a free
 * plan, 3600 on premium), so the list showed "15 min" next to a two-minute
 * conversation. Prefer the actual span and mark the bucket as a bound.
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

interface SummaryMarkCopy {
  label: string;
  className: string;
  dashed: boolean;
}

/**
 * Znacznik mówi wyłącznie o stanie: czy z tej rozmowy coś przechodzi dalej.
 * Treść podsumowania zostaje w podglądzie, tak jak treść rozmowy.
 */
const summaryMarkCopy: Partial<Record<SessionHistoryListItem["summaryState"], SummaryMarkCopy>> = {
  approved: {
    label: "Przechodzi dalej",
    className: "text-brand",
    dashed: false,
  },
  preview: {
    label: "Podsumowanie czeka na decyzję",
    className: "text-ink-soft",
    dashed: false,
  },
  stale: {
    label: "Podsumowanie nieaktualne",
    className: "text-ink-muted",
    dashed: true,
  },
};

/** Łuk ze znaku marki: to, co przechodzi przez próg do kolejnej rozmowy. */
function SummaryMark({ state }: { state: SessionHistoryListItem["summaryState"] }) {
  const copy = summaryMarkCopy[state];

  if (!copy) {
    return null;
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", copy.className)}>
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
        <path
          d="M4.5 21.5V12a7.5 7.5 0 0 1 15 0v9.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeDasharray={copy.dashed ? "3 3" : undefined}
        />
      </svg>
      {copy.label}
    </span>
  );
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
  onOpenDetail: (sessionId: string) => void;
}

function SessionHistoryListItemRow({ item, isSelected, isInteractive, onOpenDetail }: SessionHistoryListItemRowProps) {
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
  const statusLegend = sessionStatusLegend[effectiveStatus];
  const badgeClassName = statusBadgeClasses[effectiveStatus];
  const timeOfDay = formatTimeOfDay(item.startedAt ?? item.createdAt);
  const durationLabel = getDurationLabel(item);

  return (
    <li
      data-history-item={item.id}
      className={cn(
        "rounded-xl transition-colors",
        isSelected ? "bg-surface-soft ring-brand-soft ring-2" : "hover:bg-surface-soft",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-ink text-[15px] leading-6">
            <span className="font-semibold tabular-nums">{timeOfDay}</span>
            <span className="text-ink-muted text-[13px]"> · {durationLabel}</span>
          </p>
          {badgeClassName || item.summaryState !== "none" ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {badgeClassName ? (
                <span
                  title={statusLegend.description}
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                    badgeClassName,
                  )}
                >
                  {statusLegend.label}
                </span>
              ) : null}
              <SummaryMark state={item.summaryState} />
            </div>
          ) : null}
        </div>

        {isActive ? (
          <>
            <div
              role="timer"
              aria-label="Pozostały czas sesji"
              className="bg-brand-tint text-brand-deep inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-semibold tabular-nums"
            >
              <Clock aria-hidden="true" className="text-brand h-3.5 w-3.5" />
              Pozostało {formatRemainingTime(remainingSeconds)}
            </div>
            <a
              href={getActiveSessionHref(item.id)}
              className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
            >
              <PlayCircle aria-hidden="true" className="h-3.5 w-3.5" />
              Wróć do rozmowy
            </a>
          </>
        ) : null}

        {/*
          Jeden przycisk na wiersz zamiast trzech. Usuwanie przeniosło się do
          podglądu — kasowanie z listy, na której każdy wiersz wygląda tak samo,
          było proszeniem się o pomyłkę.
        */}
        <button
          id={getOpenDetailButtonId(item.id)}
          type="button"
          disabled={!isInteractive}
          aria-label={`Otwórz zapis rozmowy: ${formatDateTime(item.startedAt ?? item.createdAt)}`}
          onClick={() => {
            onOpenDetail(item.id);
          }}
          className="text-ink-muted hover:bg-surface hover:text-ink focus-visible:ring-brand-ring inline-flex h-11 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="hidden sm:inline">Otwórz</span>
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

export default function SessionHistoryList({
  items,
  selectedSessionId,
  isInteractive = true,
  onOpenDetail,
}: SessionHistoryListProps) {
  const groups = groupSessionHistoryItemsByDay(items);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.key}>
          <div className="flex items-center gap-3">
            <h3 className="text-ink-muted text-xs font-semibold tracking-[0.08em] uppercase">{group.label}</h3>
            <span aria-hidden="true" className="bg-line h-px flex-1" />
          </div>
          <ol className="mt-1.5 space-y-0.5">
            {group.items.map((item) => (
              <SessionHistoryListItemRow
                key={item.id}
                item={item}
                isSelected={selectedSessionId === item.id}
                isInteractive={isInteractive}
                onOpenDetail={onOpenDetail}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
