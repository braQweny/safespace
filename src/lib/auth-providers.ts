import type { Provider } from "@supabase/supabase-js";

export interface SocialAuthProvider {
  provider: Provider;
  label: string;
  buttonLabel: string;
}

export const GOOGLE_AUTH_PROVIDER = {
  provider: "google",
  label: "Google",
  buttonLabel: "Kontynuuj z Google",
} satisfies SocialAuthProvider;

export const SOCIAL_AUTH_PROVIDERS = [GOOGLE_AUTH_PROVIDER] as const;
