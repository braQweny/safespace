import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";
import type { SessionPhase } from "@/lib/session-flow/session-phase";

/**
 * Teksty, które obserwator dopisuje modelowi głosowemu po sideband. To
 * materiał promptu w języku rozmowy (GPT-Live mówi w języku instrukcji), nie
 * copy interfejsu; rejestr `copy-catalogs.ts` pilnuje parytetu EN/PL.
 * Każdy wpis mieści się z dużym zapasem w limicie 500 tokenów jednego dopisku.
 */
const VOICE_STEERING_COPY = defineCopy(
  {
    phase: {
      opening:
        "The conversation is just beginning. Let the user settle in: listen, reflect what you hear, and ask about one thing at a time.",
      middle: "The conversation is in its middle. Stay with what matters most to the user; deepen rather than widen.",
      closing:
        "The conversation is drawing to a close. Gently gather what was said, do not open new threads, and leave the user with one thing to hold on to.",
    },
    constraintsIntro: "For the rest of this conversation, keep to these boundaries:",
    pause: "I need a short moment before we go on. Let's pause here; I'll let you know as soon as I'm back with you.",
    resume: "Thank you for waiting. I'm here again; let's continue where we left off.",
    handoff:
      "I'm going to stop here, because what you just shared matters more than this conversation. Please look at the help contacts on your screen and reach out to one of them now. Take care of yourself.",
  },
  {
    phase: {
      opening:
        "Rozmowa dopiero się zaczyna. Daj użytkownikowi czas: słuchaj, odzwierciedlaj to, co słyszysz, i pytaj o jedną rzecz naraz.",
      middle:
        "Rozmowa jest w połowie. Zostań przy tym, co dla użytkownika najważniejsze; pogłębiaj zamiast rozszerzać.",
      closing:
        "Rozmowa zbliża się do końca. Łagodnie zbierz to, co zostało powiedziane, nie otwieraj nowych wątków i zostaw użytkownikowi jedną rzecz, której może się trzymać.",
    },
    constraintsIntro: "Do końca tej rozmowy trzymaj się tych granic:",
    pause: "Potrzebuję chwili, zanim pójdziemy dalej. Zatrzymajmy się tu; dam znać, gdy tylko znów będę z tobą.",
    resume: "Dziękuję, że poczekałeś. Znów tu jestem; wróćmy do tego, na czym skończyliśmy.",
    handoff:
      "Zatrzymam się tutaj, bo to, co właśnie powiedziałeś, jest ważniejsze niż ta rozmowa. Proszę, spójrz na kontakty pomocowe na ekranie i skontaktuj się z jednym z nich teraz. Zadbaj o siebie.",
  },
);

export function getVoiceSteeringCopy(locale: Locale) {
  return VOICE_STEERING_COPY[locale];
}

export function getVoicePhaseLine(locale: Locale, phase: SessionPhase) {
  return VOICE_STEERING_COPY[locale].phase[phase];
}

/** Ograniczenia z `allow_with_constraints` jako jeden dopisek. */
export function buildVoiceConstraintsLine(locale: Locale, instructions: readonly string[]) {
  return `${VOICE_STEERING_COPY[locale].constraintsIntro} ${instructions.join(" ")}`;
}
