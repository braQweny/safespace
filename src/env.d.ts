interface SafespaceRuntimeEnv {
  SESSION_RATE_LIMITER?: import("@/lib/rate-limit").RateLimiterBinding;
}

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    requestId: string;
    accountAccess?: import("@/lib/admin/types").AccountAccessState | null;
    /** Injected by the @astrojs/cloudflare adapter; absent in tests and Node tooling. */
    runtime?: {
      env?: SafespaceRuntimeEnv;
    };
  }
}
