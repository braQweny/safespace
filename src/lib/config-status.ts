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
    message:
      "Supabase nie jest skonfigurowany (SUPABASE_URL, SUPABASE_KEY — zobacz .env.example) — funkcje uwierzytelniania są wyłączone.",
  },
  {
    name: "OpenRouter",
    configured: isOpenRouterConfigured(),
    message:
      "OpenRouter nie jest skonfigurowany (OPENROUTER_API_KEY) — sesje AI będą przerywane przez bramkę bezpieczeństwa (fail-closed).",
  },
];

export const missingConfigs = configStatuses.filter((s) => !s.configured);
