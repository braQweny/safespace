import { useState } from "react";
import {
  toSelectedModalityAvatar,
  type AvatarId,
  type ModalityAvatar,
  type SelectedModalityAvatar,
} from "@/lib/modalities";
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
}

/**
 * Nazwy awatarów mają postać „Imię, rola”, a natywny select nie zawija tekstu —
 * pełna nazwa z dopiskiem „(wybrany)” ucinała się w połowie słowa. Rola i nurt
 * stoją w nagłówku tej samej sekcji, więc na liście wystarczy imię.
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
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <label htmlFor="history-avatar" className="text-ink-muted shrink-0 text-sm">
            Perspektywa
          </label>
          {/* Historia jest zapisywana osobno dla każdej perspektywy. Bez tego
              przełącznika zmiana awatara wyglądała jak zniknięcie rozmów. */}
          <select
            id="history-avatar"
            value={viewedAvatar.avatarId}
            onChange={(event) => {
              changeViewedAvatar(event.target.value as AvatarId);
            }}
            className="border-line-accent text-ink focus:ring-brand-ring h-10 w-full min-w-0 rounded-lg border bg-white px-3 text-sm transition-colors focus:ring-2 focus:outline-none sm:w-auto"
          >
            {modalities.map((modality) => (
              <option key={modality.avatarId} value={modality.avatarId}>
                {getAvatarFirstName(modality.avatarName)}
                {modality.avatarId === selectedAvatar.avatarId ? " (wybrany)" : ""}
              </option>
            ))}
          </select>
        </div>
      }
    />
  );
}
