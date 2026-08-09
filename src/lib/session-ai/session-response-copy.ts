import type { SessionAiErrorCategory } from "./errors";
import type { SessionAiFailureCopy } from "./types";

const RETRY_LABEL = "Spróbuj ponownie";

const SESSION_AI_FAILURE_COPY = {
  missing_configuration: {
    title: "Nie możemy teraz przygotować odpowiedzi",
    body: "Konfiguracja AI dla sesji nie jest dostępna. SafeSpace nie będzie udawać odpowiedzi, gdy zwykły model nie może zostać bezpiecznie wywołany.",
    retryLabel: RETRY_LABEL,
  },
  provider_timeout: {
    title: "Odpowiedź trwa zbyt długo",
    body: "Model nie zdążył odpowiedzieć w bezpiecznym czasie dla aktywnej sesji. Możesz spróbować ponownie, jeśli timer nadal pozwala na rozmowę.",
    retryLabel: RETRY_LABEL,
  },
  provider_rate_limited: {
    title: "Model jest chwilowo ograniczony",
    body: "Dostawca AI odrzucił teraz zbyt wiele prób. Spróbuj ponownie za chwilę, bez utraty treści w polu wiadomości.",
    retryLabel: RETRY_LABEL,
  },
  provider_unavailable: {
    title: "Model jest chwilowo niedostępny",
    body: "Nie udało się uzyskać odpowiedzi od dostawcy AI. SafeSpace nie zapisze sztucznej odpowiedzi i pozwoli ponowić próbę, jeśli sesja nadal trwa.",
    retryLabel: RETRY_LABEL,
  },
  invalid_provider_response: {
    title: "Nie możemy pokazać tej odpowiedzi",
    body: "Dostawca AI zwrócił odpowiedź w nieoczekiwanym formacie. SafeSpace zatrzymuje ten krok zamiast zapisywać niepewny wynik.",
    retryLabel: RETRY_LABEL,
  },
} as const satisfies Record<SessionAiErrorCategory, SessionAiFailureCopy>;

export function getSessionAiFailureCopy(category: SessionAiErrorCategory): SessionAiFailureCopy {
  return SESSION_AI_FAILURE_COPY[category];
}
