import type { SessionAiErrorCategory } from "./errors";
import type { SessionAiFailureCopy } from "./types";

const RETRY_LABEL = "Spróbuj ponownie";

const SESSION_AI_FAILURE_COPY = {
  missing_configuration: {
    title: "Nie możemy teraz przygotować odpowiedzi",
    body: "Odpowiedzi są chwilowo niedostępne. SafeSpace nie pokaże udawanej odpowiedzi, gdy nie może bezpiecznie przygotować prawdziwej.",
    retryLabel: RETRY_LABEL,
  },
  provider_timeout: {
    title: "Odpowiedź trwa zbyt długo",
    body: "Przygotowanie odpowiedzi zajęło zbyt dużo czasu. Możesz spróbować ponownie, jeśli czas sesji jeszcze trwa.",
    retryLabel: RETRY_LABEL,
  },
  provider_rate_limited: {
    title: "Za dużo prób w krótkim czasie",
    body: "Odpowiedzi są chwilowo ograniczone. Spróbuj ponownie za chwilę — treść w polu wiadomości nie zniknie.",
    retryLabel: RETRY_LABEL,
  },
  provider_unavailable: {
    title: "Odpowiedź jest chwilowo niedostępna",
    body: "Nie udało się uzyskać odpowiedzi. SafeSpace nie zapisze udawanej odpowiedzi — możesz ponowić próbę, jeśli sesja nadal trwa.",
    retryLabel: RETRY_LABEL,
  },
  invalid_provider_response: {
    title: "Nie możemy pokazać tej odpowiedzi",
    body: "Odpowiedź dotarła w nieoczekiwanej formie. SafeSpace zatrzymuje ten krok zamiast zapisywać niepewny wynik.",
    retryLabel: RETRY_LABEL,
  },
} as const satisfies Record<SessionAiErrorCategory, SessionAiFailureCopy>;

export function getSessionAiFailureCopy(category: SessionAiErrorCategory): SessionAiFailureCopy {
  return SESSION_AI_FAILURE_COPY[category];
}
