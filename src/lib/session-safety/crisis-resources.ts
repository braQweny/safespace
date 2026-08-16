import type { CrisisResourceRegion, CrisisResourceRegionId } from "./types";

export const CRISIS_RESOURCE_CATALOG = {
  pl: {
    id: "pl",
    label: "Polska",
    contacts: [
      {
        kind: "emergency_number",
        label: "Numer alarmowy 112",
        value: "112",
        description: "W sytuacji bezpośredniego zagrożenia życia lub zdrowia skontaktuj się ze służbami ratunkowymi.",
      },
      {
        kind: "crisis_line",
        label: "Centrum Wsparcia dla Osób Dorosłych w Kryzysie Psychicznym",
        value: "800 70 2222",
        description: "Telefon wsparcia psychologicznego dla osób dorosłych w kryzysie psychicznym.",
      },
    ],
    note: "Te zasoby są informacyjne. W pilnym zagrożeniu wybierz lokalny numer alarmowy.",
  },
  us: {
    id: "us",
    label: "Stany Zjednoczone",
    contacts: [
      {
        kind: "crisis_line",
        label: "Linia kryzysowa 988 (Suicide & Crisis Lifeline)",
        value: "988",
        description: "Linia wsparcia dla osób w kryzysie psychicznym i samobójczym w Stanach Zjednoczonych.",
      },
      {
        kind: "emergency_number",
        label: "Numer alarmowy 911",
        value: "911",
        description: "W sytuacji bezpośredniego zagrożenia życia lub zdrowia skontaktuj się ze służbami ratunkowymi.",
      },
    ],
    note: "Te zasoby są informacyjne. W pilnym zagrożeniu wybierz numer alarmowy.",
  },
  local_fallback: {
    id: "local_fallback",
    label: "Poza wymienionymi regionami",
    contacts: [
      {
        kind: "local_guidance",
        label: "Lokalny numer alarmowy lub lokalna linia kryzysowa",
        value: "lokalny numer alarmowy",
        description:
          "Jeśli jesteś poza Polską i Stanami Zjednoczonymi, skontaktuj się z lokalnym numerem alarmowym albo lokalną linią pomocy kryzysowej.",
      },
    ],
    note: "SafeSpace nie wybiera automatycznie numeru dla Twojej lokalizacji.",
  },
} as const satisfies Readonly<Record<CrisisResourceRegionId, CrisisResourceRegion>>;

export const CRISIS_RESOURCE_REGIONS = Object.values(CRISIS_RESOURCE_CATALOG);
