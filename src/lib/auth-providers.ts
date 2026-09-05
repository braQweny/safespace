import type { Provider } from "@supabase/supabase-js";

export interface SocialAuthProvider {
  provider: Provider;
  label: string;
}

// Napis przycisku żyje w `page-copy/auth-pages-copy.ts` (`googleButton`).
export const GOOGLE_AUTH_PROVIDER = {
  provider: "google",
  label: "Google",
} satisfies SocialAuthProvider;

export const SOCIAL_AUTH_PROVIDERS = [GOOGLE_AUTH_PROVIDER] as const;
