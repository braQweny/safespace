import { useState } from "react";
import {
  toSelectedModalityAvatar,
  type AvatarId,
  type ModalityAvatar,
  type SelectedModalityAvatar,
} from "@/lib/modalities";
import { getPerspectiveTint } from "@/lib/perspective-tint";
import { cn } from "@/lib/utils";
import type { SessionHistoryListResponse } from "@/lib/session-flow/session-history-contract";
import AvatarSessionHistory from "./AvatarSessionHistory";

interface DashboardSessionHistoryProps {
  /** Perspektywa zapisana do kolejnej rozmowy — domyślna, ale nie jedyna do przejrzenia. */
  selectedAvatar: SelectedModalityAvatar;
  /** Perspektywa wskazana w adresie, żeby odświeżenie strony nie gubiło podglądu. */
  initialViewedAvatarId?: AvatarId | null;
  modalities: readonly ModalityAvatar[];
  initialHistoryPage: number;
  initialHistory: SessionHistoryListResponse | null;
  /** Klasy układu sekcji — strona ustawia historię w kolumnie obok karty startu. */
  className?: string;
}

/**
 * Nazwy awatarów mają postać „Imię, rola”. Przełącznik pokazuje same twarze, a
 * imię jest ich dostępną nazwą — rola i nurt stoją w nagłówku tej samej sekcji,
 * więc w kontrolce wystarczy imię.
 */
export function getAvatarFirstName(avatarName: string) {
  const [firstName] = avatarName.split(",");

  return firstName.trim() || avatarName;
}

function readRequestedSessionId() {
  if (typeof window === "undefined") {
    return null;
  }

  const requestedSessionId = new URL(window.location.href).searchParams.get("session");

  return requestedSessionId && requestedSessionId.length > 0 ? requestedSessionId : null;
}

function updateHistoryUrl(avatarId: AvatarId, savedAvatarId: AvatarId, page: number) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  if (avatarId === savedAvatarId) {
    url.searchParams.delete("historyAvatar");
  } else {
    url.searchParams.set("historyAvatar", avatarId);
  }

  if (page <= 1) {
    url.searchParams.delete("page");
  } else {
    url.searchParams.set("page", String(page));
  }

  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export default function DashboardSessionHistory({
  selectedAvatar,
  initialViewedAvatarId = null,
  modalities,
  initialHistoryPage,
  initialHistory,
  className,
}: DashboardSessionHistoryProps) {
  const [historyPage, setHistoryPage] = useState(initialHistoryPage);
  const [viewedAvatarId, setViewedAvatarId] = useState<AvatarId>(initialViewedAvatarId ?? selectedAvatar.avatarId);
  // Read once: the id is only meaningful for the first render after the link.
  const [requestedSessionId] = useState(readRequestedSessionId);

  const viewedModality = modalities.find((modality) => modality.avatarId === viewedAvatarId) ?? null;
  const viewedAvatar = viewedModality ? toSelectedModalityAvatar(viewedModality) : selectedAvatar;
  const isViewingSavedAvatar = viewedAvatar.avatarId === selectedAvatar.avatarId;
  // Serwer wyrenderował dokładnie tę listę — pierwsze wejście nie musi jej dopytywać.
  const isInitialView =
    viewedAvatar.avatarId === (initialViewedAvatarId ?? selectedAvatar.avatarId) && historyPage === initialHistoryPage;

  function changeHistoryPage(page: number) {
    setHistoryPage(page);
    updateHistoryUrl(viewedAvatar.avatarId, selectedAvatar.avatarId, page);
  }

  function changeViewedAvatar(avatarId: AvatarId) {
    setViewedAvatarId(avatarId);
    setHistoryPage(1);
    updateHistoryUrl(avatarId, selectedAvatar.avatarId, 1);
  }

  return (
    <AvatarSessionHistory
      key={`${viewedAvatar.avatarId}:${historyPage}`}
      className={className}
      selectedAvatar={viewedAvatar}
      page={historyPage}
      onPageChange={changeHistoryPage}
      initialHistory={isInitialView ? initialHistory : null}
      autoOpenSessionId={isInitialView ? requestedSessionId : null}
      contextNotice={
        isViewingSavedAvatar
          ? null
          : "Oglądasz zapisy innej perspektywy niż ta wybrana do kolejnej rozmowy. Sam podgląd niczego nie zmienia."
      }
      controls={
        /*
          Historia jest zapisywana osobno dla każdej perspektywy, więc
          przełącznik pokazuje twarze, nie listę rozwijaną: widać naraz, ile
          perspektyw ma swoje zapisy i czyje właśnie oglądasz.
        */
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <span id="history-avatar-label" className="text-ink-muted shrink-0 text-xs">
            Zapisy
          </span>
          <div role="radiogroup" aria-labelledby="history-avatar-label" className="flex flex-wrap gap-2">
            {modalities.map((modality) => {
              const isViewed = modality.avatarId === viewedAvatar.avatarId;
              const isSaved = modality.avatarId === selectedAvatar.avatarId;
              const tint = getPerspectiveTint(modality.modalityId);

              return (
                <label
                  key={modality.avatarId}
                  className="focus-within:ring-brand-ring relative cursor-pointer rounded-full focus-within:ring-2 focus-within:ring-offset-2 focus-within:outline-none"
                >
                  <input
                    type="radio"
                    name="history-avatar"
                    value={modality.avatarId}
                    checked={isViewed}
                    onChange={() => {
                      changeViewedAvatar(modality.avatarId);
                    }}
                    className="peer sr-only"
                  />
                  <img
                    src={modality.assetPath}
                    alt={`${getAvatarFirstName(modality.avatarName)}${isSaved ? " (wybrany)" : ""}`}
                    width="256"
                    height="256"
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "h-9 w-9 rounded-full object-cover transition-opacity",
                      isViewed
                        ? cn("ring-offset-surface opacity-100 ring-2 ring-offset-2", tint.ring)
                        : "opacity-55 hover:opacity-100",
                    )}
                  />
                  {isSaved ? (
                    <span
                      aria-hidden="true"
                      className="bg-brand ring-surface absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2"
                    />
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>
      }
    />
  );
}
