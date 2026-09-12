import { DurableObject, type DurableObjectState } from "cloudflare:workers";
import { hangupLiveSession, openLiveSideband } from "@/lib/openai/live";
import { createOpenAiSafetyProvider } from "@/lib/session-safety/openai-safety-provider";
import {
  VoiceObserverCore,
  type ArmVoiceObserverInput,
  type VoiceObserverDrainResult,
  type VoiceObserverSnapshot,
} from "./observer-core";
import type { VoiceCloseReason } from "./observer-state";
import { createSqlVoiceObserverStore, initializeVoiceObserverSchema } from "./observer-store";

/**
 * Bindingi, które obiekt czyta z `env` Workera. Poza żądaniem Astro nie ma
 * `astro:env/server`, więc klucz i model klasyfikatora pochodzą stąd.
 */
export interface VoiceObserverEnv {
  OPENAI_API_KEY?: string;
  OPENROUTER_SAFETY_MODEL?: string;
}

/**
 * Durable Object obserwatora rozmowy głosowej — cienki wrapper nad
 * `VoiceObserverCore`: schemat SQLite, wstrzyknięcie transportu OpenAI,
 * klasyfikatora, alarmu i zegara. Jeden obiekt na sesję (`getByName(sessionId)`).
 */
export class VoiceSessionObserver extends DurableObject<VoiceObserverEnv> {
  private readonly core: VoiceObserverCore;

  constructor(ctx: DurableObjectState, env: VoiceObserverEnv) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(() => {
      initializeVoiceObserverSchema(ctx.storage.sql);
      return Promise.resolve();
    });
    const apiKey = env.OPENAI_API_KEY ?? "";
    this.core = new VoiceObserverCore(createSqlVoiceObserverStore(ctx.storage.sql), {
      openSideband: (liveSessionId) => openLiveSideband({ apiKey, liveSessionId }),
      hangup: (liveSessionId) => hangupLiveSession({ apiKey, liveSessionId }),
      safetyProvider: createOpenAiSafetyProvider({ apiKey, model: env.OPENROUTER_SAFETY_MODEL ?? "" }),
      scheduleAlarm: (atMs) => (atMs === null ? ctx.storage.deleteAlarm() : ctx.storage.setAlarm(atMs)),
      now: () => Date.now(),
      randomUUID: () => crypto.randomUUID(),
      setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
      clearTimer: (handle) => {
        clearTimeout(handle as ReturnType<typeof setTimeout>);
      },
    });
  }

  arm(input: ArmVoiceObserverInput) {
    return this.core.arm(input);
  }

  beat(): Promise<VoiceObserverSnapshot> {
    return this.core.beat();
  }

  drain(limit?: number): Promise<VoiceObserverDrainResult> {
    return this.core.drain(limit);
  }

  ack(ordinals: readonly number[]) {
    return this.core.ack(ordinals);
  }

  hangupNow(reason: VoiceCloseReason): Promise<VoiceObserverSnapshot> {
    return this.core.hangupNow(reason);
  }

  purge() {
    return this.core.purge();
  }

  getState(): Promise<VoiceObserverSnapshot> {
    return this.core.getState();
  }

  alarm() {
    return this.core.alarm();
  }
}
