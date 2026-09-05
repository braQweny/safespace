import { useEffect, useState } from "react";
import { useLocale } from "@/components/hooks/useLocale";
import type { Locale } from "@/lib/i18n/locale";
import {
  computeClientRemainingSeconds,
  computeServerClockOffsetMs,
  formatRemainingTime,
} from "@/lib/session-flow/message-state";
import { resolveSessionPhase, type SessionPhase } from "@/lib/session-flow/session-phase";
import { cn } from "@/lib/utils";
import { getSessionTimerCopy } from "./session-timer-copy";

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

function getElapsedRatio(remainingSeconds: number | null, totalSeconds: number | null | undefined) {
  if (remainingSeconds === null || !totalSeconds || totalSeconds <= 0) {
    return null;
  }

  return Math.min(1, Math.max(0, 1 - remainingSeconds / totalSeconds));
}

/**
 * Faza liczona tą samą funkcją, którą dostaje model — użytkownik i awatar
 * mają widzieć ten sam moment rozmowy. Bez budżetu nie ma fazy.
 */
function getSessionPhase(
  expiresAt: string | null,
  remainingSeconds: number | null,
  totalSeconds: number | null | undefined,
): SessionPhase | null {
  if (!expiresAt || remainingSeconds === null || !totalSeconds || totalSeconds <= 0) {
    return null;
  }

  const expiresAtMs = Date.parse(expiresAt);

  if (!Number.isFinite(expiresAtMs)) {
    return null;
  }

  const startedAt = new Date(expiresAtMs - totalSeconds * 1_000).toISOString();

  return resolveSessionPhase(
    { startedAt, expiresAt, durationBucketSeconds: null, createdAt: startedAt },
    { now: new Date(expiresAtMs - remainingSeconds * 1_000) },
  );
}

/**
 * Czas pokazany jako łuk, nie odliczanie: pierścień wypełnia się w tempie
 * sesji, obok stoi „ok. N min” i faza rozmowy. Na telefonie pierścień ustępuje
 * miejsca paskowi pod nagłówkiem. Sekundy pojawiają się dopiero w ostatnich
 * dwóch minutach — wtedy precyzja naprawdę pomaga.
 */
function formatRemainingLabel(locale: Locale, remainingSeconds: number | null, level: TimerLevel) {
  const copy = getSessionTimerCopy(locale);

  if (remainingSeconds === null) {
    return copy.unknown;
  }

  if (level === "critical") {
    return formatRemainingTime(remainingSeconds);
  }

  return copy.approxMinutes(Math.max(1, Math.round(remainingSeconds / 60)));
}

const RING_RADIUS = 14;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function SessionTimer({
  expiresAt,
  initialRemainingSeconds,
  totalSeconds = null,
  onExpired,
}: SessionTimerProps) {
  const locale = useLocale();
  const copy = getSessionTimerCopy(locale);
  const [remainingSeconds, setRemainingSeconds] = useState(initialRemainingSeconds);

  useEffect(() => {
    if (!expiresAt) {
      return;
    }

    // Zegar klienta bywa przestawiony o minuty; wiarygodne jest tylko
    // `remainingSeconds` policzone przez serwer. Przesunięcie liczone raz
    // (i ponownie, gdy serwer przyśle świeższą wartość po turze), a potem
    // każdy tick idzie zegarem serwera.
    const offsetMs = computeServerClockOffsetMs(expiresAt, initialRemainingSeconds);

    function updateRemaining() {
      setRemainingSeconds(computeClientRemainingSeconds(expiresAt, Date.now() + offsetMs));
    }

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 1_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [expiresAt, initialRemainingSeconds]);

  useEffect(() => {
    if (remainingSeconds === 0) {
      onExpired();
    }
  }, [onExpired, remainingSeconds]);

  const level = getTimerLevel(remainingSeconds);
  const elapsedRatio = getElapsedRatio(remainingSeconds, totalSeconds);
  const phase = getSessionPhase(expiresAt, remainingSeconds, totalSeconds);
  const totalMinutes = totalSeconds && totalSeconds > 0 ? Math.round(totalSeconds / 60) : null;
  // Glina wchodzi dopiero przy domykaniu — wcześniej łuk jest po prostu zielony.
  const isClosing = phase === "closing" || level !== "calm";

  return (
    <>
      <div
        role="timer"
        aria-label={
          level === "critical"
            ? copy.ariaRemainingCritical
            : level === "warning"
              ? copy.ariaRemainingWarning
              : copy.ariaRemaining
        }
        className="inline-flex items-center gap-2 sm:gap-2.5"
      >
        <svg
          width="36"
          height="36"
          viewBox="0 0 36 36"
          aria-hidden="true"
          className="hidden shrink-0 sm:block sm:h-9 sm:w-9"
        >
          <circle cx="18" cy="18" r={RING_RADIUS} fill="none" strokeWidth="3" className="stroke-line-strong" />
          {elapsedRatio === null ? null : (
            <circle
              cx="18"
              cy="18"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${(elapsedRatio * RING_CIRCUMFERENCE).toFixed(2)} ${RING_CIRCUMFERENCE.toFixed(2)}`}
              transform="rotate(-90 18 18)"
              className={cn(
                "transition-[stroke-dasharray] duration-1000 ease-linear",
                isClosing ? "stroke-clay" : "stroke-brand",
              )}
            />
          )}
        </svg>
        <div className="flex flex-col leading-tight">
          <span className={cn("text-sm font-semibold tabular-nums", isClosing ? "text-clay-strong" : "text-ink")}>
            {formatRemainingLabel(locale, remainingSeconds, level)}
          </span>
          {/* Faza i budżet nie mieszczą się w jednym rzędzie telefonu — tam czas
              niesie pierścień i pasek pod nagłówkiem. */}
          <span className="text-ink-muted hidden text-xs sm:block">
            {level === "critical"
              ? copy.timeRunningOut
              : [phase ? copy.phaseLabels[phase] : null, totalMinutes ? copy.ofTotalMinutes(totalMinutes) : null]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
        </div>
        {/* Zmiana progu ogłaszana czytnikowi ekranu raz, bez odczytywania każdej sekundy. */}
        <span role="status" className="sr-only">
          {level === "critical" ? copy.statusCritical : level === "warning" ? copy.statusWarning : null}
        </span>
      </div>
      {/*
        Ten sam łuk, spłaszczony do włoskowatego paska na całej szerokości
        nagłówka: na telefonie pierścień 28 px jest za mały, żeby czytać z niego
        upływ czasu, a odliczanie sekund byłoby dokładnie tym napięciem, którego
        rozmowa ma nie dokładać.
      */}
      {elapsedRatio === null ? null : (
        <span aria-hidden="true" className="bg-line absolute inset-x-0 bottom-0 h-0.5 sm:hidden">
          <span
            className={cn(
              "block h-0.5 transition-[width] duration-1000 ease-linear",
              isClosing ? "bg-clay" : "bg-brand",
            )}
            style={{ width: `${(elapsedRatio * 100).toFixed(2)}%` }}
          />
        </span>
      )}
    </>
  );
}
