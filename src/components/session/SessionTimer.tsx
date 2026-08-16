import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { computeClientRemainingSeconds, formatRemainingTime } from "@/lib/session-flow/message-state";
import { cn } from "@/lib/utils";

interface SessionTimerProps {
  expiresAt: string | null;
  initialRemainingSeconds: number | null;
  totalSeconds?: number | null;
  onExpired: () => void;
}

const WARNING_THRESHOLD_SECONDS = 300;
const CRITICAL_THRESHOLD_SECONDS = 120;

type TimerLevel = "calm" | "warning" | "critical";

function getTimerLevel(remainingSeconds: number | null): TimerLevel {
  if (remainingSeconds === null || remainingSeconds > WARNING_THRESHOLD_SECONDS) {
    return "calm";
  }

  return remainingSeconds > CRITICAL_THRESHOLD_SECONDS ? "warning" : "critical";
}

function getProgressRatio(remainingSeconds: number | null, totalSeconds: number | null | undefined) {
  if (remainingSeconds === null || !totalSeconds || totalSeconds <= 0) {
    return null;
  }

  return Math.min(1, Math.max(0, remainingSeconds / totalSeconds));
}

const levelStyles: Record<TimerLevel, { shell: string; icon: string; bar: string }> = {
  calm: {
    shell: "border-brand-soft bg-surface-soft text-brand-deep",
    icon: "text-brand",
    bar: "bg-brand",
  },
  warning: {
    shell: "border-warn-line bg-warn-soft text-warn",
    icon: "text-warn-strong",
    bar: "bg-warn-strong",
  },
  critical: {
    shell: "border-danger-line bg-danger-soft text-danger",
    icon: "text-danger-strong",
    bar: "bg-danger-strong",
  },
};

export default function SessionTimer({
  expiresAt,
  initialRemainingSeconds,
  totalSeconds = null,
  onExpired,
}: SessionTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(initialRemainingSeconds);

  useEffect(() => {
    if (!expiresAt) {
      return;
    }

    function updateRemaining() {
      setRemainingSeconds(computeClientRemainingSeconds(expiresAt));
    }

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [expiresAt]);

  useEffect(() => {
    if (remainingSeconds === 0) {
      onExpired();
    }
  }, [onExpired, remainingSeconds]);

  const level = getTimerLevel(remainingSeconds);
  const progressRatio = getProgressRatio(remainingSeconds, totalSeconds);
  const styles = levelStyles[level];
  const totalMinutes = totalSeconds && totalSeconds > 0 ? Math.round(totalSeconds / 60) : null;

  return (
    <div
      role="timer"
      aria-label={
        level === "critical"
          ? "Pozostały czas sesji — mniej niż 2 minuty"
          : level === "warning"
            ? "Pozostały czas sesji — mniej niż 5 minut"
            : "Pozostały czas sesji"
      }
      className={cn("inline-flex min-w-32 flex-col gap-1.5 rounded-lg border px-3 py-1.5", styles.shell)}
    >
      <div className="inline-flex items-center gap-2 text-sm font-semibold tabular-nums">
        <Clock aria-hidden="true" className={cn("h-4 w-4 shrink-0", styles.icon)} />
        <span>{formatRemainingTime(remainingSeconds)}</span>
        {level === "critical" ? (
          <span className="text-xs font-medium">kończy się czas</span>
        ) : totalMinutes ? (
          // Without the total, a bare "14:56" gives no sense of how much is left.
          <span className="text-xs font-normal opacity-75">z {totalMinutes} min</span>
        ) : null}
      </div>
      {/* Zmiana progu ogłaszana czytnikowi ekranu raz, bez odczytywania każdej sekundy. */}
      <span role="status" className="sr-only">
        {level === "critical"
          ? "Zostało mniej niż 2 minuty sesji."
          : level === "warning"
            ? "Zostało mniej niż 5 minut sesji."
            : null}
      </span>
      {progressRatio === null ? null : (
        <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-black/10">
          <div
            className={cn("h-full rounded-full transition-[width] duration-1000 ease-linear", styles.bar)}
            style={{ width: `${(progressRatio * 100).toFixed(2)}%` }}
          />
        </div>
      )}
    </div>
  );
}
