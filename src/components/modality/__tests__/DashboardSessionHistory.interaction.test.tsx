// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiJsonResult } from "@/lib/api-client";
import { MODALITY_CHOICES, type AvatarId, type SelectedModalityAvatar } from "@/lib/modality-catalog";
import type { SessionHistoryListItem } from "@/lib/session-data/types";
import type { SessionHistoryListResponse } from "@/lib/session-flow/session-history-contract";
import DashboardSessionHistory from "../DashboardSessionHistory";
import { getOpenDetailButtonId } from "../SessionHistoryList";
import { getSessionHistoryCopy } from "../session-history-copy";

// The fetch layer: every history read goes through `requestApiJson`; the rest of the hooks run for real.
const requestApiJson = vi.hoisted(() => vi.fn<(url: string, init?: unknown) => Promise<ApiJsonResult>>());
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  requestApiJson,
}));

const copy = getSessionHistoryCopy("pl");
const [first, second, third] = MODALITY_CHOICES;
const saved = second;

function historyItem(id: string): SessionHistoryListItem {
  return {
    id,
    status: "completed",
    startedAt: "2026-06-07T08:00:00.000Z",
    endedAt: "2026-06-07T08:12:00.000Z",
    expiresAt: "2026-06-07T08:15:00.000Z",
    durationBucketSeconds: 900,
    isTrial: false,
    summaryState: "none",
    createdAt: "2026-06-07T08:00:00.000Z",
    updatedAt: "2026-06-07T08:12:00.000Z",
  };
}

function historyResponse(avatar: SelectedModalityAvatar, page: number): SessionHistoryListResponse {
  return {
    ok: true,
    type: "session_history_list",
    avatar,
    items: [historyItem(`${avatar.avatarId}-page-${page}`)],
    pagination: { page, pageSize: 20, hasNextPage: page === 1, hasPreviousPage: page > 1 },
  };
}

function rowFor(avatarId: AvatarId, page = 1) {
  return document.getElementById(getOpenDetailButtonId(`${avatarId}-page-${page}`));
}

function radioFor(avatar: SelectedModalityAvatar) {
  const radio = document.querySelector<HTMLInputElement>(`input[type="radio"][value="${avatar.avatarId}"]`);
  if (!radio) throw new Error(`no radio for ${avatar.avatarId}`);
  return radio;
}

function renderHistory() {
  render(
    <DashboardSessionHistory
      locale="pl"
      selectedAvatar={saved}
      modalities={MODALITY_CHOICES}
      initialHistoryPage={1}
      initialHistory={historyResponse(saved, 1)}
      sessionCountsByAvatar={{ [first.avatarId]: 2, [saved.avatarId]: 3, [third.avatarId]: 1 }}
    />,
  );
  return userEvent.setup();
}

beforeEach(() => {
  window.history.replaceState({}, "", "/dashboard");
  requestApiJson.mockImplementation((url: string) => {
    const params = new URL(url, window.location.origin).searchParams;
    const avatar = MODALITY_CHOICES.find((entry) => entry.avatarId === params.get("avatar")) ?? saved;
    return Promise.resolve({ kind: "json", status: 200, body: historyResponse(avatar, Number(params.get("page"))) });
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DashboardSessionHistory keyboard filter", () => {
  it("moves between perspectives with the arrow keys and keeps focus on the radio while only the list reloads", async () => {
    const user = renderHistory();
    const group = screen.getByRole("radiogroup");
    const savedRadio = radioFor(saved);
    const nextRadio = radioFor(third);
    const serverRow = rowFor(saved.avatarId);

    // The server-rendered list needs no request on hydration.
    expect(serverRow).not.toBeNull();
    expect(requestApiJson).not.toHaveBeenCalled();
    expect(savedRadio.checked).toBe(true);

    savedRadio.focus();
    await user.keyboard("{ArrowRight}");

    // The browser moves the checked state and focus to the next radio in the group…
    expect(nextRadio.checked).toBe(true);
    expect(document.activeElement).toBe(nextRadio);
    // …the data subtree is replaced and fetches the other perspective…
    await waitFor(() => {
      expect(rowFor(third.avatarId)).not.toBeNull();
    });
    expect(serverRow?.isConnected).toBe(false);
    expect(requestApiJson).toHaveBeenCalledWith(`/api/session/history?avatar=${third.avatarId}&page=1`, {
      signal: expect.any(AbortSignal) as AbortSignal,
    });
    // …while the filter itself was never remounted, so focus stayed where the keyboard is.
    expect(screen.getByRole("radiogroup")).toBe(group);
    expect(radioFor(third)).toBe(nextRadio);
    expect(document.activeElement).toBe(nextRadio);
    expect(window.location.search).toBe(`?historyAvatar=${third.avatarId}`);
    expect(screen.getByText(copy.filterNotice)).toBeTruthy();

    // Back across the saved perspective to the first one: the address drops the filter for the saved one.
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(savedRadio);
    expect(window.location.search).toBe("");
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(radioFor(first));
    expect(radioFor(first).checked).toBe(true);
    await waitFor(() => {
      expect(rowFor(first.avatarId)).not.toBeNull();
    });
    expect(screen.getByRole("radiogroup")).toBe(group);
    expect(document.activeElement).toBe(radioFor(first));
  });

  it("keeps the same filter mounted when the page changes and resets only the list", async () => {
    const user = renderHistory();
    const group = screen.getByRole("radiogroup");
    const savedRadio = radioFor(saved);
    const firstPageRow = rowFor(saved.avatarId);

    await user.click(screen.getByRole("button", { name: copy.next }));

    await waitFor(() => {
      expect(rowFor(saved.avatarId, 2)).not.toBeNull();
    });
    expect(firstPageRow?.isConnected).toBe(false);
    expect(screen.getByRole("radiogroup")).toBe(group);
    expect(radioFor(saved)).toBe(savedRadio);
    expect(savedRadio.checked).toBe(true);
    expect(window.location.search).toBe("?page=2");

    // Choosing another perspective from page 2 starts it on page 1.
    savedRadio.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => {
      expect(rowFor(third.avatarId, 1)).not.toBeNull();
    });
    expect(document.activeElement).toBe(radioFor(third));
    expect(window.location.search).toBe(`?historyAvatar=${third.avatarId}`);
  });
});
