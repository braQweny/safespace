import { useLocale } from "@/components/hooks/useLocale";
import type { DifficultyEffect } from "@/lib/session-summary/topic-map-budget";
import { cn } from "@/lib/utils";
import { getTopicMapCopy } from "./topic-map-copy";

const TONE: Readonly<Record<DifficultyEffect, string>> = {
  better: "bg-brand-tint text-brand-deep",
  resolved: "bg-brand-tint text-brand-deep",
  same: "bg-surface-soft text-ink-muted",
  mixed: "bg-surface-soft text-ink-muted",
  worse: "bg-danger-soft text-danger",
};

/** Ocena użytkownika („lepiej”, „gorzej”…) jako mały chip; tylko z jego słów. */
export default function EffectChip({ effect, className }: { effect: DifficultyEffect; className?: string }) {
  const copy = getTopicMapCopy(useLocale());

  return (
    <span
      title={copy.effectTitle}
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[effect], className)}
    >
      {copy.effects[effect]}
    </span>
  );
}
