import type { AdminApiFailureCode } from "@/lib/admin/contracts";
import type {
  AdminBlockReasonCode,
  AdminUserPlanFilter,
  AdminUserSort,
  AdminUserStatusFilter,
} from "@/lib/admin/types";
import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

interface LabelledOption<Value extends string> {
  value: Value;
  label: string;
}

interface AdminCopy {
  shell: {
    back: string;
    eyebrow: string;
    signOut: string;
    navAria: string;
    navOverview: string;
    navUsers: string;
  };
  pages: {
    overviewPageTitle: string;
    overviewTitle: string;
    overviewFailed: string;
    usersPageTitle: string;
    usersTitle: string;
    noAccessTitle: string;
    noAccessBody: string;
    backToDashboard: string;
  };
  overview: {
    lifecycleLabels: Readonly<Record<string, string>>;
    mainStatsAria: string;
    users: string;
    premium: string;
    premiumNote: string;
    blocked: string;
    activeSessions: string;
    activeNote: string;
    completedSessions: string;
    completedNote: string;
    lifecycleTitle: string;
    otherTitle: string;
    trialSessions: string;
    followUpSessions: string;
    approvedSummaries: string;
  };
  table: {
    reasonOptions: readonly LabelledOption<AdminBlockReasonCode>[];
    statusOptions: readonly LabelledOption<AdminUserStatusFilter>[];
    planOptions: readonly LabelledOption<AdminUserPlanFilter>[];
    sortOptions: readonly LabelledOption<AdminUserSort>[];
    none: string;
    statusBlocked: string;
    statusActive: string;
    planPremium: string;
    planFree: string;
    errors: Readonly<Partial<Record<AdminApiFailureCode, string>>>;
    defaultError: string;
    errorCode: (code: string) => string;
    emailLabel: string;
    statusLabel: string;
    planLabel: string;
    sortLabel: string;
    search: string;
    tableAria: string;
    headers: {
      email: string;
      status: string;
      plan: string;
      created: string;
      activity: string;
      sessions: string;
      summaries: string;
      actions: string;
    };
    empty: string;
    sessionsCell: (total: number, active: number) => string;
    revokePremium: string;
    grantPremium: string;
    blockReasonAria: string;
    unblock: string;
    block: string;
    pageSummary: (page: number, total: number) => string;
    previous: string;
    next: string;
  };
}

const ADMIN_COPY = defineCopy<AdminCopy>(
  {
    shell: {
      back: "← Back to the dashboard",
      eyebrow: "SafeSpace administration",
      signOut: "Sign out",
      navAria: "Admin navigation",
      navOverview: "Statistics",
      navUsers: "Users",
    },
    pages: {
      overviewPageTitle: "Admin - SafeSpace",
      overviewTitle: "Product statistics",
      overviewFailed: "We couldn't load the admin statistics.",
      usersPageTitle: "Admin users - SafeSpace",
      usersTitle: "Users",
      noAccessTitle: "No access",
      noAccessBody: "This part of the product is available only to active administrators.",
      backToDashboard: "Back to the dashboard",
    },
    overview: {
      lifecycleLabels: {
        created: "Created",
        active: "Active",
        completed: "Completed",
        expired: "Timed out",
        interrupted: "Interrupted",
        deleted: "Deleted",
      },
      mainStatsAria: "Main statistics",
      users: "Users",
      premium: "Premium accounts",
      premiumNote: "No session limit.",
      blocked: "Blocked accounts",
      activeSessions: "Active sessions",
      activeNote: "Small cohorts are hidden.",
      completedSessions: "Completed sessions",
      completedNote: "Status only, no conversation content.",
      lifecycleTitle: "Session statuses",
      otherTitle: "Other counters",
      trialSessions: "Trial sessions",
      followUpSessions: "Follow-up sessions",
      approvedSummaries: "Approved summaries",
    },
    table: {
      reasonOptions: [
        { value: "policy_violation", label: "Policy violation" },
        { value: "safety_risk", label: "Safety risk" },
        { value: "abuse_prevention", label: "Abuse prevention" },
        { value: "owner_request", label: "Owner's decision" },
        { value: "other", label: "Other reason" },
      ],
      statusOptions: [
        { value: "all", label: "All" },
        { value: "active", label: "Active" },
        { value: "blocked", label: "Blocked" },
      ],
      planOptions: [
        { value: "all", label: "All" },
        { value: "free", label: "Free" },
        { value: "premium", label: "Premium" },
      ],
      sortOptions: [
        { value: "created_desc", label: "Newest accounts" },
        { value: "created_asc", label: "Oldest accounts" },
        { value: "last_activity_desc", label: "Latest activity" },
        { value: "last_activity_asc", label: "Least recent activity" },
      ],
      none: "None",
      statusBlocked: "Blocked",
      statusActive: "Active",
      planPremium: "Premium",
      planFree: "Free",
      errors: {
        missing_auth: "The admin session has expired. Sign in again.",
        not_admin: "This account has no administrator permissions.",
        blocked_admin: "This administrator account is blocked.",
        invalid_filter: "Invalid request parameters. Check the filters and try again.",
        target_not_found: "No such account was found. Refresh the list and try again.",
        self_target_forbidden: "You can't change the block or plan of your own account.",
        write_failed: "The change couldn't be saved. Please try again in a moment.",
        admin_data_unavailable: "Admin data is temporarily unavailable. Please try again in a moment.",
      },
      defaultError: "We couldn't load the admin data. Please try again in a moment.",
      errorCode: (code) => `(code: ${code})`,
      emailLabel: "E-mail",
      statusLabel: "Status",
      planLabel: "Plan",
      sortLabel: "Sort by",
      search: "Search",
      tableAria: "User list",
      headers: {
        email: "E-mail",
        status: "Status",
        plan: "Plan",
        created: "Created",
        activity: "Activity",
        sessions: "Sessions",
        summaries: "Summaries",
        actions: "Actions",
      },
      empty: "No users match the selected filters.",
      sessionsCell: (total, active) => `${total} total, ${active} active`,
      revokePremium: "Revoke premium",
      grantPremium: "Grant premium",
      blockReasonAria: "Block reason",
      unblock: "Unblock",
      block: "Block",
      pageSummary: (page, total) => `Page ${page}, users: ${total}`,
      previous: "Previous",
      next: "Next",
    },
  },
  {
    shell: {
      back: "← Wróć do panelu",
      eyebrow: "Administracja SafeSpace",
      signOut: "Wyloguj się",
      navAria: "Nawigacja admina",
      navOverview: "Statystyki",
      navUsers: "Użytkownicy",
    },
    pages: {
      overviewPageTitle: "Admin - SafeSpace",
      overviewTitle: "Statystyki produktu",
      overviewFailed: "Nie udało się pobrać statystyk administracyjnych.",
      usersPageTitle: "Użytkownicy admin - SafeSpace",
      usersTitle: "Użytkownicy",
      noAccessTitle: "Brak dostępu",
      noAccessBody: "Ta część produktu jest dostępna tylko dla aktywnych administratorów.",
      backToDashboard: "Wróć do panelu",
    },
    overview: {
      lifecycleLabels: {
        created: "Utworzone",
        active: "Aktywne",
        completed: "Zakończone",
        expired: "Po czasie",
        interrupted: "Przerwane",
        deleted: "Usunięte",
      },
      mainStatsAria: "Główne statystyki",
      users: "Użytkownicy",
      premium: "Konta premium",
      premiumNote: "Bez limitu sesji.",
      blocked: "Zablokowane konta",
      activeSessions: "Aktywne sesje",
      activeNote: "Małe kohorty są ukrywane.",
      completedSessions: "Zakończone sesje",
      completedNote: "Status bez treści rozmów.",
      lifecycleTitle: "Statusy sesji",
      otherTitle: "Pozostałe liczniki",
      trialSessions: "Sesje próbne",
      followUpSessions: "Kolejne sesje",
      approvedSummaries: "Zatwierdzone podsumowania",
    },
    table: {
      reasonOptions: [
        { value: "policy_violation", label: "Naruszenie zasad" },
        { value: "safety_risk", label: "Ryzyko bezpieczeństwa" },
        { value: "abuse_prevention", label: "Ochrona przed nadużyciem" },
        { value: "owner_request", label: "Decyzja właściciela" },
        { value: "other", label: "Inny powód" },
      ],
      statusOptions: [
        { value: "all", label: "Wszystkie" },
        { value: "active", label: "Aktywne" },
        { value: "blocked", label: "Zablokowane" },
      ],
      planOptions: [
        { value: "all", label: "Wszystkie" },
        { value: "free", label: "Bezpłatny" },
        { value: "premium", label: "Premium" },
      ],
      sortOptions: [
        { value: "created_desc", label: "Najnowsze konta" },
        { value: "created_asc", label: "Najstarsze konta" },
        { value: "last_activity_desc", label: "Ostatnia aktywność" },
        { value: "last_activity_asc", label: "Najdawniejsza aktywność" },
      ],
      none: "Brak",
      statusBlocked: "Zablokowane",
      statusActive: "Aktywne",
      planPremium: "Premium",
      planFree: "Bezpłatny",
      errors: {
        missing_auth: "Sesja administratora wygasła. Zaloguj się ponownie.",
        not_admin: "To konto nie ma uprawnień administratora.",
        blocked_admin: "To konto administratora jest zablokowane.",
        invalid_filter: "Nieprawidłowe parametry żądania. Sprawdź filtry i spróbuj ponownie.",
        target_not_found: "Nie znaleziono takiego konta. Odśwież listę i spróbuj ponownie.",
        self_target_forbidden: "Nie możesz zmienić blokady ani planu własnego konta.",
        write_failed: "Nie udało się zapisać zmiany. Spróbuj ponownie za chwilę.",
        admin_data_unavailable: "Dane administracyjne są chwilowo niedostępne. Spróbuj ponownie za chwilę.",
      },
      defaultError: "Nie udało się pobrać danych administracyjnych. Spróbuj ponownie za chwilę.",
      errorCode: (code) => `(kod: ${code})`,
      emailLabel: "E-mail",
      statusLabel: "Status",
      planLabel: "Plan",
      sortLabel: "Sortowanie",
      search: "Szukaj",
      tableAria: "Lista użytkowników",
      headers: {
        email: "E-mail",
        status: "Status",
        plan: "Plan",
        created: "Utworzone",
        activity: "Aktywność",
        sessions: "Sesje",
        summaries: "Podsumowania",
        actions: "Akcje",
      },
      empty: "Brak użytkowników dla wybranych filtrów.",
      sessionsCell: (total, active) => `${total} razem, ${active} aktywne`,
      revokePremium: "Odbierz premium",
      grantPremium: "Nadaj premium",
      blockReasonAria: "Powód blokady",
      unblock: "Odblokuj",
      block: "Zablokuj",
      pageSummary: (page, total) => `Strona ${page}, użytkowników: ${total}`,
      previous: "Poprzednia",
      next: "Następna",
    },
  },
);

export function getAdminCopy(locale: Locale): AdminCopy {
  return ADMIN_COPY[locale];
}
