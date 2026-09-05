import { useState } from "react";
import {
  toSelectedModalityAvatar,
  type AvatarId,
  type ModalityAvatar,
  type SelectedModalityAvatar,
} from "@/lib/modalities";
import { cn } from "@/lib/utils";
import type { OwnedSessionCountsByAvatar } from "@/lib/session-data/types";
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
  /**
   * Ile rozmów stoi za każdą twarzą (dana zbiorcza, bez treści). Bez tego —
   * odczyt padł — filtr pokazuje wszystkie pięć, jak dawniej.
   */
  sessionCountsByAvatar?: OwnedSessionCountsByAvatar | null;
  /** Klasy układu sekcji — strona ustawia historię w kolumnie obok karty startu. */
  className?: string;
}

/**
 * Które twarze pokazać w filtrze. Bez liczb — wszystkie. Z liczbami — tylko
 * perspektywy, z którymi były rozmowy, plus zapisana i ta z adresu, żeby
 * zaznaczony przełącznik nigdy nie zniknął spod ręki. Pięć przełączników, z
 * których cztery prowadziły do pustej listy, obiecywało coś, czego nie było.
 */
export function selectHistoryFilterModalities(
  modalities: readonly ModalityAvatar[],
  counts: OwnedSessionCountsByAvatar | null | undefined,
  keepAvatarIds: readonly AvatarId[],
) {
  if (!counts) {
    return [...modalities];
  }

  return modalities.filter(
    (modality) => (counts[modality.avatarId] ?? 0) > 0 || keepAvatarIds.includes(modality.avatarId),
  );
}

/** Krótkie, widoczne imiona w filtrze historii. */
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
  sessionCountsByAvatar = null,
  className,
}: DashboardSessionHistoryProps) {
  const [historyPage, setHistoryPage] = useState(initialHistoryPage);
  const [viewedAvatarId, setViewedAvatarId] = useState<AvatarId>(initialViewedAvatarId ?? selectedAvatar.avatarId);
  // Read once: the id is only meaningful for the first render after the link.
  const [requestedSessionId] = useState(readRequestedSessionId);

  const viewedModality = modalities.find((modality) => modality.avatarId === viewedAvatarId) ?? null;
  const viewedAvatar = viewedModality ? toSelectedModalityAvatar(viewedModality) : selectedAvatar;
  const isViewingSavedAvatar = viewedAvatar.avatarId === selectedAvatar.avatarId;
  const filterModalities = selectHistoryFilterModalities(modalities, sessionCountsByAvatar, [
    selectedAvatar.avatarId,
    viewedAvatar.avatarId,
  ]);
  // Jedna twarz to nie filtr: nazwa perspektywy stoi już w nagłówku sekcji.
  const showsFilter = filterModalities.length > 1;
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
      className={className}
      selectedAvatar={viewedAvatar}
      page={historyPage}
      onPageChange={changeHistoryPage}
      initialHistory={isInitialView ? initialHistory : null}
      autoOpenSessionId={isInitialView ? requestedSessionId : null}
      contextNotice={
        isViewingSavedAvatar
          ? null
          : "Kolejną rozmowę rozpoczniesz z zapisaną perspektywą. Ten filtr zmienia tylko historię."
      }
      controls={
        showsFilter ? (
          <div className="w-full">
            <span id="history-avatar-label" className="text-ink-muted mb-2 block text-sm">
              Rozmowy z:
            </span>
            <div role="radiogroup" aria-labelledby="history-avatar-label" className="flex flex-wrap gap-1.5">
              {filterModalities.map((modality) => {
                const isViewed = modality.avatarId === viewedAvatar.avatarId;
                const count = sessionCountsByAvatar?.[modality.avatarId] ?? null;

                return (
                  <label
                    key={modality.avatarId}
                    className={cn(
                      "focus-within:ring-brand-ring flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-offset-2",
                      isViewed
                        ? "border-brand bg-brand-tint text-brand-deep"
                        : "border-line-strong text-ink-muted hover:bg-surface-soft",
                    )}
                  >
                    <input
                      type="radio"
                      name="history-avatar"
                      value={modality.avatarId}
                      aria-label={getAvatarFirstName(modality.avatarName)}
                      checked={isViewed}
                      onChange={() => {
                        changeViewedAvatar(modality.avatarId);
                      }}
                      className="peer sr-only"
                    />
                    <img
                      src={modality.assetPath}
                      alt=""
                      width="256"
                      height="256"
                      loading="lazy"
                      decoding="async"
                      className="h-6 w-6 rounded-full object-cover"
                    />
                    <span>{getAvatarFirstName(modality.avatarName)}</span>
                    {count !== null ? (
                      <span className="text-ink-muted tabular-nums">
                        <span aria-hidden="true"> · </span>
                        <span className="sr-only">, rozmów: </span>
                        {count}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </div>
        ) : null
      }
    />
  );
}
