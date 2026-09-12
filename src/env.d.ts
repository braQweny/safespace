interface SafespaceCloudflareEnv {
  BILLING_RATE_LIMITER?: import("@/lib/rate-limit").RateLimiterBinding;
  SESSION_RATE_LIMITER?: import("@/lib/rate-limit").RateLimiterBinding;
  AUTH_RATE_LIMITER?: import("@/lib/rate-limit").RateLimiterBinding;
  VOICE_RATE_LIMITER?: import("@/lib/rate-limit").RateLimiterBinding;
  /** Obserwator rozmowy głosowej (Durable Object nazwany id sesji). */
  VOICE_SESSION_OBSERVER?: import("cloudflare:workers").DurableObjectNamespace<
    import("@/lib/voice/observer-durable-object").VoiceSessionObserver
  >;
}

/**
 * Ręczna, minimalna deklaracja modułu runtime Workers. Repo celowo nie dodaje
 * `@cloudflare/workers-types` (redeklaruje `Request`/`Response` i koliduje z
 * lib DOM Astro); poniżej jest tylko to, czego używa aplikacja.
 */
declare module "cloudflare:workers" {
  export const env: SafespaceCloudflareEnv;

  export interface DurableObjectSqlStorage {
    exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] };
  }

  export interface DurableObjectStorage {
    sql: DurableObjectSqlStorage;
    get<T = unknown>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<boolean>;
    deleteAll(): Promise<void>;
    setAlarm(scheduledTime: number | Date): Promise<void>;
    getAlarm(): Promise<number | null>;
    deleteAlarm(): Promise<void>;
  }

  export interface DurableObjectState {
    storage: DurableObjectStorage;
    blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
    waitUntil(promise: Promise<unknown>): void;
  }

  export class DurableObject<Env = unknown> {
    constructor(ctx: DurableObjectState, env: Env);
    protected readonly ctx: DurableObjectState;
    protected readonly env: Env;
  }

  /** Powierzchnia RPC stuba: metody klasy, wołane przez sieć. */
  export type DurableObjectStub<T> = {
    [K in keyof T as T[K] extends (...args: never[]) => unknown ? K : never]: T[K];
  };

  export interface DurableObjectNamespace<T> {
    getByName(name: string): DurableObjectStub<T>;
  }
}

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    requestId: string;
    /** Język interfejsu z cookie (middleware); domyślnie angielski. */
    locale: import("@/lib/i18n/locale").Locale;
    accountAccess?: import("@/lib/admin/types").AccountAccessState | null;
  }
}
