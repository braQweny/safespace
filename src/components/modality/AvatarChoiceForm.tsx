import { useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
import {
  toSelectedModalityAvatar,
  type ModalityAvatar,
  type ModalityId,
  type SelectedModalityAvatar,
} from "@/lib/modalities";
import type { SessionHistoryListResponse } from "@/lib/session-flow/session-history-contract";
import { cn } from "@/lib/utils";
import AvatarSessionHistory from "./AvatarSessionHistory";

interface AvatarChoiceFormProps {
  modalities: readonly ModalityAvatar[];
  currentSelection: SelectedModalityAvatar | null;
  initialHistoryPage: number;
  initialHistory: SessionHistoryListResponse | null;
}

const cardAccentClasses: Record<ModalityId, string> = {
  psychodynamic: "border-[#b9d7cf] bg-[#f7fbfa]",
  cbt: "border-[#c8d4ee] bg-[#f8faff]",
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
  const isBrowser = typeof window !== "undefined";
  const selectedModality = modalities.find((modality) => modality.modalityId === selectedModalityId) ?? null;
  const selectedAvatar = selectedModality ? toSelectedModalityAvatar(selectedModality) : null;

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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {modalities.map((modality) => {
            const isSelected = modality.modalityId === selectedModalityId;

            return (
              <label
                key={modality.modalityId}
                className={cn(
                  "relative flex min-h-[530px] cursor-pointer flex-col rounded-lg border-2 p-4 transition-colors focus-within:ring-2 focus-within:ring-[#2d8a7d] focus-within:outline-none has-[:checked]:border-[#1f6f65] has-[:checked]:shadow-[0_16px_36px_rgba(31,111,101,0.18)]",
                  cardAccentClasses[modality.modalityId],
                  isSelected ? "border-[#1f6f65] shadow-[0_16px_36px_rgba(31,111,101,0.18)]" : "hover:border-[#7fb7ad]",
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
                <span className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#1f6f65] opacity-0 shadow-sm transition-opacity peer-checked:opacity-100">
                  <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
                </span>

                <img
                  src={modality.assetPath}
                  alt={modality.altText}
                  width="384"
                  height="384"
                  loading="lazy"
                  className="mx-auto aspect-square w-full max-w-40 rounded-lg object-cover"
                />

                <div className="mt-4 flex flex-1 flex-col">
                  <p className="text-base font-semibold text-[#10231f]">{modality.avatarName}</p>
                  <p className="mt-1 min-h-12 text-sm leading-5 font-medium text-[#1f6f65]">{modality.modalityName}</p>
                  <p className="mt-3 text-sm leading-6 text-[#38524b]">{modality.explanation}</p>
                  <div className="mt-auto pt-4">
                    <p className="text-xs font-semibold tracking-wide text-[#62756f] uppercase">Na czym skupia uwagę</p>
                    <p className="mt-2 text-sm leading-6 text-[#52645f]">{modality.focus}</p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {selectedModality ? (
          <div className="mt-5 rounded-lg border border-[#d7e5e0] bg-white p-4 text-sm leading-6 text-[#38524b]">
            <p className="font-semibold text-[#10231f]">Wybrany awatar: {selectedModality.avatarName}</p>
            <p className="mt-1">
              Zapisanie wyboru ustawi perspektywę dla kolejnej sesji. Historia poniżej reaguje już na samo zaznaczenie
              karty.
            </p>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isBrowser && !selectedModality}
          suppressHydrationWarning
          className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#1f6f65] px-5 text-sm font-medium text-white transition-colors hover:bg-[#185950] focus:ring-2 focus:ring-[#2d8a7d] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#9abbb4]"
        >
          <Save aria-hidden="true" className="h-4 w-4" />
          Zapisz wybór
        </button>
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
