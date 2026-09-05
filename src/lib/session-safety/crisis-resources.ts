import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";
import type { CrisisResourceRegion, CrisisResourceRegionId } from "./types";

type CrisisResourceCatalog = Readonly<Record<CrisisResourceRegionId, CrisisResourceRegion>>;

/**
 * Numery i kolejność regionów są identyczne w obu językach — tłumaczą się
 * tylko etykiety, opisy i uwagi. Region nie jest wykrywany: każdy ekran
 * kryzysowy pokazuje wszystkie trzy wpisy.
 */
const CRISIS_RESOURCE_COPY = defineCopy<CrisisResourceCatalog>(
  {
    pl: {
      id: "pl",
      label: "Poland",
      contacts: [
        {
          kind: "emergency_number",
          label: "Emergency number 112",
          value: "112",
          description: "In an immediate threat to life or health, contact the emergency services.",
        },
        {
          kind: "crisis_line",
          label: "Crisis Support Centre for Adults (Centrum Wsparcia)",
          value: "800 70 2222",
          description: "Psychological support line for adults in a mental health crisis (Polish-speaking).",
        },
      ],
      note: "These resources are for information. In an urgent threat, call your local emergency number.",
    },
    us: {
      id: "us",
      label: "United States",
      contacts: [
        {
          kind: "crisis_line",
          label: "988 Suicide & Crisis Lifeline",
          value: "988",
          description: "Support line for people in a mental health or suicidal crisis in the United States.",
        },
        {
          kind: "emergency_number",
          label: "Emergency number 911",
          value: "911",
          description: "In an immediate threat to life or health, contact the emergency services.",
        },
      ],
      note: "These resources are for information. In an urgent threat, call the emergency number.",
    },
    local_fallback: {
      id: "local_fallback",
      label: "Outside the listed regions",
      contacts: [
        {
          kind: "local_guidance",
          label: "Local emergency number or local crisis line",
          value: "your local emergency number",
          description:
            "If you are outside Poland and the United States, contact your local emergency number or a local crisis helpline.",
        },
      ],
      note: "SafeSpace does not choose a number for your location automatically.",
    },
  },
  {
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
  },
);

export function getCrisisResourceCatalog(locale: Locale): CrisisResourceCatalog {
  return CRISIS_RESOURCE_COPY[locale];
}

export function getCrisisResourceRegions(locale: Locale): readonly CrisisResourceRegion[] {
  return Object.values(getCrisisResourceCatalog(locale));
}
