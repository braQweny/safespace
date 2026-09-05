import { useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import {
  getPerspectiveLabel,
  type ModalityAvatar,
  type ModalityId,
  type SelectedModalityAvatar,
} from "@/lib/modalities";
import { perspectiveFocus } from "@/lib/perspective-copy";
import { getPerspectiveTint } from "@/lib/perspective-tint";
import { cn } from "@/lib/utils";

interface AvatarChoiceFormProps {
  modalities: readonly ModalityAvatar[];
  currentSelection: SelectedModalityAvatar | null;
  canStartConversation?: boolean;
  sessionBudgetMinutes?: string;
}

export const SAVE_BAR_FALLBACK_MESSAGE = "Wybór dotyczy kolejnej rozmowy.";

interface SaveBarProps {
  message: ReactNode;
  canStartConversation: boolean;
  sessionBudgetMinutes?: string;
}

function SaveBar({ message, canStartConversation, sessionBudgetMinutes }: SaveBarProps) {
  return (
    <div className="border-line-strong bg-surface/95 sticky bottom-0 z-10 mt-5 rounded-t-2xl border-t px-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-4">
      <p className="text-ink-muted mb-2 text-sm leading-5" role="status">
        {message}
        {canStartConversation && sessionBudgetMinutes ? ` · do ${sessionBudgetMinutes}` : null}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="submit"
          name="intent"
          value="save"
          className={cn(
            "focus-visible:ring-brand-ring inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2",
            canStartConversation
              ? "text-ink-soft hover:bg-surface-soft"
              : "bg-brand hover:bg-brand-strong text-surface",
          )}
        >
          {canStartConversation ? "Tylko zapisz" : "Zapisz wybór"}
        </button>
        {canStartConversation ? (
          <button
            type="submit"
            name="intent"
            value="save_and_start"
            className="bg-brand hover:bg-brand-strong focus-visible:ring-brand-ring text-surface inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] px-5 py-3 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2"
          >
            Zacznij rozmowę
            <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function AvatarChoiceForm({
  modalities,
  currentSelection,
  canStartConversation = false,
  sessionBudgetMinutes,
}: AvatarChoiceFormProps) {
  const [selectedModalityId, setSelectedModalityId] = useState<ModalityId | "">(currentSelection?.modalityId ?? "");
  const selectedModality = modalities.find((modality) => modality.modalityId === selectedModalityId) ?? null;
  const hasUnsavedChoice = selectedModality !== null && selectedModality.modalityId !== currentSelection?.modalityId;

  return (
    <form method="POST" action="/api/profile/avatar" className="mt-5">
      <div
        role="radiogroup"
        aria-label="Perspektywy rozmowy"
        className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {modalities.map((modality) => {
          const isSelected = modality.modalityId === selectedModalityId;
          const tint = getPerspectiveTint(modality.modalityId);
          const name = modality.avatarName.split(",")[0];
          const id = `perspective-${modality.modalityId}`;

          return (
            <div
              key={modality.modalityId}
              className={cn(
                "bg-surface scroll-mt-20 scroll-mb-36 rounded-2xl border transition-colors",
                isSelected ? cn("ring-2", tint.border, tint.ring) : "border-line-strong hover:border-line-accent",
              )}
            >
              <label
                htmlFor={id}
                className="focus-within:ring-brand-ring block cursor-pointer rounded-2xl px-4 pt-4 pb-2 focus-within:ring-2"
              >
                <input
                  id={id}
                  type="radio"
                  name="modalityId"
                  value={modality.modalityId}
                  checked={isSelected}
                  required
                  aria-labelledby={`${id}-name ${id}-focus`}
                  aria-describedby={`${id}-voice`}
                  onChange={() => {
                    setSelectedModalityId(modality.modalityId);
                  }}
                  className="sr-only"
                />
                <span className="flex items-center gap-3">
                  <img
                    src={modality.assetPath}
                    alt=""
                    width="256"
                    height="256"
                    loading="lazy"
                    decoding="async"
                    className="h-12 w-12 shrink-0 rounded-full object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span id={`${id}-name`} className="text-ink block text-lg font-semibold">
                      {name}
                    </span>
                    <span id={`${id}-focus`} className={cn("block text-sm leading-5", tint.text)}>
                      {perspectiveFocus[modality.modalityId]}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                      isSelected ? "bg-brand text-surface" : "border-line-accent border",
                    )}
                  >
                    {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                </span>
                <span id={`${id}-voice`} className="text-ink mt-3 block font-serif text-lg leading-snug italic">
                  „{modality.voiceSample}”
                </span>
              </label>
              <details className="group px-4 pb-1">
                <summary className="text-brand focus-visible:ring-brand-ring flex min-h-11 cursor-pointer list-none items-center gap-1 rounded text-sm font-medium focus:outline-none focus-visible:ring-2">
                  O podejściu<span className="sr-only">: {name}</span>
                  <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="text-ink-muted space-y-2 pb-3 text-sm leading-6">
                  <p className={cn("font-medium", tint.text)}>{getPerspectiveLabel(modality.modalityId)}</p>
                  <p>{modality.focus}</p>
                  <p>{modality.pairingNote}</p>
                </div>
              </details>
            </div>
          );
        })}
      </div>
      <p className="text-ink-muted mt-4 text-sm leading-6">
        Każda perspektywa ma osobną historię. Zmiana wyboru nie usuwa wcześniejszych rozmów.
      </p>
      {hasUnsavedChoice ? (
        <SaveBar
          canStartConversation={canStartConversation}
          sessionBudgetMinutes={sessionBudgetMinutes}
          message={<span className="text-ink font-medium">Wybrano: {selectedModality.avatarName.split(",")[0]}</span>}
        />
      ) : null}
      <noscript>
        <SaveBar
          canStartConversation={canStartConversation}
          sessionBudgetMinutes={sessionBudgetMinutes}
          message={SAVE_BAR_FALLBACK_MESSAGE}
        />
      </noscript>
    </form>
  );
}
