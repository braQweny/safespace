import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { computeClientRemainingSeconds, formatRemainingTime } from "@/lib/session-flow/message-state";

interface SessionTimerProps {
  expiresAt: string | null;
  initialRemainingSeconds: number | null;
  onExpired: () => void;
}

export default function SessionTimer({ expiresAt, initialRemainingSeconds, onExpired }: SessionTimerProps) {
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

  const isRunningLow = remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds <= 120;

  return (
    <div
      role="timer"
      aria-label={isRunningLow ? "Pozostały czas sesji — mniej niż 2 minuty" : "Pozostały czas sesji"}
      className={`inline-flex h-10 min-w-32 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold ${
        isRunningLow ? "border-[#e5c982] bg-[#fff9e7] text-[#674b12]" : "border-[#bfd8d1] bg-[#f8fcfa] text-[#173f39]"
      }`}
    >
      <Clock aria-hidden="true" className={`h-4 w-4 ${isRunningLow ? "text-[#a97d1c]" : "text-[#1f6f65]"}`} />
      <span>{formatRemainingTime(remainingSeconds)}</span>
      {isRunningLow ? <span className="text-xs font-medium">kończy się czas</span> : null}
    </div>
  );
}
