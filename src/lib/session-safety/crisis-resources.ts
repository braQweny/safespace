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
        description: "W sytuacji bezposredniego zagrozenia zycia lub zdrowia skontaktuj sie ze sluzbami ratunkowymi.",
      },
      {
        kind: "crisis_line",
        label: "Centrum Wsparcia dla Osob Doroslych w Kryzysie Psychicznym",
        value: "800 70 2222",
        description: "Telefon wsparcia psychologicznego dla osob doroslych w kryzysie psychicznym.",
      },
    ],
    note: "Te zasoby sa informacyjne. W pilnym zagrozeniu wybierz lokalny numer alarmowy.",
  },
  us: {
    id: "us",
    label: "United States",
    contacts: [
      {
        kind: "crisis_line",
        label: "988 Suicide & Crisis Lifeline",
        value: "988",
        description: "Crisis and suicide support line for people in the United States.",
      },
      {
        kind: "emergency_number",
        label: "Emergency services",
        value: "911",
        description: "For immediate danger to life or health, contact emergency services.",
      },
    ],
    note: "These resources are informational. If there is immediate danger, use emergency services.",
  },
  local_fallback: {
    id: "local_fallback",
    label: "Poza wymienionymi regionami",
    contacts: [
      {
        kind: "local_guidance",
        label: "Lokalny numer alarmowy lub lokalna linia kryzysowa",
        value: "local emergency number",
        description:
          "Jesli jestes poza Polska i Stanami Zjednoczonymi, skontaktuj sie z lokalnym numerem alarmowym albo lokalna linia pomocy kryzysowej.",
      },
    ],
    note: "SafeSpace nie wybiera automatycznie numeru dla Twojej lokalizacji.",
  },
} as const satisfies Readonly<Record<CrisisResourceRegionId, CrisisResourceRegion>>;

export const CRISIS_RESOURCE_REGIONS = Object.values(CRISIS_RESOURCE_CATALOG);
