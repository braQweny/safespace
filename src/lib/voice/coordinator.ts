import { env } from "cloudflare:workers";
import type { VoiceSessionObserver } from "./observer-durable-object";

/**
 * Jedyne miejsce po stronie tras, które sięga po binding Durable Object.
 * Obiekt jest nazwany id sesji (jedna rozmowa = jeden obserwator), więc żadna
 * trasa nie musi przechowywać identyfikatorów. Brak bindingu (lokalny podgląd
 * bez konfiguracji, testy) daje `null`, a trasy głosowe odpowiadają wtedy
 * `voice_observer_unavailable` — nigdy nieśledzoną, płatną sesją live.
 */
export function getVoiceObserver(sessionId: string) {
  return env.VOICE_SESSION_OBSERVER?.getByName(sessionId) ?? null;
}

export type VoiceObserverStub = NonNullable<ReturnType<typeof getVoiceObserver>>;
export type { VoiceSessionObserver };
