import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

const SESSION_STARTER_PROMPTS_COPY = defineCopy(
  {
    intro: "You can start with one of these sentences — you'll write the rest your own way.",
    prompts: [
      "I don't know where to start.",
      "I'm dealing with a difficult situation at work.",
      "I want to sort out what I'm feeling.",
      "A conversation that hurt me keeps coming back to me.",
    ] as readonly string[],
  },
  {
    intro: "Możesz zacząć od jednego z tych zdań — resztę dopiszesz po swojemu.",
    prompts: [
      "Nie wiem, od czego zacząć.",
      "Mam trudną sytuację w pracy.",
      "Chcę uporządkować to, co czuję.",
      "Wraca do mnie rozmowa, która mnie zabolała.",
    ],
  },
);

export function getSessionStarterPromptsCopy(locale: Locale) {
  return SESSION_STARTER_PROMPTS_COPY[locale];
}
