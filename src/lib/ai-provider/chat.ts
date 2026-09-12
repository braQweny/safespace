import { sendOpenRouterChat } from "@/lib/openrouter/sdk-chat";
import { sendOpenAiChat } from "@/lib/openai/chat";
import type { AiProviderName } from "./types";

export function sendAiChat(options: Parameters<typeof sendOpenRouterChat>[0] & { provider: AiProviderName }) {
  return options.provider === "openai" ? sendOpenAiChat(options) : sendOpenRouterChat(options);
}
