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

  return (
    <div className="inline-flex h-10 min-w-32 items-center justify-center gap-2 rounded-lg border border-[#bfd8d1] bg-[#f8fcfa] px-4 text-sm font-semibold text-[#173f39]">
      <Clock aria-hidden="true" className="h-4 w-4 text-[#1f6f65]" />
      <span aria-live="polite">{formatRemainingTime(remainingSeconds)}</span>
    </div>
  );
}
