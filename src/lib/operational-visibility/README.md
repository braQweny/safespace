# Operational visibility boundary

F-03 tworzy server-only kontrakt logow operacyjnych dla SafeSpace. Kod aplikacji ma emitowac zdarzenia przez `logOperationalEvent()` i helpery z tego katalogu, a nie przez bezposrednie wywolania `console.log()`.

## Zasady uzycia

- Uzywaj tylko zdarzen z `types.ts` i helperow z `session-events.ts`.
- Przekazuj tylko bezpieczne metadane: `requestId`, `outcome`, `durationMs`, `provider`, `riskState`, `action`, `reasonCode` i opcjonalny `userHash`.
- `userHash` jest opcjonalny. Gdy `OPERATIONAL_LOG_HASH_SECRET` nie jest ustawiony, korelacja uzytkownika jest pomijana.
- Logger jest diagnostyczny i best-effort. Nie moze blokowac logowania, wyboru avatara ani przyszlej sesji.
- S-07 moze budowac tylko agregaty i widoki admina bez prywatnej tresci. Raw logi operacyjne nie sa powierzchnia admin UI.

## Konfiguracja i weryfikacja

`OPERATIONAL_LOG_HASH_SECRET` jest opcjonalnym server-only sekretem. Ustaw go lokalnie w `.env` / `.dev.vars` albo jako sekret GitHub/Cloudflare tylko wtedy, gdy potrzebna jest stabilna korelacja uzytkownika przez `userHash`.

Brak sekretu nie blokuje requestow i nie powoduje fallbacku do raw Supabase `user.id`.

Hostowane logi czytaj przez Cloudflare Workers Logs albo read-only tail:

```bash
npx wrangler tail --name safespace
```

W logach szukaj `event`, `requestId`, `outcome` i `reasonCode`. Nie traktuj raw logow jako admin-facing panelu.

## S-04 session flow

S-04 `first-safe-timed-session` wykonuje granice F-02 przed zwykla generacja AI:

1. Utworz albo odczytaj prywatny kontekst sesji przez F-01.
2. Wywolaj `evaluateSessionSafety()` z F-02 dla aktualnej wypowiedzi uzytkownika.
3. Zaloguj wynik przez `buildSessionSafetyEvaluatedEventFromDecision()`.
4. Kontynuuj zwykla generacje tylko dla akcji `allow`.
5. Dla `allow_with_constraints` zastosuj ograniczenia z F-02 przed generacja.
6. Dla `hard_stop` albo `fail_closed` przerwij zwykla symulacje.

S-04 nie moze tworzyc alternatywnych nazw zdarzen sesyjnych ani recznie skladac payloadow logow dla sesji. S-05 historia, S-06 podsumowania i S-07 admin aggregates pozostaja osobnymi slice'ami bez dostepu do prywatnej tresci w logach.

## Dozwolone zdarzenia sesyjne

- `session.start_attempted`
- `session.safety_evaluated`
- `session.ai_provider_failed`
- `session.time_limit_reached`
- `session.completed`
- `session.opening_failed`

Przyklad:

```ts
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import {
  buildSessionAiProviderFailedEvent,
  buildSessionSafetyEvaluatedEventFromDecision,
} from "@/lib/operational-visibility/session-events";

logOperationalEvent(
  buildSessionSafetyEvaluatedEventFromDecision(decision, {
    requestId,
    durationMs,
    userHash,
    provider: "openrouter",
  }),
);

logOperationalEvent(
  buildSessionAiProviderFailedEvent({
    requestId,
    reasonCode: "provider_timeout",
    durationMs,
  }),
);
```

## Pola zabronione

Nie przekazuj do logow operacyjnych zadnych prywatnych ani raw wartosci:

- `message`, `prompt`, `content`, `summary`
- `email`, `token`, `cookie`, `authorization`, `password`
- raw provider payloads, raw database/provider errors, classifier input/output
- tekst uzytkownika, tekst asystenta, wygenerowana odpowiedz, tresc kopii kryzysowej
- `modalityId`, `avatarId`, raw `user.id`

Sanitizer i helpery sa allowlist-driven, ale S-04 ma traktowac powyzsza liste jako granice projektowa, nie tylko techniczna walidacje.
