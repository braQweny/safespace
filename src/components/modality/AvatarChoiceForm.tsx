import { useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
import {
  toSelectedModalityAvatar,
  type ModalityAvatar,
  type ModalityId,
  type SelectedModalityAvatar,
} from "@/lib/modalities";
import type { SessionHistoryListResponse } from "@/lib/session-flow/session-history-contract";
import { useIsHydrated } from "@/components/hooks/useIsHydrated";
import { cn } from "@/lib/utils";
import AvatarSessionHistory from "./AvatarSessionHistory";

interface AvatarChoiceFormProps {
  modalities: readonly ModalityAvatar[];
  currentSelection: SelectedModalityAvatar | null;
  initialHistoryPage: number;
  initialHistory: SessionHistoryListResponse | null;
}

const cardAccentClasses: Record<ModalityId, string> = {
  psychodynamic: "border-line-accent bg-[#f7fbfa]",
  cbt: "border-speaker-line bg-speaker-soft",
  humanistic_experiential: "border-[#edcbd1] bg-[#fff9f8]",
  systemic: "border-[#c5dfe5] bg-[#f7fcfd]",
  integrative: "border-[#d8cfea] bg-[#fbf9ff]",
};

function updateHistoryUrl(avatarId: string, page: number) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("avatar", avatarId);
  url.searchParams.set("page", String(page));
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export default function AvatarChoiceForm({
  modalities,
  currentSelection,
  initialHistoryPage,
  initialHistory,
}: AvatarChoiceFormProps) {
  const [selectedModalityId, setSelectedModalityId] = useState<ModalityId | "">(currentSelection?.modalityId ?? "");
  const [historyPage, setHistoryPage] = useState(initialHistoryPage);
  const isHydrated = useIsHydrated();
  const selectedModality = modalities.find((modality) => modality.modalityId === selectedModalityId) ?? null;
  const selectedAvatar = selectedModality ? toSelectedModalityAvatar(selectedModality) : null;
  // Without JavaScript the radios still work but React never re-renders, so the
  // save bar has to stay in the server-rendered markup or the form is unusable.
  const hasUnsavedChoice =
    !isHydrated || (selectedModality !== null && selectedModality.modalityId !== currentSelection?.modalityId);

  function selectModality(modality: ModalityAvatar) {
    setSelectedModalityId(modality.modalityId);
    setHistoryPage(1);
    updateHistoryUrl(modality.avatarId, 1);
  }

  function changeHistoryPage(page: number) {
    setHistoryPage(page);

    if (selectedAvatar) {
      updateHistoryUrl(selectedAvatar.avatarId, page);
    }
  }

  return (
    <div className="mt-8">
      <form method="POST" action="/api/profile/avatar">
        {/* role="radiogroup" zamiast fieldset: grid na fieldsetcie bywa ignorowany przez starsze WebKity. */}
        <div
          role="radiogroup"
          aria-label="Wybór awatara i perspektywy rozmowy"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {modalities.map((modality) => {
            const isSelected = modality.modalityId === selectedModalityId;

            return (
              <label
                key={modality.modalityId}
                className={cn(
                  "focus-within:ring-brand-ring relative flex h-full cursor-pointer flex-col rounded-lg border-2 p-4 transition-all focus-within:ring-2 focus-within:outline-none",
                  cardAccentClasses[modality.modalityId],
                  isSelected
                    ? "border-brand ring-brand/20 shadow-[0_16px_36px_rgba(31,111,101,0.18)] ring-2"
                    : "hover:border-line-accent hover:shadow-rail hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                )}
              >
                <input
                  type="radio"
                  name="modalityId"
                  value={modality.modalityId}
                  checked={isSelected}
                  required
                  onChange={() => {
                    selectModality(modality);
                  }}
                  className="peer sr-only"
                />
                {/* The radio itself is sr-only, so an always-visible marker is the
                    only thing telling a sighted user these cards are a choice. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "bg-surface text-brand absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full border-2 shadow-sm transition-colors",
                    isSelected ? "border-brand" : "border-line-accent",
                  )}
                >
                  <CheckCircle2
                    className={cn("h-5 w-5 transition-opacity", isSelected ? "opacity-100" : "opacity-0")}
                  />
                </span>

                <div className="flex items-start gap-4">
                  <img
                    src={modality.assetPath}
                    alt={modality.altText}
                    width="384"
                    height="384"
                    loading="lazy"
                    className="aspect-square w-24 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 pr-8">
                    <p className="text-ink text-base font-semibold">{modality.avatarName}</p>
                    <p className="text-brand mt-1 text-sm leading-5 font-medium">{modality.modalityName}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-1 flex-col">
                  <p className="text-ink-soft text-sm leading-6">{modality.explanation}</p>
                  <div className="mt-auto pt-4">
                    <p className="text-ink-faint text-xs font-semibold tracking-wide uppercase">Na czym skupia uwagę</p>
                    <p className="text-ink-muted mt-2 text-sm leading-6">{modality.focus}</p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {/* The bar only appears once the selection actually differs from what is
            saved. Floating a permanent "Zapisz wybór" over the cards implied
            there was always something pending, and covered a card to say it. */}
        {hasUnsavedChoice ? (
          <div className="border-line-accent bg-surface shadow-rail sticky bottom-4 z-10 mt-5 rounded-lg border p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-ink-muted text-sm leading-6">
                {selectedModality ? (
                  <>
                    <span className="text-ink font-semibold">Zaznaczono: {selectedModality.avatarName}</span>
                    <span className="block text-xs">Wybór zacznie obowiązywać po zapisaniu.</span>
                  </>
                ) : (
                  "Zaznacz kartę, żeby wybrać perspektywę kolejnej rozmowy."
                )}
              </p>
              <button
                type="submit"
                suppressHydrationWarning
                className="bg-brand hover:bg-brand-strong focus:ring-brand-ring inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium text-white transition-colors focus:ring-2 focus:outline-none"
              >
                <Save aria-hidden="true" className="h-4 w-4" />
                Zapisz wybór
              </button>
            </div>
          </div>
        ) : null}
      </form>

      <AvatarSessionHistory
        key={`${selectedAvatar?.avatarId ?? "none"}:${historyPage}`}
        selectedAvatar={selectedAvatar}
        page={historyPage}
        onPageChange={changeHistoryPage}
        initialHistory={initialHistory}
      />
    </div>
  );
}
