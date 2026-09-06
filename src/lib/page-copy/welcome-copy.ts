import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

interface WelcomeStep {
  title: string;
  body: string;
}

interface WelcomeCopy {
  pageTitle: string;
  ctaDashboard: string;
  ctaSignup: string;
  ctaSignin: string;
  previewAria: (firstName: string) => string;
  eyebrow: string;
  heroTitle: string;
  heroBody: string;
  heroNoteSignedIn: string;
  heroNoteSignedOut: (sessionLimit: number, budgetMinutes: number) => string;
  previewTimer: (remainingMinutes: number) => string;
  previewAvatarLine1: string;
  previewUser: string;
  previewAvatarLine2: string;
  previewPlaceholder: string;
  perspectivesEyebrow: string;
  perspectivesTitle: string;
  perspectivesBody: string;
  howEyebrow: string;
  howTitle: string;
  steps: (budgetMinutes: number) => readonly WelcomeStep[];
  boundariesEyebrow: string;
  boundariesTitle: string;
  boundariesBody: string;
  boundaries: readonly string[];
  crisisLead: string;
  finalTitleSignedIn: string;
  finalTitleSignedOut: string;
  finalBodySignedIn: string;
  finalBodySignedOut: string;
}

const WELCOME_COPY = defineCopy<WelcomeCopy>(
  {
    pageTitle: "SafeSpace - a safe first conversation",
    ctaDashboard: "Go to the dashboard",
    ctaSignup: "Create an account",
    ctaSignin: "I already have an account",
    previewAria: (firstName) =>
      `Preview of a conversation with the avatar ${firstName}: the session time is visible, replies read as calm prose, and there is a box for your message.`,
    eyebrow: "Educational conversation simulation · not therapy",
    heroTitle: "A calm place for a first conversation.",
    heroBody:
      "Sort out your thoughts in a conversation with AI and get to know different psychotherapy approaches. At your own pace, before talking to a professional.",
    heroNoteSignedIn: "Your conversations and chosen perspective are waiting on the dashboard.",
    heroNoteSignedOut: (sessionLimit, budgetMinutes) =>
      `${sessionLimit} free conversations, each up to ${budgetMinutes} minutes. Available after signing in.`,
    previewTimer: (remainingMinutes) => `~${remainingMinutes} min · opening`,
    previewAvatarLine1: "We don't have to rush. Where would you like to start today?",
    previewUser: "Maybe with the fact that I don't know whether therapy is for me at all.",
    previewAvatarLine2: "“For me at all” — I wonder what's behind that. Let's stay with it for a moment.",
    previewPlaceholder: "Write…",
    perspectivesEyebrow: "Five perspectives",
    perspectivesTitle: "Five ways of listening, one calm tone",
    perspectivesBody:
      "Each avatar represents a different psychotherapy approach. You choose a perspective before a conversation and can change it before the next one.",
    howEyebrow: "How it works",
    howTitle: "Three steps to your first conversation",
    steps: (budgetMinutes) => [
      {
        title: "You create an account",
        body: "You sign in with Google or e-mail so you have access to your conversations.",
      },
      {
        title: "You choose a perspective",
        body: "Five avatars, each in a different psychotherapy approach, with a short description of the approach.",
      },
      {
        title: "You start a conversation",
        body: `Up to ${budgetMinutes} minutes, with the time visible and a clear note that this is an educational simulation.`,
      },
    ],
    boundariesEyebrow: "Safety boundaries",
    boundariesTitle: "Before you start, know what SafeSpace doesn't do",
    boundariesBody:
      "SafeSpace is meant to help you prepare for a real conversation and to show possible ways of working, educationally. It is not meant to replace contact with a qualified person.",
    boundaries: [
      "SafeSpace does not replace a psychotherapist, a doctor or a consultation with a professional.",
      "The product does not diagnose and does not choose treatment or a therapy approach for you.",
      "The conversation is a simulation and educational support, not medical advice.",
      "In immediate danger you need contact with real help, not with an app.",
    ],
    crisisLead:
      "If you are in immediate danger, call your local emergency number or contact a crisis line, a helpline or a professional. Don't wait for the app to reply.",
    finalTitleSignedIn: "Return to your conversations",
    finalTitleSignedOut: "Time for a first step?",
    finalBodySignedIn: "Choose a perspective, start a conversation or return to a transcript.",
    finalBodySignedOut: "Create an account, choose a perspective and start whenever you like.",
  },
  {
    pageTitle: "SafeSpace - pierwsza bezpieczna rozmowa",
    ctaDashboard: "Przejdź do panelu",
    ctaSignup: "Utwórz konto",
    ctaSignin: "Mam już konto",
    previewAria: (firstName) =>
      `Podgląd rozmowy z awatarem ${firstName}: widoczny czas sesji, odpowiedzi jako spokojna proza i pole na Twoją wiadomość.`,
    eyebrow: "Edukacyjna symulacja rozmowy · nie terapia",
    heroTitle: "Spokojne miejsce na pierwszą rozmowę.",
    heroBody:
      "Uporządkuj myśli w rozmowie z AI i poznaj różne podejścia psychoterapeutyczne. We własnym tempie, przed rozmową ze specjalistą.",
    heroNoteSignedIn: "Twoje rozmowy i wybrana perspektywa czekają w panelu.",
    heroNoteSignedOut: (sessionLimit, budgetMinutes) =>
      `${sessionLimit} bezpłatne rozmowy, każda do ${budgetMinutes} minut. Dostępne po zalogowaniu.`,
    previewTimer: (remainingMinutes) => `ok. ${remainingMinutes} min · początek`,
    previewAvatarLine1: "Nie musimy się spieszyć. Od czego chcesz dziś zacząć?",
    previewUser: "Chyba od tego, że nie wiem, czy terapia jest w ogóle dla mnie.",
    previewAvatarLine2: "„W ogóle dla mnie” — zastanawiam się, co się za tym kryje. Zostańmy przy tym chwilę.",
    previewPlaceholder: "Napisz…",
    perspectivesEyebrow: "Pięć perspektyw",
    perspectivesTitle: "Pięć sposobów słuchania, jeden spokojny ton",
    perspectivesBody:
      "Każdy awatar reprezentuje inny nurt psychoterapii. Wybierasz perspektywę przed rozmową i możesz ją zmienić przed kolejną.",
    howEyebrow: "Jak to działa",
    howTitle: "Trzy kroki do pierwszej rozmowy",
    steps: (budgetMinutes) => [
      {
        title: "Zakładasz konto",
        body: "Logujesz się przez Google lub e-mail, żeby mieć dostęp do swoich rozmów.",
      },
      {
        title: "Wybierasz perspektywę",
        body: "Pięć awatarów, każdy w innym nurcie psychoterapii, z krótkim opisem podejścia.",
      },
      {
        title: "Zaczynasz rozmowę",
        body: `Do ${budgetMinutes} minut, z widocznym czasem i jasną informacją, że to symulacja edukacyjna.`,
      },
    ],
    boundariesEyebrow: "Granice bezpieczeństwa",
    boundariesTitle: "Zanim zaczniesz, wiedz, czego SafeSpace nie robi",
    boundariesBody:
      "SafeSpace ma pomagać w przygotowaniu do realnej rozmowy i edukacyjnie pokazywać możliwe sposoby pracy. Nie ma zastępować kontaktu z wykwalifikowaną osobą.",
    boundaries: [
      "SafeSpace nie zastępuje psychoterapeuty, lekarza ani konsultacji ze specjalistą.",
      "Produkt nie stawia diagnozy i nie dobiera leczenia ani nurtu terapii za Ciebie.",
      "Treść rozmowy ma charakter symulacji i wsparcia edukacyjnego, a nie porady medycznej.",
      "W sytuacji bezpośredniego zagrożenia potrzebny jest kontakt z realną pomocą, nie z aplikacją.",
    ],
    crisisLead:
      "Jeśli jesteś w bezpośrednim niebezpieczeństwie, zadzwoń pod lokalny numer alarmowy albo skontaktuj się z linią kryzysową, telefonem zaufania lub specjalistą. Nie czekaj na odpowiedź aplikacji.",
    finalTitleSignedIn: "Wróć do swoich rozmów",
    finalTitleSignedOut: "Czas na pierwszy krok?",
    finalBodySignedIn: "Wybierz perspektywę, rozpocznij rozmowę lub wróć do jej zapisu.",
    finalBodySignedOut: "Utwórz konto, wybierz perspektywę i zacznij, kiedy zechcesz.",
  },
);

export function getWelcomeCopy(locale: Locale): WelcomeCopy {
  return WELCOME_COPY[locale];
}
