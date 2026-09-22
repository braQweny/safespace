import { parseSessionIdParam } from "./session-id";

export interface SessionAboutOptions {
  aboutPersonId?: string | null;
  aboutDifficultyId?: string | null;
}

/** Karta osoby (`about`) i temat (`topic`) jadą dalej samym id, nigdy imieniem ani etykietą. */
export function buildSessionHref(sessionId: string, options: SessionAboutOptions = {}) {
  let href = `/dashboard/session?sessionId=${encodeURIComponent(sessionId)}`;
  if (options.aboutPersonId) href += `&about=${encodeURIComponent(options.aboutPersonId)}`;
  if (options.aboutDifficultyId) href += `&topic=${encodeURIComponent(options.aboutDifficultyId)}`;
  return href;
}

/**
 * Decyzja o starcie po „Zapisz i zacznij rozmowę” z ekranu wyboru perspektywy,
 * po „Porozmawiaj o tej osobie” z karty osoby i po „Porozmawiaj o tym” z karty
 * tematu: wszystkie wracają na panel z `?start=now`, bo kliknięcie padło już
 * gdzie indziej. Karta osoby dokłada `about=<id>`, temat `topic=<id>`.
 *
 * `nextSearch` to adres bez tych parametrów i musi zostać zapisany ZANIM poleci
 * żądanie startu — inaczej odświeżenie panelu zużyłoby kolejną rozmowę z puli.
 * Przy wyczerpanej puli żądanie zostaje rozpoznane (`isRequested`), ale start
 * nie następuje: panel ma wtedy pokazać stan limitu, a nie startować mimo woli.
 */
export function resolveAutoStartRequest(search: string, canStart: boolean) {
  const params = new URLSearchParams(search);

  if (params.get("start") !== "now") {
    return {
      isRequested: false,
      shouldStart: false,
      nextSearch: search,
      aboutPersonId: null,
      aboutDifficultyId: null,
    };
  }

  params.delete("start");
  const aboutPersonId = parseSessionIdParam(params.get("about") ?? undefined);
  params.delete("about");
  const aboutDifficultyId = parseSessionIdParam(params.get("topic") ?? undefined);
  params.delete("topic");

  const remaining = params.toString();

  return {
    isRequested: true,
    shouldStart: canStart,
    nextSearch: remaining.length > 0 ? `?${remaining}` : "",
    aboutPersonId,
    aboutDifficultyId,
  };
}
