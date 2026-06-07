import type { SessionAiErrorCategory } from "./errors";
import type { SessionAiFailureCopy } from "./types";

const RETRY_LABEL = "Sprobuj ponownie";

const SESSION_AI_FAILURE_COPY = {
  missing_configuration: {
    title: "Nie mozemy teraz przygotowac odpowiedzi",
    body: "Konfiguracja AI dla sesji nie jest dostepna. SafeSpace nie bedzie udawac odpowiedzi, gdy zwykly model nie moze zostac bezpiecznie wywolany.",
    retryLabel: RETRY_LABEL,
  },
  provider_timeout: {
    title: "Odpowiedz trwa zbyt dlugo",
    body: "Model nie zdazyl odpowiedziec w bezpiecznym czasie dla aktywnej sesji. Mozesz sprobowac ponownie, jesli timer nadal pozwala na rozmowe.",
    retryLabel: RETRY_LABEL,
  },
  provider_rate_limited: {
    title: "Model jest chwilowo ograniczony",
    body: "Dostawca AI odrzucil teraz zbyt wiele prob. Sprobuj ponownie za chwile, bez utraty tresci w polu wiadomosci.",
    retryLabel: RETRY_LABEL,
  },
  provider_unavailable: {
    title: "Model jest chwilowo niedostepny",
    body: "Nie udalo sie uzyskac odpowiedzi od dostawcy AI. SafeSpace nie zapisze sztucznej odpowiedzi i pozwoli ponowic probe, jesli sesja nadal trwa.",
    retryLabel: RETRY_LABEL,
  },
  invalid_provider_response: {
    title: "Nie mozemy pokazac tej odpowiedzi",
    body: "Dostawca AI zwrocil odpowiedz w nieoczekiwanym formacie. SafeSpace zatrzymuje ten krok zamiast zapisywac niepewny wynik.",
    retryLabel: RETRY_LABEL,
  },
} as const satisfies Record<SessionAiErrorCategory, SessionAiFailureCopy>;

export function getSessionAiFailureCopy(category: SessionAiErrorCategory): SessionAiFailureCopy {
  return SESSION_AI_FAILURE_COPY[category];
}
