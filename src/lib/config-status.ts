import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import { getAiProviderEnv } from "@/lib/ai-provider/env";

const ai = getAiProviderEnv();
const aiName = ai.provider === "openai" ? "OpenAI" : "OpenRouter";
const aiKeyName = ai.provider === "openai" ? "OPENAI_API_KEY" : "OPENROUTER_API_KEY";

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
    name: aiName,
    configured: Boolean(ai.apiKey?.trim()),
    message: `${aiName} nie jest skonfigurowany (${aiKeyName}) — sesje AI będą przerywane przez bramkę bezpieczeństwa (fail-closed).`,
  },
];

export const missingConfigs = configStatuses.filter((s) => !s.configured);
