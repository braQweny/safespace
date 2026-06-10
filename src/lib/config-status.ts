import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import { isOpenRouterConfigured } from "@/lib/openrouter/env";

export interface ConfigStatus {
  name: string;
  configured: boolean;
  message: string;
  docsUrl?: string;
  docsLabel?: string;
}

export const configStatuses: ConfigStatus[] = [
  {
    name: "Supabase",
    configured: Boolean(SUPABASE_URL && SUPABASE_KEY),
    message: "Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone.",
    docsUrl: "https://github.com/przeprogramowani/10x-astro-starter#supabase-configuration",
    docsLabel: "Zobacz instrukcję konfiguracji",
  },
  {
    name: "OpenRouter",
    configured: isOpenRouterConfigured(),
    message:
      "OpenRouter nie jest skonfigurowany (OPENROUTER_API_KEY) — sesje AI będą przerywane przez bramkę bezpieczeństwa (fail-closed).",
  },
];

export const missingConfigs = configStatuses.filter((s) => !s.configured);
