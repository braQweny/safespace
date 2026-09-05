import { defineCopy } from "@/lib/i18n/copy";
import { localeTag, type Locale } from "@/lib/i18n/locale";

const BILLING_COPY = defineCopy(
  {
    pageTitle: "Subscription - SafeSpace",
    title: "Your subscription",
    back: "Back to the account",
    backBlocked: "Back to account information",
    link: "Manage subscription",
    offerTitle: "SafeSpace Premium subscription",
    price: "PLN 49 / month",
    tax: "Including tax. Renews monthly until canceled.",
    benefits: "Unlimited conversations, up to 60 minutes each.",
    freeAllowance: "The free plan includes three conversations in total.",
    cancellation: "Cancel at any time. Your access continues until the end of the paid period.",
    sandbox: "Test payments only. This purchase does not charge real money.",
    purchase: "Continue to test payment",
    resumePurchase: "Continue the pending payment",
    discover: "See the premium subscription",
    manage: "Open the billing portal",
    portalDescription: "Update your payment method, view billing documents or cancel renewal.",
    active: "Paid premium access is active",
    conversations: "Return to conversations",
    inactive: "No paid premium access",
    validUntil: (date: string) => `Your paid access ends on ${date}.`,
    canceled: "Renewal is canceled. Access remains until the end of the paid period.",
    paymentFailed: "The payment was not completed. Update your payment method in the billing portal.",
    noGrace: "Without a successful renewal, paid access ends when the paid period expires.",
    waiting: "Waiting for payment confirmation",
    waitingBody: "We are checking the payment confirmation. Premium will become available once payment is confirmed.",
    waitingLong: "Confirmation is taking longer. You can check again in a moment; your payment will not be repeated.",
    refresh: "Check again",
    returnCanceled: "Checkout was closed. You can continue the pending payment when you are ready.",
    disabled: "Subscription purchases are currently unavailable.",
    portalUnavailable: "The billing portal is temporarily unavailable. Try again later.",
    unavailable: "We could not read your subscription. Refresh the page in a moment.",
    manual: "Premium granted by the SafeSpace team is independent of a subscription and stays unchanged.",
    blocked:
      "You can manage or cancel an existing subscription while your account is blocked. New purchases are unavailable.",
    deletionPending:
      "Account deletion is in progress. New purchases are stopped. Return to account deletion to complete it.",
    deleteLink: "Continue account deletion",
    deletionConsequence:
      "If you have a subscription, we will cancel it immediately before deleting your account. There are no automatic refunds.",
    deletionRetry:
      "We could not confirm cancellation of your subscription. Your account has not been deleted. Try deleting it again to complete cancellation.",
    errors: {
      retry: "We could not complete this step. Wait a moment and try again.",
      rateLimited: "Too many attempts. Wait about a minute and try again.",
      blocked: "New purchases are unavailable for a blocked account. You can still manage an existing subscription.",
      deletionPending:
        "Account deletion has started. Continue deleting your account to complete cancellation of the subscription.",
    },
  },
  {
    pageTitle: "Abonament - SafeSpace",
    title: "Twój abonament",
    back: "Wróć do konta",
    backBlocked: "Wróć do informacji o koncie",
    link: "Zarządzaj abonamentem",
    offerTitle: "Abonament SafeSpace Premium",
    price: "49 zł / miesiąc",
    tax: "Cena brutto. Abonament odnawia się co miesiąc do anulowania.",
    benefits: "Bez limitu liczby rozmów, każda do 60 minut.",
    freeAllowance: "Plan bezpłatny obejmuje łącznie trzy rozmowy.",
    cancellation: "Możesz anulować w dowolnym momencie. Dostęp zachowasz do końca opłaconego okresu.",
    sandbox: "Wyłącznie płatności testowe. Ten zakup nie pobiera prawdziwych pieniędzy.",
    purchase: "Przejdź do płatności testowej",
    resumePurchase: "Dokończ oczekującą płatność",
    discover: "Zobacz abonament premium",
    manage: "Otwórz portal rozliczeń",
    portalDescription: "Zmień metodę płatności, zobacz dokumenty rozliczeniowe lub anuluj odnowienie.",
    active: "Opłacony dostęp premium jest aktywny",
    conversations: "Wróć do rozmów",
    inactive: "Brak opłaconego dostępu premium",
    validUntil: (date) => `Opłacony dostęp kończy się ${date}.`,
    canceled: "Odnowienie zostało anulowane. Dostęp pozostaje do końca opłaconego okresu.",
    paymentFailed: "Płatność nie została zrealizowana. Zaktualizuj metodę płatności w portalu rozliczeń.",
    noGrace: "Bez udanego odnowienia płatny dostęp kończy się wraz z opłaconym okresem.",
    waiting: "Czekamy na potwierdzenie płatności",
    waitingBody: "Sprawdzamy potwierdzenie płatności. Premium będzie dostępne po potwierdzeniu zapłaty.",
    waitingLong: "Potwierdzenie trwa dłużej. Możesz sprawdzić ponownie za chwilę; nie powtórzymy płatności.",
    refresh: "Sprawdź ponownie",
    returnCanceled: "Płatność została zamknięta. Możesz ją dokończyć, kiedy zechcesz.",
    disabled: "Zakup abonamentu jest obecnie niedostępny.",
    portalUnavailable: "Portal rozliczeń jest chwilowo niedostępny. Spróbuj ponownie później.",
    unavailable: "Nie udało się odczytać abonamentu. Odśwież stronę za chwilę.",
    manual: "Premium nadane przez zespół SafeSpace działa niezależnie od abonamentu i pozostaje bez zmian.",
    blocked:
      "Na zablokowanym koncie możesz zarządzać istniejącym abonamentem lub go anulować. Nowy zakup jest niedostępny.",
    deletionPending: "Trwa usuwanie konta. Nowe zakupy są wstrzymane. Wróć do usuwania konta, aby je dokończyć.",
    deleteLink: "Dokończ usuwanie konta",
    deletionConsequence:
      "Jeśli masz abonament, anulujemy go natychmiast przed usunięciem konta. Nie wykonujemy automatycznych zwrotów.",
    deletionRetry:
      "Nie udało się potwierdzić anulowania abonamentu. Konto nie zostało usunięte. Ponów usuwanie, aby dokończyć anulowanie.",
    errors: {
      retry: "Nie udało się wykonać tego kroku. Odczekaj chwilę i spróbuj ponownie.",
      rateLimited: "Za dużo prób. Odczekaj około minuty i spróbuj ponownie.",
      blocked: "Nowy zakup jest niedostępny dla zablokowanego konta. Nadal możesz zarządzać istniejącym abonamentem.",
      deletionPending: "Rozpoczęto usuwanie konta. Ponów usuwanie konta, aby dokończyć anulowanie abonamentu.",
    },
  },
);

export function getBillingCopy(locale: Locale) {
  return BILLING_COPY[locale];
}

export function formatBillingDate(locale: Locale, value: string) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function getBillingErrorCopy(locale: Locale, code: string | null) {
  if (!code) return null;
  const copy = getBillingCopy(locale);
  if (code === "rate_limited") return copy.errors.rateLimited;
  if (code === "account_blocked") return copy.errors.blocked;
  if (code === "deletion_pending") return copy.errors.deletionPending;
  return copy.errors.retry;
}
