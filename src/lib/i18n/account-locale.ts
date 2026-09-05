import type { AstroCookies } from "astro";
import type { createClient } from "@/lib/supabase";
import { isLocale, type Locale } from "./locale";
import { readLocaleCookie, writeLocaleCookie } from "./locale-cookie";

/**
 * Typ tylko z `@/lib/supabase` (import typu nie ładuje `astro:env`), więc
 * moduł da się testować atrapą `from()` bez środowiska Astro.
 */
export type AccountLocaleClient = NonNullable<ReturnType<typeof createClient>>;

interface AccountLocaleRow {
  locale?: unknown;
}

export async function readAccountLocale(repository: AccountLocaleClient, userId: string): Promise<Locale | null> {
  const { data, error } = await repository
    .from("user_preferences")
    .select("locale")
    .eq("user_id", userId)
    .maybeSingle();
  const row: AccountLocaleRow | null = data;

  if (error || !row || !isLocale(row.locale)) {
    return null;
  }

  return row.locale;
}

export async function writeAccountLocale(
  repository: AccountLocaleClient,
  userId: string,
  locale: Locale,
): Promise<boolean> {
  const { error } = await repository
    .from("user_preferences")
    .upsert({ user_id: userId, locale }, { onConflict: "user_id" });

  return !error;
}

/**
 * Po zalogowaniu wiersz konta wygrywa i odświeża cookie; bez wiersza jawny
 * wybór z cookie przechodzi na konto. Domyślny język nigdy nie jest
 * utrwalany, więc późniejszy jawny wybór na dowolnym urządzeniu wygra.
 * Nigdy nie rzuca i nie blokuje logowania — język to nie poświadczenie.
 */
export async function syncLocaleAfterSignIn(
  context: { cookies: Pick<AstroCookies, "get" | "set"> },
  repository: AccountLocaleClient,
  user: { id: string },
): Promise<void> {
  try {
    const cookieLocale = readLocaleCookie(context.cookies);
    const accountLocale = await readAccountLocale(repository, user.id);

    if (accountLocale) {
      if (accountLocale !== cookieLocale) {
        writeLocaleCookie(context.cookies, accountLocale);
      }

      return;
    }

    if (cookieLocale) {
      await writeAccountLocale(repository, user.id, cookieLocale);
    }
  } catch {
    // Fail-open: obowiązuje cookie z żądania albo język domyślny.
  }
}
