# Obserwator rozmowy głosowej (`VoiceSessionObserver`)

Ten katalog to Durable Object, który nadzoruje jedną rozmowę głosową z GPT-Live-1 (OpenAI). Jest jedynym miejscem, które zna identyfikator sesji live, jedynym, które steruje modelem w trakcie rozmowy, i jedynym źródłem transkryptu — przeglądarka niczego nie dostarcza do zapisu. Ten plik jest kontraktem; `CLAUDE.md` („Voice conversations”) streszcza go, a `context/changes/voice-live-conversation/plan.md` niesie decyzje właściciela.

## Pliki

- `observer-core.ts` — cała logika obserwatora bez runtime Cloudflare: zależności (sideband, `hangup`, klasyfikator, alarm, zegar, timer, UUID) są wstrzykiwane, a stan i bufor idą przez `VoiceObserverStore`. Testowany w Node atrapami (`__tests__/observer-core.test.ts`).
- `observer-state.ts` — czyste funkcje stanu: `VoiceCloseReason`, `armObserverState`, `acceptsEpoch`, `nextAlarmAt` / `decideAlarm`, `applySafetyOutcome`, `scheduleCrisisHangup`, `closeObserverState`.
- `observer-store.ts` — bufor w SQLite Durable Object (`utterances` + klucz `state`) i atrapa w pamięci dla testów. SQLite jest źródłem prawdy: eviction gubi pamięć procesu, nie bufor.
- `observer-durable-object.ts` — cienki wrapper `cloudflare:workers`: schemat w `blockConcurrencyWhile`, wstrzyknięcie transportu z `src/lib/openai/live.ts`, klasyfikatora z `session-safety/openai-safety-provider.ts` (klucz i model z `env` Workera, bo poza żądaniem Astro nie ma `astro:env/server`), alarmu i zegara.
- `coordinator.ts` — jedyne miejsce po stronie tras, które sięga po binding `VOICE_SESSION_OBSERVER` (`getByName(sessionId)`). Trasy i przepływy importują go leniwie (`await import(...)`), bo Vitest nie ma `cloudflare:workers`.
- `steering-copy.ts` — mówione linie sterujące (faza rozmowy, ograniczenia, pauza) w obu językach; rejestr parytetu EN/PL pilnuje kompletu.
- `constants.ts` — puls 20 s, łaska pulsu 90 s, rezerwa terminu 15 s, łaska przekazania 8 s, rotacja sideband 12 min, limit awarii klasyfikatora 3, retencja bufora 7 dni, partia zrzutu 50. Klient i trasy czytają je stąd.

Eksport klasy idzie przez `src/worker.ts` (własne `main` w `wrangler.jsonc`), binding i migracja `v1` (`new_sqlite_classes`) są w `wrangler.jsonc`; `wrangler-voice-config.test.ts` pinuje binding do eksportu, a `npx wrangler deploy --dry-run` musi wypisać klasę.

## Cykl życia (RPC z tras)

| Metoda              | Kto woła                                      | Co robi                                                                                                                                                                                                              |
| ------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `arm(input)`        | `POST /api/session/voice/connect`             | Rozłącza poprzednią sesję live (`reconnected`), podbija epokę, resetuje stan, otwiera sideband i ustawia alarm. Wołane **po** utworzeniu sesji live; wyjątek → trasa robi `hangup` i odpowiada 503.                  |
| `beat()`            | `POST /api/session/voice/heartbeat` (co 20 s) | Odnawia łaskę pulsu, przelicza alarm, oddaje snapshot (`live`, `closeReason`, `epoch`, liczba oczekujących wypowiedzi).                                                                                              |
| `drain(limit)`      | heartbeat, reconcile-on-read, `end`, DELETE   | Zwraca niezrzucone wypowiedzi w kolejności zamknięcia (≤ 50). **Nie** usuwa ich.                                                                                                                                     |
| `ack(ordinals)`     | te same trasy, po udanym RPC                  | Oznacza wypowiedzi jako zapisane. Dwufazowo: awaria zapisu w bazie zostawia je w buforze do następnego zrzutu.                                                                                                       |
| `hangupNow(reason)` | `end`, DELETE, heartbeat (termin, flaga off)  | Zamyka sesję live u dostawcy z **naszym** powodem; idempotentne (zamknięta wcześniej sesja nie rozłącza się ponownie).                                                                                               |
| `purge()`           | DELETE rozmowy                                | Czyści cały bufor razem ze stanem — usunięta rozmowa nie zostawia treści w Cloudflare.                                                                                                                               |
| `getState()`        | reconcile-on-read                             | Snapshot bez skutków ubocznych.                                                                                                                                                                                      |
| `alarm()`           | runtime                                       | Termin rozmowy (−15 s rezerwy) → `time_limit_reached`; brak pulsu > 90 s → `heartbeat_lost`; rotacja sideband; odroczony `hangup` po kryzysie; purge bufora 7 dni po zamknięciu; reattach po wybudzeniu bez gniazda. |

Zapis do bazy **nigdy** nie idzie z obiektu: nie ma tu klucza serwisowego ani klienta Supabase. Wypowiedzi trafiają do `session_messages` wyłącznie z tras pod RLS właściciela przez `append_voice_session_utterances` (`session-flow/voice-reconcile.ts`: `drainVoiceObserver`, `reconcileVoiceSession`, `closeVoiceSession`). Heartbeat i reconcile-on-read stosują też przejście terminalne wynikające z powodu zamknięcia.

## Sideband i rotacja

Obiekt podłącza się do sesji live przez `wss://api.openai.com/v1/live/sessions/{id}/attach` (`openLiveSideband`) i dostaje te same zdarzenia co przeglądarka: transkrypt obu ról (`session.input_transcript.delta` / `session.output_transcript.delta`, fragmenty co ~200 ms tnące słowa), `session.usage.updated`, `session.closed`. Po sideband wysyła wyłącznie copy i prompt (`session.instructions.append`, `session.commentary.append`, `session.input_audio.mute|unmute`, `session.close`), nigdy tekst użytkownika.

Cloudflare utrzymuje obiekt przy życiu około 15 minut na jedno wychodzące połączenie, więc sideband jest **rotowany co 12 minut**: nowe gniazdo jest otwierane przed zamknięciem starego, a fragmenty są deduplikowane po `(epoka, mówca, start_ms)`. Po każdym wybudzeniu bez żywego gniazda i bez powodu zamknięcia obiekt podłącza się ponownie. To założenie z dokumentacji, nie zmierzony fakt: bieg 60 minut na prawdziwym runtime (spike S12/S13) jest otwartą bramką manualną przed przełączeniem flagi; wariant awaryjny A (zapis z przeglądarki) opisuje plan.

## Transkrypt i bramka bezpieczeństwa

Fragmenty są grupowane w wypowiedzi wspólnym modułem `session-flow/voice-transcript.ts` (klient używa go tylko do podglądu): przerwa ≥ 700 ms tego samego mówcy albo zmiana mówcy po końcu zdania zamyka wypowiedź, idle flush 1200 ms, limit `SESSION_MESSAGE_MAX_CHARS`. Identyfikator wypowiedzi jest deterministyczny (`epoka:mówca:start_ms`), więc powtórny zrzut po awarii jest idempotentny w RPC.

Każda wypowiedź trafia do bufora **przed** klasyfikacją. Wypowiedź użytkownika idzie do `evaluateSessionSafety` z dwoma poprzednimi wypowiedziami użytkownika jako kontekstem (`VOICE_SAFETY_CONTEXT_UTTERANCES`); wynik jest przyjmowany tylko przy zgodnej epoce. Bramka jest **reaktywna** — model full-duplex mógł już zacząć odpowiadać (decyzja właściciela z 2026-09-12, wprost opisana w `/privacy#voice`):

- `allow` / `allow_with_constraints` → sterowanie: linia fazy rozmowy (`resolveSessionPhase` z terminu), ograniczenia najwyżej co 3 minuty.
- klasyfikator fail-closed (brak konfiguracji, timeout, zła odpowiedź) → `session.input_audio.mute` + mówiona linia pauzy; trzecia kolejna awaria → `session.close` z `closeReason: safety_unavailable` (**do ponowienia**: wiersz w bazie zostaje `active`, klient proponuje „Połącz ponownie”). Udana klasyfikacja zeruje licznik i odmuca.
- kryzys → mówiona linia przekazania, mute, `hangup` po 8 s, `closeReason: interrupted`; heartbeat przenosi wiersz w `interrupted` i oddaje copy kryzysowe z numerami.

Wypowiedzi modelu **nie są** klasyfikowane (klasyfikator jest zbudowany pod użytkownika; koszt podwoiłby się). Soczewki tematyczne nie działają w rozmowie głosowej (obiekt nie ma kontekstu właściciela).

## Powody zamknięcia

`closeReason` jest **nasz** (`VoiceCloseReason`), nigdy `session.closed.reason` OpenAI; klient gałęziuje wyłącznie na odpowiedzi heartbeatu.

| Powód                | Skąd                                            | Wiersz w bazie             | Klient                                                    |
| -------------------- | ----------------------------------------------- | -------------------------- | --------------------------------------------------------- |
| `completed`          | `POST /api/session/end`                         | `completed` (trasa `end`)  | karta zakończenia                                         |
| `interrupted`        | kryzys w obserwatorze                           | `interrupted` (heartbeat)  | powiadomienie `hard_stop` z numerami, mikrofon zatrzymany |
| `time_limit_reached` | alarm terminu, heartbeat po wygaśnięciu         | `expired`                  | „Czas rozmowy minął”                                      |
| `heartbeat_lost`     | alarm łaski pulsu (karta zamknięta, sieć)       | bez zmiany (`active`)      | `reconnecting`, jedna próba automatyczna, potem ręczna    |
| `safety_unavailable` | trzecia awaria klasyfikatora                    | bez zmiany (`active`)      | powiadomienie `retry`, ręczne „Połącz ponownie”           |
| `reconnected`        | nowy `arm` (kolejna karta lub reconnect)        | bez zmiany                 | stara karta: „rozmowa trwa w innym oknie”                 |
| `deleted`            | DELETE rozmowy                                  | `deleted` (trasa historii) | —                                                         |
| `voice_disabled`     | heartbeat przy fladze `off`                     | `completed`                | powiadomienie o wyłączeniu funkcji, karta zakończenia     |
| `provider_closed`    | `session.closed` od dostawcy bez naszego powodu | bez zmiany (`active`)      | `reconnecting`                                            |

## Bufor i retencja

Treść wypowiedzi istnieje w SQLite obiektu tylko do zrzutu i jako krótki ogon kontekstu klasyfikatora. `markDrained` usuwa zapisane wiersze (poza ogonem), `purge` czyści wszystko przy usunięciu rozmowy, a alarm czyści bufor **7 dni** po zamknięciu (`VOICE_BUFFER_RETENTION_MS`) — to nowe miejsce spoczynku treści rozmowy, ujawnione na stronie prywatności i pilnowane przez jeden alarm. Nie dopisuj tu innych danych rozmowy.

## Czego nie robimy

- Obserwator nie loguje treści, identyfikatora sesji live, SDP ani czasów wypowiedzi; zdarzenia `session.voice_observer` i `session.voice_closed` niosą wynik, kod powodu i czas trwania (sanitizer odrzuca pola zawierające `session`, `token`, `content`).
- Obserwator nie zapisuje do bazy, nie czyta `astro:env/server` i nie zna właściciela rozmowy — tylko `sessionId` w nazwie obiektu.
- Przeglądarka nie tworzy sesji live, nie ma klucza, nie robi fetch do `api.openai.com` (CSP bez `connect-src`) i **nigdy nie wysyła** po kanale danych `oai-events` — słucha tylko fragmentów do podglądu. Sterowanie własną sesją z kanału danych (spike S14) dotyczy wyłącznie własnej rozmowy: termin, klasyfikacja i zapis są po stronie serwera.
- Nie ma roli DB serwera ani podpisywanych poleceń; nie ma dziennego limitu premium ani liczenia puli z `usage` OpenAI (pula liczy czas od `voice_connected_at`).

## Konfiguracja i weryfikacja

- `wrangler.jsonc`: `main: "src/worker.ts"`, binding `VOICE_SESSION_OBSERVER`, migracja `v1` z `new_sqlite_classes`, limiter `VOICE_RATE_LIMITER` (namespace 1004) dla heartbeatu; `VOICE_SESSION_MODE` i `VOICE_MONTHLY_MINUTES` w `vars`. Obiekt czyta `OPENAI_API_KEY` i `OPENROUTER_SAFETY_MODEL` z `env` Workera.
- Podgląd E2E (`tests/e2e/start-preview.mjs`) kopiuje `durable_objects`, `migrations` i `unsafe.bindings` z buildu; flaga jest tam `off`, więc `voice-off.spec.ts` sprawdza tylko powierzchnię anonimową.
- Vitest: `observer-state.test.ts` (alarm, licznik awarii, epoka), `observer-store.test.ts`, `observer-core.test.ts` (zapis przed klasyfikacją, kryzys, trzecia awaria, spóźniona epoka, dwufazowy zrzut, rotacja, brak treści w logach), `voice-connect-route.test.ts`, `voice-heartbeat-route.test.ts`.
- Manualnie, na prawdziwym runtime po `wrangler login`: bieg 60 minut z rotacją i klasyfikatorem z obiektu (S12/S13), telefony (S9), ZDR konta OpenAI w panelu (S6), odsłuch PL na prawdziwych nagraniach (S3). Dopiero potem osobny commit przełącza `VOICE_SESSION_MODE` na `on`.
