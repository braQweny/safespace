import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MODALITY_CATALOG, toSelectedModalityAvatar } from "@/lib/modality-catalog";
import { getPlanCopy } from "@/lib/session-flow/plan-copy";
import type { SessionStartPageState, SessionView } from "@/lib/session-flow/session-state";
import {
  getInitialVoiceSessionState,
  voiceSessionReducer,
  type VoiceConnectRefusal,
  type VoiceSessionUiState,
} from "@/lib/session-flow/voice-session-state";
import { getVoiceSessionCopy } from "../voice-session-copy";

// Stan po odmowie `connect` powstaje dopiero w reduktorze, więc hook podaje go wprost.
const hookState = vi.hoisted(() => ({ current: null as VoiceSessionUiState | null }));
vi.mock("@/components/hooks/useVoiceSession", () => ({
  useVoiceSession: () => ({
    state: hookState.current,
    liveFragments: [],
    remoteStream: null,
    enableMicrophone: vi.fn(),
    reconnect: vi.fn(),
    toggleMute: vi.fn(),
    reportAudioBlocked: vi.fn(),
    reportAudioUnblocked: vi.fn(),
    handleExpired: vi.fn(),
    endSession: vi.fn(),
  }),
}));

const { default: VoiceSession } = await import("../VoiceSession");

const cbt = MODALITY_CATALOG.find((entry) => entry.modalityId === "cbt") ?? MODALITY_CATALOG[1];
const session: SessionView = {
  id: "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a",
  status: "active",
  startedAt: "2026-06-12T10:00:00.000Z",
  endedAt: null,
  expiresAt: "2026-06-12T11:00:00.000Z",
  remainingSeconds: 3000,
  isTrial: false,
  durationBucketSeconds: 3600,
  mode: "voice",
};
const initialState: SessionStartPageState = {
  kind: "active",
  trialAvailable: false,
  avatar: { selected: toSelectedModalityAvatar(cbt) },
  session,
  messages: [],
  messageFetchFailed: false,
  sessionQuota: null,
};

function renderRefused(
  refusal: VoiceConnectRefusal,
  locale: "pl" | "en" = "pl",
  messages: SessionStartPageState["messages"] = [],
) {
  const state = { ...initialState, messages };
  hookState.current = voiceSessionReducer(getInitialVoiceSessionState(state, { voiceAvailable: true }), {
    type: "connect_refused",
    refusal,
  });
  return renderToStaticMarkup(<VoiceSession locale={locale} initialState={state} voiceAvailable />);
}

describe("VoiceSession after a pool refusal", () => {
  it("says the monthly minutes are used up and when they renew, with a way back to the dashboard and no retry", () => {
    const html = renderRefused("voice_minutes_exhausted");
    const copy = getVoiceSessionCopy("pl");

    expect(html).toContain('data-voice-refused="voice_minutes_exhausted"');
    expect(html).toContain(copy.refusedTitle);
    expect(html).toContain(getPlanCopy("pl").voiceMinutesExhausted);
    expect(html).toContain(copy.refusedNextStep);
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain('href="/account/security"');
    // No button that would only be refused again.
    expect(html).not.toContain(copy.enableMicrophone);
    expect(html).not.toContain(copy.reconnect);
    // Ending the conversation stays available in the header.
    expect(html).toContain("Zakończ rozmowę");
  });

  it("keeps the saved transcript visible under the refusal when the conversation already had one", () => {
    const html = renderRefused("voice_minutes_exhausted", "pl", [
      {
        id: "m1",
        role: "assistant",
        sequenceIndex: 0,
        content: "Cześć, jestem Marek.",
        createdAt: "2026-06-12T10:00:05.000Z",
      },
      {
        id: "m2",
        role: "user",
        sequenceIndex: 1,
        content: "Ciężko mi dziś wstać.",
        createdAt: "2026-06-12T10:00:20.000Z",
      },
    ]);

    expect(html).toContain('data-voice-refused="voice_minutes_exhausted"');
    expect(html).toContain("Cześć, jestem Marek.");
    expect(html).toContain("Ciężko mi dziś wstać.");
    // A static record, not a live region that would re-announce every row.
    expect(html).not.toContain('aria-live="off"');
  });

  it("shows no empty transcript placeholder for a refusal before anything was said", () => {
    const html = renderRefused("voice_minutes_exhausted");

    expect(html).not.toContain(getVoiceSessionCopy("pl").transcriptEmpty);
  });

  it("points a spent trial to the account plan with the start card's wording, in both languages", () => {
    for (const locale of ["pl", "en"] as const) {
      const html = renderRefused("voice_trial_used", locale);
      const copy = getVoiceSessionCopy(locale);

      expect(html).toContain('data-voice-refused="voice_trial_used"');
      expect(html).toContain(getPlanCopy(locale).voiceTrialUsed);
      expect(html).toContain(`href="/account/security"`);
      expect(html).toContain(copy.refusedPlanLink);
      expect(html).toContain('href="/dashboard"');
      expect(html).not.toContain(copy.enableMicrophone);
      // On screen it is always a conversation, never a session.
      expect([copy.refusedTitle, copy.refusedNextStep, copy.refusedPlanLink].join(" ")).not.toMatch(/session|sesj/i);
    }
  });
});
