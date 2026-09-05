import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

const NOT_FOUND_COPY = defineCopy(
  {
    pageTitle: "Page not found - SafeSpace",
    eyebrow: "SafeSpace",
    title: "We couldn't find this page",
    bodyBefore: "The address you're trying to open doesn't exist or has been moved. Check the link or go back",
    bodyDashboard: " to the dashboard",
    bodyHome: " to the home page",
    goDashboard: "Go to the dashboard",
    backHome: "Back to the home page",
    home: "Home page",
    signIn: "Sign in",
  },
  {
    pageTitle: "Nie znaleziono strony - SafeSpace",
    eyebrow: "SafeSpace",
    title: "Nie znaleźliśmy tej strony",
    bodyBefore: "Adres, który próbujesz otworzyć, nie istnieje albo został przeniesiony. Sprawdź link lub wróć",
    bodyDashboard: " do panelu",
    bodyHome: " na stronę główną",
    goDashboard: "Przejdź do panelu",
    backHome: "Wróć na stronę główną",
    home: "Strona główna",
    signIn: "Zaloguj się",
  },
);

export function getNotFoundCopy(locale: Locale) {
  return NOT_FOUND_COPY[locale];
}
