/**
 * Stałe obserwatora rozmowy głosowej (Durable Object `VoiceSessionObserver`).
 * Wartości w milisekundach; klient i trasy czytają je stąd, żeby heartbeat,
 * łaska pulsu i rezerwa terminu nie rozjechały się między warstwami.
 */

/** Co ile klient wysyła heartbeat (i zrzuca bufor transkryptu). */
export const VOICE_HEARTBEAT_INTERVAL_MS = 20_000;

/** Po tylu ms bez pulsu obserwator rozłącza sesję live (klient zniknął). */
export const VOICE_HEARTBEAT_GRACE_MS = 90_000;

/** Sesja live kończy się tyle przed `expires_at`, żeby ostatnie wypowiedzi zdążyły do bazy. */
export const VOICE_DEADLINE_RESERVE_MS = 15_000;

/** Po zdaniu przekazania kryzysowego model ma tyle czasu, zanim REST `hangup`. */
export const VOICE_HANDOFF_GRACE_MS = 8_000;

/**
 * Wychodzący WebSocket chroni Durable Object przed usunięciem z pamięci tylko
 * ~15 min na połączenie (dokumentacja Cloudflare), więc sideband jest rotowany:
 * nowe połączenie otwarte przed zamknięciem starego.
 */
export const VOICE_SIDEBAND_ROTATION_MS = 12 * 60_000;

/** Ile czekamy na potwierdzenie komendy sideband (`session.*.appended`, `…muted`). */
export const VOICE_SIDEBAND_ACK_TIMEOUT_MS = 5_000;

/** Ograniczenia z `allow_with_constraints` dopisywane najwyżej co tyle. */
export const VOICE_CONSTRAINTS_APPEND_INTERVAL_MS = 180_000;

/** Tyle kolejnych awarii klasyfikatora zamyka sesję live jako do ponowienia. */
export const VOICE_SAFETY_FAILURES_BEFORE_CLOSE = 3;

/** Bufor niezrzuconych wypowiedzi jest czyszczony tyle po zamknięciu rozmowy. */
export const VOICE_BUFFER_RETENTION_MS = 7 * 24 * 60 * 60_000;

/** Ile wypowiedzi jeden zrzut przenosi do bazy (= limit RPC). */
export const VOICE_DRAIN_BATCH = 50;

/** Ile ostatnich wypowiedzi użytkownika dostaje klasyfikator jako kontekst. */
export const VOICE_SAFETY_CONTEXT_UTTERANCES = 2;
