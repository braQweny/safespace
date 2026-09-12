/**
 * Własne entry Workera: handler Astro plus klasa Durable Object obserwatora
 * rozmowy głosowej. Wrangler bierze to z `main` w `wrangler.jsonc`; adapter
 * bundluje plik razem z aplikacją, więc `@/lib/*` i `astro:*` działają tu jak
 * w trasach. Nie dopisuj tu logiki żądań — `handle` pozostaje jedyną ścieżką.
 */
import { handle } from "@astrojs/cloudflare/handler";

export { VoiceSessionObserver } from "@/lib/voice/observer-durable-object";

export default { fetch: handle };
