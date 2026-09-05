import type { APIRoute } from "astro";
import { getFormString, readFormData } from "@/lib/auth-validation";
import { writeAccountLocale } from "@/lib/i18n/account-locale";
import { isLocale } from "@/lib/i18n/locale";
import { writeLocaleCookie } from "@/lib/i18n/locale-cookie";
import { getSafeReturnPath } from "@/lib/i18n/return-path";
import { createClient } from "@/lib/supabase";

export const prerender = false;

/**
 * Wybór języka interfejsu. Cookie dostaje każdy, także wylogowany i także
 * wtedy, gdy Supabase nie jest skonfigurowane; zalogowany dodatkowo zapisuje
 * wybór na koncie. Świadomie bez sprawdzenia blokady konta (zablokowane konto
 * ma czytać swoją stronę w swoim języku), bez logowania (język nie jest polem
 * dozwolonym w zdarzeniach) i bez rate limitu (brak poświadczeń, AI i
 * wywołań Supabase Auth; `checkOrigin` ogranicza formularz do własnej
 * przeglądarki).
 */
export const POST: APIRoute = async (context) => {
  const form = await readFormData(context.request);
  const returnTo = getSafeReturnPath(getFormString(form, "returnTo"));
  const locale = getFormString(form, "locale");

  if (!isLocale(locale)) {
    return context.redirect(returnTo, 303);
  }

  writeLocaleCookie(context.cookies, locale);

  const { user } = context.locals;

  if (user) {
    const supabase = createClient(context.request.headers, context.cookies);

    if (supabase) {
      // Fail-open: cookie już jest, następne logowanie ponowi synchronizację.
      await writeAccountLocale(supabase, user.id, locale);
    }
  }

  return context.redirect(returnTo, 303);
};
