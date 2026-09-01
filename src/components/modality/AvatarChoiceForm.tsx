import { useState, type ReactNode } from "react";
import { ArrowRight, Check, Save } from "lucide-react";
import {
  getPerspectiveLabel,
  type AvatarId,
  type ModalityAvatar,
  type ModalityId,
  type SelectedModalityAvatar,
} from "@/lib/modalities";
import { getPerspectiveTint } from "@/lib/perspective-tint";
import { cn } from "@/lib/utils";

interface AvatarChoiceFormProps {
  modalities: readonly ModalityAvatar[];
  currentSelection: SelectedModalityAvatar | null;
  /**
   * Czy jest co zaczynać: brak rozmowy w toku i niewyczerpana pula. Decyduje
   * wyłącznie o tym, czy pasek obiecuje start — bramką pozostaje panel i trasy
   * startu, które i tak sprawdzają limit po swojemu.
   */
  canStartConversation?: boolean;
  /** „do 15 min” / „do 60 min” — ta sama obietnica, co na przycisku w panelu. */
  sessionBudgetMinutes?: string;
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

/** Zdanie w pasku zapisu, gdy nie wiadomo (albo nie da się śledzić), co zaznaczono. */
export const SAVE_BAR_FALLBACK_MESSAGE = "Wybór zacznie obowiązywać po zapisaniu — od kolejnej rozmowy.";

interface SaveBarProps {
  message: ReactNode;
  canStartConversation: boolean;
  sessionBudgetMinutes?: string;
}

function SaveBar({ message, canStartConversation, sessionBudgetMinutes }: SaveBarProps) {
  return (
    <div className="border-line-strong bg-surface/95 sticky bottom-0 z-10 mt-6 flex flex-col gap-4 rounded-t-2xl border-t px-1 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <p className="text-ink-muted text-sm leading-6">{message}</p>
      {/*
        Kto właśnie wybrał, z kim chce rozmawiać, tym samym zdecydował, że chce
        rozmawiać — powrót do panelu tylko po to, żeby nacisnąć drugi przycisk,
        był krokiem bez decyzji. Start zostaje osobnym, nazwanym kliknięciem
        i nadal niesie obietnicę czasu, tak jak przycisk w panelu.
      */}
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="submit"
          name="intent"
          value="save"
          className={cn(
            "focus-visible:ring-brand-ring inline-flex h-12 shrink-0 items-center justify-center gap-2.5 rounded-[14px] px-6 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2",
            canStartConversation
              ? "border-line-accent bg-surface text-ink hover:bg-surface-soft border"
              : "bg-brand hover:bg-brand-strong text-surface",
          )}
        >
          <Save aria-hidden="true" className="h-4 w-4" />
          Zapisz wybór
        </button>
        {canStartConversation ? (
          <button
            type="submit"
            name="intent"
            value="save_and_start"
            className="bg-brand hover:bg-brand-strong focus-visible:ring-brand-ring text-surface inline-flex h-12 shrink-0 items-center justify-center gap-2.5 rounded-[14px] px-6 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2"
          >
            Zapisz i zacznij rozmowę
            {sessionBudgetMinutes ? (
              <span className="text-[15px] font-normal opacity-80">do {sessionBudgetMinutes}</span>
            ) : null}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
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
  // Na serwerze i w pierwszym renderze klienta zaznaczenie równa się zapisowi,
  // więc pasek nie stoi w HTML i nie znika po hydratacji — nic się nie
  // przesuwa. Pojawia się dopiero po realnej zmianie wyboru.
  const hasUnsavedChoice = selectedModality !== null && selectedModality.modalityId !== currentSelection?.modalityId;

  return (
    <form method="POST" action="/api/profile/avatar" className="mt-8">
      {/*
        Pięć głosów naraz zamiast listy nurtów obok karty szczegółu: wybiera się
        po brzmieniu, nie po nazwie szkoły, a na telefonie sam wybór nie schodzi
        pod ekran za opisem jednej perspektywy.
        `role="radiogroup"` zamiast fieldset: grid na fieldsetcie bywa ignorowany
        przez starsze WebKity.
      */}
      <div role="radiogroup" aria-label="Perspektywy rozmowy" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modalities.map((modality) => {
          const isSelected = modality.modalityId === selectedModalityId;
          const tint = getPerspectiveTint(modality.modalityId);

          return (
            <label
              key={modality.modalityId}
              className={cn(
                "focus-within:ring-brand-ring bg-surface shadow-card flex cursor-pointer flex-col rounded-[20px] border p-5 transition-colors focus-within:ring-2 focus-within:outline-none sm:p-6",
                isSelected ? cn("ring-2", tint.border, tint.ring) : "border-line-strong hover:border-line-accent",
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

              <div className="flex items-start gap-3.5">
                <img
                  src={modality.assetPath}
                  alt={modality.altText}
                  width="256"
                  height="256"
                  loading="lazy"
                  decoding="async"
                  className="h-16 w-16 shrink-0 rounded-full object-cover"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-ink text-[17px] leading-6 font-semibold">{modality.avatarName}</span>
                  <span className={cn("text-[13px] leading-5", tint.text)}>
                    {getPerspectiveLabel(modality.modalityId)}
                  </span>
                </span>
                {/* The radio itself is sr-only, so an always-visible marker is the
                    only thing telling a sighted user these cards are a choice. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full transition-colors",
                    isSelected ? "bg-brand text-surface" : "border-line-accent border-[1.5px]",
                  )}
                >
                  <Check className={cn("h-3.5 w-3.5", isSelected ? "opacity-100" : "opacity-0")} strokeWidth={2.5} />
                </span>
              </div>

              <div className={cn("mt-4 rounded-2xl px-4 py-4", tint.soft)}>
                <span className={cn("block text-xs font-semibold tracking-[0.08em] uppercase", tint.text)}>
                  {VOICE_SAMPLE_LABELS[modality.avatarId] ?? DEFAULT_VOICE_SAMPLE_LABEL}
                </span>
                <span className="text-ink mt-2 block font-serif text-xl leading-snug italic">
                  „{modality.voiceSample}”
                </span>
              </div>

              <span className="text-ink-muted mt-4 block text-xs font-semibold tracking-[0.08em] uppercase">
                Na czym skupia uwagę
              </span>
              <span className="text-ink-soft mt-1.5 block text-sm leading-6">{modality.focus}</span>

              {/* Zdanie porównawcze tylko przy zaznaczonej karcie: pomaga przy
                  decyzji, a przy pięciu kartach naraz byłoby ścianą tekstu. */}
              {isSelected ? (
                <span className="text-ink-muted border-line mt-4 block border-t pt-3 text-[13px] leading-5">
                  {modality.pairingNote}
                </span>
              ) : null}
            </label>
          );
        })}

        <div className="flex flex-col justify-center gap-3 px-5 py-4">
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4.5 21.5V12a7.5 7.5 0 0 1 15 0v9.5Z"
              className="stroke-line-accent fill-none"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-ink-muted text-sm leading-6">
            Zapisy rozmów są prowadzone osobno dla każdej perspektywy. Zmiana wyboru niczego nie usuwa — starsze rozmowy
            zostają pod swoją twarzą w historii.
          </p>
        </div>
      </div>

      {/* The bar only appears once the selection actually differs from what is
          saved. A permanent "Zapisz wybór" implied there was always something
          pending. */}
      {hasUnsavedChoice ? (
        <SaveBar
          canStartConversation={canStartConversation}
          sessionBudgetMinutes={sessionBudgetMinutes}
          message={
            <>
              <span className="text-ink font-semibold">Zaznaczono: {getDisplayName(selectedModality.avatarName)}.</span>{" "}
              {SAVE_BAR_FALLBACK_MESSAGE}
            </>
          }
        />
      ) : null}

      {/*
        Bez JavaScriptu radia działają natywnie, ale React nigdy nie
        wyrenderuje paska — więc zapis dostaje własną kopię tutaj. Przeglądarka
        z włączonymi skryptami jej nie pokazuje, a React po stronie klienta
        traktuje <noscript> jako liść i nie hydratuje jego treści.
      */}
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
