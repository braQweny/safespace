import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AdminOverview from "@/components/admin/AdminOverview";
import SignInForm from "@/components/auth/SignInForm";
import AvatarChoiceForm from "@/components/modality/AvatarChoiceForm";
import DashboardSessionHistory from "@/components/modality/DashboardSessionHistory";
import PeopleCards from "@/components/people/PeopleCards";
import SessionStartCard from "@/components/session/SessionStartCard";
import TimedSession from "@/components/session/TimedSession";
import type { AdminOverviewMetrics } from "@/lib/admin/types";
import { MODALITY_CHOICES, MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";
import type { SessionStartPageState } from "@/lib/session-flow/session-state";

/**
 * Islandy dostają język propsem z Astro i same wpuszczają go do drzewa.
 * Pozostałe testy komponentów asertują po polsku przez mock `useLocale`; ten
 * plik sprawdza angielski render bez żadnego mocka — czyli tak, jak w produkcie.
 */
const cbt = MVP_MODALITIES.find((modality) => modality.modalityId === "cbt") ?? MVP_MODALITIES[1];
const avatar: SessionStartPageState["avatar"] = { modality: cbt, selected: toSelectedModalityAvatar(cbt) };

const activeState: SessionStartPageState = {
  kind: "active",
  trialAvailable: false,
  avatar,
  session: {
    id: "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a",
    status: "active",
    startedAt: "2026-06-12T10:00:00.000Z",
    endedAt: null,
    expiresAt: "2026-06-12T10:15:00.000Z",
    remainingSeconds: 600,
    isTrial: true,
    durationBucketSeconds: 900,
  },
  messages: [],
  messageFetchFailed: false,
  approvedSummaries: [],
  canStartWithoutContext: false,
  sessionQuota: null,
};

const metrics: AdminOverviewMetrics = {
  totalUsers: 18,
  blockedUsers: 2,
  premiumUsers: 4,
  sessionsByLifecycle: { completed: { value: 9, isSuppressed: false, label: "9" } },
  activeSessions: { value: null, isSuppressed: true, label: "<5" },
  completedSessions: { value: 9, isSuppressed: false, label: "9" },
  trialSessions: { value: 12, isSuppressed: false, label: "12" },
  followUpSessions: { value: null, isSuppressed: true, label: "<5" },
  approvedSummaries: { value: null, isSuppressed: true, label: "<5" },
};

describe("islands rendered in English", () => {
  it("renders the live conversation chrome in English", () => {
    const html = renderToStaticMarkup(<TimedSession locale="en" initialState={activeState} />);

    expect(html).toContain("Conversation in progress");
    expect(html).toContain("End the conversation");
    expect(html).toContain("Marek, practical guide");
    expect(html).toContain("Help now");
    expect(html).toContain("Conversation boundaries:");
    expect(html).toContain("SafeSpace is an educational conversation simulation");
    expect(html).toContain("know where to start.");
    expect(html).not.toContain("Zakończ");
    expect(html).not.toMatch(/[ąćęłńóśźż]/);
  });

  it("renders the start card in English", () => {
    const html = renderToStaticMarkup(
      <SessionStartCard locale="en" initialState={{ ...activeState, kind: "followup_ready", session: null }} />,
    );

    expect(html).toContain("Start the conversation");
    expect(html).toContain("Marek will take your earlier conversations into account.");
    expect(html).toContain("Up to 15 min of conversation");
  });

  it("renders the history section and the perspective picker in English", () => {
    const history = renderToStaticMarkup(
      <DashboardSessionHistory
        locale="en"
        selectedAvatar={avatar.selected}
        modalities={MODALITY_CHOICES}
        initialHistoryPage={1}
        initialHistory={null}
      />,
    );
    const picker = renderToStaticMarkup(
      <AvatarChoiceForm locale="en" modalities={MODALITY_CHOICES} currentSelection={null} />,
    );

    expect(history).toContain("Conversation history");
    expect(history).toContain("Conversations with:");
    expect(history).toContain("Marek, practical guide");
    expect(picker).toContain("One situation, step by step");
    expect(picker).toContain("About the approach");
    expect(picker).toContain("separate fact from interpretation for a moment…”");
  });

  it("renders the people cards in English", () => {
    const html = renderToStaticMarkup(
      <PeopleCards
        locale="en"
        avatar={avatar.selected}
        initialCards={[
          {
            id: "person-1",
            avatarId: "cbt-guide",
            name: "Marta",
            nameLocked: false,
            relation: "colleague",
            relationLocked: false,
            userNote: "",
            createdAt: "2026-09-01T10:00:00.000Z",
            firstMentionedAt: "2026-09-01T10:00:00.000Z",
            lastMentionedAt: "2026-09-05T10:00:00.000Z",
            mentionCount: 2,
            facts: [],
          },
        ]}
        peopleMemoryEnabled
      />,
    );

    expect(html).toContain("People from your conversations");
    expect(html).toContain("Marek remembers who the people you mention are to you.");
    expect(html).toContain("2 conversations");
    expect(html).toContain("last on");
    expect(html).not.toMatch(/[ąćęłńóśźż]/);
  });

  it("renders the auth form and the admin overview in English", () => {
    const form = renderToStaticMarkup(<SignInForm locale="en" />);
    const overview = renderToStaticMarkup(<AdminOverview locale="en" metrics={metrics} />);

    expect(form).toContain("Sign in");
    expect(form).toContain("Password");
    expect(form).toContain('aria-label="Show password"');
    expect(overview).toContain("Premium accounts");
    expect(overview).toContain("Session statuses");
  });
});
