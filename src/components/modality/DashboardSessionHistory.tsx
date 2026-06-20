import { useState } from "react";
import type { SelectedModalityAvatar } from "@/lib/modalities";
import type { SessionHistoryListResponse } from "@/lib/session-flow/session-history-contract";
import AvatarSessionHistory from "./AvatarSessionHistory";

interface DashboardSessionHistoryProps {
  selectedAvatar: SelectedModalityAvatar;
  initialHistoryPage: number;
  initialHistory: SessionHistoryListResponse | null;
}

function updateHistoryPageUrl(page: number) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  if (page <= 1) {
    url.searchParams.delete("page");
  } else {
    url.searchParams.set("page", String(page));
  }

  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export default function DashboardSessionHistory({
  selectedAvatar,
  initialHistoryPage,
  initialHistory,
}: DashboardSessionHistoryProps) {
  const [historyPage, setHistoryPage] = useState(initialHistoryPage);

  function changeHistoryPage(page: number) {
    setHistoryPage(page);
    updateHistoryPageUrl(page);
  }

  return (
    <AvatarSessionHistory
      key={`${selectedAvatar.avatarId}:${historyPage}`}
      selectedAvatar={selectedAvatar}
      page={historyPage}
      onPageChange={changeHistoryPage}
      initialHistory={historyPage === initialHistoryPage ? initialHistory : null}
    />
  );
}
