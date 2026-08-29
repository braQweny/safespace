import { useState } from "react";
import { Check, Save } from "lucide-react";
import {
  getPerspectiveLabel,
  type AvatarId,
  type ModalityAvatar,
  type ModalityId,
  type SelectedModalityAvatar,
} from "@/lib/modalities";
import { useIsHydrated } from "@/components/hooks/useIsHydrated";
import { getPerspectiveTint } from "@/lib/perspective-tint";
import { cn } from "@/lib/utils";

interface AvatarChoiceFormProps {
  modalities: readonly ModalityAvatar[];
  currentSelection: SelectedModalityAvatar | null;
}

/**
 * Etykieta cytatu odmienia się po osobie awatara. Mapa po `avatarId` zamiast
 * zgadywania z imienia — katalog jest krótki i jawny, a nowy awatar bez wpisu
 * dostaje neutralne „to zdanie” zamiast błędnej formy.
 */
const VOICE_SAMPLE_LABELS: Partial<Record<AvatarId, string>> = {
  "psychodynamic-listener": "Tak może brzmieć jej zdanie",
  "cbt-guide": "Tak może brzmieć jego zdanie",
  "experiential-companion": "Tak może brzmieć jej zdanie",
  "systemic-connector": "Tak może brzmieć jego zdanie",
  "integrative-guide": "Tak może brzmieć jej zdanie",
};

const DEFAULT_VOICE_SAMPLE_LABEL = "Tak może brzmieć to zdanie";

function getDisplayName(avatarName: string) {
  return avatarName.split(",")[0]?.trim() || avatarName;
}

export default function AvatarChoiceForm({ modalities, currentSelection }: AvatarChoiceFormProps) {
  const [selectedModalityId, setSelectedModalityId] = useState<ModalityId | "">(currentSelection?.modalityId ?? "");
  const isHydrated = useIsHydrated();
  const selectedModality = modalities.find((modality) => modality.modalityId === selectedModalityId) ?? null;
  // Szczegół zawsze kogoś pokazuje: bez zapisanego wyboru jest to pierwsza
  // osoba z listy, ale żaden przycisk radiowy nie jest wtedy zaznaczony.
  const detailModality = selectedModality ?? modalities.at(0) ?? null;
  // Without JavaScript the radios still work but React never re-renders, so the
  // save bar has to stay in the server-rendered markup or the form is unusable.
  const hasUnsavedChoice =
    !isHydrated || (selectedModality !== null && selectedModality.modalityId !== currentSelection?.modalityId);
  const detailTint = detailModality ? getPerspectiveTint(detailModality.modalityId) : null;

  return (
    <form method="POST" action="/api/profile/avatar" className="mt-8">
      <div className="grid gap-8 lg:grid-cols-[420px_minmax(0,1fr)] lg:items-start">
        {/* role="radiogroup" zamiast fieldset: grid na fieldsetcie bywa ignorowany przez starsze WebKity. */}
        <div role="radiogroup" aria-label="Perspektywy rozmowy" className="flex flex-col gap-1.5">
          {modalities.map((modality) => {
            const isSelected = modality.modalityId === selectedModalityId;
            const tint = getPerspectiveTint(modality.modalityId);

            return (
              <label
                key={modality.modalityId}
                className={cn(
                  "focus-within:ring-brand-ring flex min-h-[72px] cursor-pointer items-center gap-4 rounded-2xl border px-4 py-3 transition-colors focus-within:ring-2 focus-within:outline-none",
                  isSelected
                    ? "border-brand bg-surface ring-brand-soft ring-[3px]"
                    : "hover:bg-surface hover:border-line-strong border-transparent",
                )}
              >
                <input
                  type="radio"
                  name="modalityId"
                  value={modality.modalityId}
                  checked={isSelected}
                  required
                  onChange={() => {
                    setSelectedModalityId(modality.modalityId);
                  }}
                  className="peer sr-only"
                />
                <img
                  src={modality.assetPath}
                  alt=""
                  width="384"
                  height="384"
                  loading="lazy"
                  className="h-14 w-14 shrink-0 rounded-full object-cover"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-ink text-base font-semibold">{modality.avatarName}</span>
                  <span className={cn("text-sm", tint.text)}>{getPerspectiveLabel(modality.modalityId)}</span>
                </span>
                {/* The radio itself is sr-only, so an always-visible marker is the
                    only thing telling a sighted user these rows are a choice. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full transition-colors",
                    isSelected ? "bg-brand text-surface" : "border-line-accent border-[1.5px]",
                  )}
                >
                  <Check className={cn("h-3.5 w-3.5", isSelected ? "opacity-100" : "opacity-0")} strokeWidth={2.5} />
                </span>
              </label>
            );
          })}
          <p className="text-ink-faint mt-3 px-4 text-[13px] leading-6">
            Zapisy rozmów są prowadzone osobno dla każdej perspektywy. Znajdziesz je w panelu.
          </p>
        </div>

        {detailModality && detailTint ? (
          <section
            aria-live="polite"
            className="border-line-strong bg-surface shadow-card flex flex-col gap-7 rounded-[20px] border p-6 sm:p-9"
          >
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-7">
              <img
                src={detailModality.assetPath}
                alt={detailModality.altText}
                width="384"
                height="384"
                loading="lazy"
                className="h-[168px] w-[168px] shrink-0 rounded-2xl object-cover"
              />
              <div className="flex min-w-0 flex-col gap-2">
                <p className={cn("text-xs font-semibold tracking-[0.08em] uppercase", detailTint.text)}>
                  {detailModality.modalityName}
                </p>
                <h2 className="text-ink font-serif text-3xl font-medium tracking-tight">{detailModality.avatarName}</h2>
                <p className="text-ink-soft mt-1 text-[17px] leading-7">{detailModality.explanation}</p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="bg-surface-soft flex flex-col gap-2 rounded-2xl px-5 py-5">
                <p className="text-ink-muted text-xs font-semibold tracking-[0.08em] uppercase">Na czym skupia uwagę</p>
                <p className="text-ink text-[15px] leading-6">{detailModality.focus}</p>
              </div>
              <div className={cn("flex flex-col gap-2 rounded-2xl px-5 py-5", detailTint.soft)}>
                <p className={cn("text-xs font-semibold tracking-[0.08em] uppercase", detailTint.text)}>
                  {VOICE_SAMPLE_LABELS[detailModality.avatarId] ?? DEFAULT_VOICE_SAMPLE_LABEL}
                </p>
                <p className="text-ink font-serif text-xl leading-snug italic">„{detailModality.voiceSample}”</p>
              </div>
            </div>

            <p className="text-ink-muted text-sm leading-6">{detailModality.pairingNote}</p>

            {/* The bar only appears once the selection actually differs from what is
                saved. Floating a permanent "Zapisz wybór" over the cards implied
                there was always something pending, and covered a card to say it. */}
            {hasUnsavedChoice ? (
              <div className="border-line bg-surface sticky bottom-4 z-10 -mx-2 flex flex-col gap-4 rounded-2xl border-t px-2 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-ink-muted text-sm leading-6">
                  {selectedModality ? (
                    <>
                      <span className="text-ink font-semibold">
                        Zaznaczono: {getDisplayName(selectedModality.avatarName)}.
                      </span>{" "}
                      Wybór zacznie obowiązywać po zapisaniu — od kolejnej rozmowy.
                    </>
                  ) : (
                    "Zaznacz perspektywę, żeby ją zapisać."
                  )}
                </p>
                <button
                  type="submit"
                  suppressHydrationWarning
                  className="bg-brand hover:bg-brand-strong focus-visible:ring-brand-ring text-surface inline-flex h-12 shrink-0 items-center justify-center gap-2.5 rounded-[14px] px-6 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2"
                >
                  <Save aria-hidden="true" className="h-4 w-4" />
                  Zapisz wybór
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </form>
  );
}
