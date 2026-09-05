import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";
import type { SessionAiErrorCategory } from "./errors";
import type { SessionAiFailureCopy } from "./types";

interface SessionAiCopy {
  retryLabel: string;
  failures: Readonly<Record<SessionAiErrorCategory, Omit<SessionAiFailureCopy, "retryLabel">>>;
  safetyBoundary: {
    title: string;
    causes: Readonly<Record<"provider_rate_limited" | "provider_timeout" | "default", string>>;
    /** Doklejane po przyczynie: wiadomość nie weszła do rozmowy, tekst zostaje w polu. */
    outcome: string;
  };
}

const SESSION_AI_COPY = defineCopy<SessionAiCopy>(
  {
    retryLabel: "Try again",
    failures: {
      missing_configuration: {
        title: "We can't prepare a reply right now",
        body: "Replies are temporarily unavailable. SafeSpace won't show a made-up reply when it can't safely prepare a real one.",
      },
      provider_timeout: {
        title: "The reply is taking too long",
        body: "Preparing the reply took too much time. You can try again if the conversation time is still running.",
      },
      provider_rate_limited: {
        title: "Too many attempts in a short time",
        body: "Replies are temporarily limited. Try again in a moment — the text in the message box will stay.",
      },
      provider_unavailable: {
        title: "The reply is temporarily unavailable",
        body: "We couldn't get a reply. SafeSpace won't save a made-up reply — you can retry if the conversation is still going.",
      },
      invalid_provider_response: {
        title: "We can't show this reply",
        body: "The reply arrived in an unexpected form. SafeSpace stops this step instead of saving an uncertain result.",
      },
    },
    safetyBoundary: {
      title: "We can't safely continue right now",
      causes: {
        provider_rate_limited: "The safety check service is temporarily limiting the number of requests.",
        provider_timeout: "The safety check took too long.",
        default: "The safety check is temporarily unavailable.",
      },
      outcome: "The message was not added to the conversation. The text stays in the box — try again in a moment.",
    },
  },
  {
    retryLabel: "Spróbuj ponownie",
    failures: {
      missing_configuration: {
        title: "Nie możemy teraz przygotować odpowiedzi",
        body: "Odpowiedzi są chwilowo niedostępne. SafeSpace nie pokaże udawanej odpowiedzi, gdy nie może bezpiecznie przygotować prawdziwej.",
      },
      provider_timeout: {
        title: "Odpowiedź trwa zbyt długo",
        body: "Przygotowanie odpowiedzi zajęło zbyt dużo czasu. Możesz spróbować ponownie, jeśli czas rozmowy jeszcze trwa.",
      },
      provider_rate_limited: {
        title: "Za dużo prób w krótkim czasie",
        body: "Odpowiedzi są chwilowo ograniczone. Spróbuj ponownie za chwilę — treść w polu wiadomości nie zniknie.",
      },
      provider_unavailable: {
        title: "Odpowiedź jest chwilowo niedostępna",
        body: "Nie udało się uzyskać odpowiedzi. SafeSpace nie zapisze udawanej odpowiedzi — możesz ponowić próbę, jeśli rozmowa nadal trwa.",
      },
      invalid_provider_response: {
        title: "Nie możemy pokazać tej odpowiedzi",
        body: "Odpowiedź dotarła w nieoczekiwanej formie. SafeSpace zatrzymuje ten krok zamiast zapisywać niepewny wynik.",
      },
    },
    safetyBoundary: {
      title: "Nie możemy teraz bezpiecznie kontynuować",
      causes: {
        provider_rate_limited: "Usługa sprawdzająca bezpieczeństwo chwilowo ogranicza liczbę zapytań.",
        provider_timeout: "Sprawdzenie bezpieczeństwa trwało zbyt długo.",
        default: "Sprawdzenie bezpieczeństwa jest chwilowo niedostępne.",
      },
      outcome: "Wiadomość nie została dodana do rozmowy. Treść zostaje w polu — spróbuj ponownie za chwilę.",
    },
  },
);

export function getSessionAiFailureCopy(category: SessionAiErrorCategory, locale: Locale): SessionAiFailureCopy {
  const copy = SESSION_AI_COPY[locale];

  return { ...copy.failures[category], retryLabel: copy.retryLabel };
}

/**
 * The safety boundary (not the reply model) was unavailable for this turn.
 * Nothing was generated or stored and the session stays open, so the copy has
 * to promise exactly that: the text is still in the composer, try again.
 */
export function getSafetyBoundaryUnavailableCopy(
  locale: Locale,
  category?: SessionAiErrorCategory,
): SessionAiFailureCopy {
  const copy = SESSION_AI_COPY[locale];
  const cause =
    category === "provider_rate_limited" || category === "provider_timeout"
      ? copy.safetyBoundary.causes[category]
      : copy.safetyBoundary.causes.default;

  return {
    title: copy.safetyBoundary.title,
    body: `${cause} ${copy.safetyBoundary.outcome}`,
    retryLabel: copy.retryLabel,
  };
}
