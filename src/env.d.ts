interface SafespaceCloudflareEnv {
  BILLING_RATE_LIMITER?: import("@/lib/rate-limit").RateLimiterBinding;
  SESSION_RATE_LIMITER?: import("@/lib/rate-limit").RateLimiterBinding;
  AUTH_RATE_LIMITER?: import("@/lib/rate-limit").RateLimiterBinding;
}

declare module "cloudflare:workers" {
  export const env: SafespaceCloudflareEnv;
}

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    requestId: string;
    /** Język interfejsu z cookie (middleware); domyślnie angielski. */
    locale: import("@/lib/i18n/locale").Locale;
    accountAccess?: import("@/lib/admin/types").AccountAccessState | null;
  }
}
