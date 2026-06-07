declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    requestId: string;
    accountAccess?: import("@/lib/admin/types").AccountAccessState | null;
  }
}
