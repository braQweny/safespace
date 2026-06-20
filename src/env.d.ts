interface SafespaceCloudflareEnv {
  SESSION_RATE_LIMITER?: import("@/lib/rate-limit").RateLimiterBinding;
}

declare module "cloudflare:workers" {
  export const env: SafespaceCloudflareEnv;
}

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    requestId: string;
    accountAccess?: import("@/lib/admin/types").AccountAccessState | null;
  }
}
