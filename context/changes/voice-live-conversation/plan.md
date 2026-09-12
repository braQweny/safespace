# Voice Conversation With GPT-Live-1 Implementation Plan

## Overview

Dodajemy opcjonalną rozmowę głosową z awatarem opartą o OpenAI **GPT-Live-1** (model full-duplex: słucha i mówi jednocześnie, wtrąca potwierdzenia, daje się przerwać). Rozmowa głosowa jest osobnym trybem sesji (`mode='voice'`), używa tej samej pamięci awatara, kart osób, mapy tematów i historii, bo jej transkrypt trafia do `session_messages`. Dostęp: konto free — jednorazowa próba do 10 minut; premium — miesięczna pula minut (`VOICE_MONTHLY_MINUTES`, domyślnie 120). Bramka bezpieczeństwa jest **reaktywna** (klasyfikacja po wypowiedzi), co właściciel zaakceptował 2026-09-12.

## Current State Analysis

- `POST /api/session/message` (`src/pages/api/session/message.ts`) klasyfikuje wypowiedź przed generowaniem (`evaluateSessionSafety`, fail-closed), generuje odpowiedź przez Chat Completions (`sendAiChat`) i zapisuje parę wiadomości RPC `complete_session_message_turn` pod leasingiem.
- Dyktowanie (`src/components/session/SessionComposer.tsx` → `/api/session/transcribe`) tylko przepisuje nagranie; mikrofon jest już dozwolony (`Permissions-Policy: microphone=(self)` w `src/middleware.ts`).
- Limit 3 rozmów free liczy każdy wiersz `therapy_sessions` (trigger w `20260822120000_add_account_plans_and_free_session_limit.sql`); bucket czasu w `(0, 300, 900, 1800, 3600)`; `claim_free_trial_session` przyjmuje 5 argumentów.
- Repo nie ma Durable Objects ani własnego entry Workera (`wrangler.jsonc` `main: "@astrojs/cloudflare/entrypoints/server"`); `@astrojs/cloudflare` 14.2.6 eksportuje `@astrojs/cloudflare/handler`.
- CSP: `default-src 'self'` bez `connect-src` (`astro.config.mjs`), więc przeglądarka nie może wołać `api.openai.com`; WebRTC media i data channel są poza CSP.
- `astro:env/server` działa tylko w żądaniu Astro; kod DO musi czytać `this.env`.

## Desired End State

Na `/dashboard` drugi przycisk startu („Wypróbuj rozmowę głosową (10 min)" dla free z niewykorzystaną próbą, „Rozpocznij rozmowę głosową" dla premium z minutami w puli). Na `/dashboard/session` sesja `mode='voice'` renderuje wyspę `VoiceSession`: „Włącz mikrofon" → `getUserMedia` → `RTCPeerConnection` → oferta SDP do `POST /api/session/voice/connect` → serwer tworzy sesję live (`POST /v1/live/sessions`) i uzbraja Durable Object `VoiceSessionObserver`. DO obserwuje sesję przez sideband (rotowany co 12 min), klasyfikuje każdą wypowiedź użytkownika, steruje modelem (faza, ograniczenia, pauza przy awarii, przekazanie kryzysowe), rozłącza na termin/utratę pulsu i buforuje transkrypt; heartbeat właściciela co 20 s zrzuca bufor do bazy RPC `append_voice_session_utterances` pod RLS. Historia pokazuje odznakę „Głos"; `/privacy#voice` opisuje przepływ audio, bufor i reaktywną bramkę; `CLAUDE.md` niesie kontrakt.

### Key Discoveries:

- Serwer tworzy sesję live z ofertą SDP i dostaje id od razu; klucz nigdy w przeglądarce (OpenAI voice-server-controls).
- `POST /v1/live/sessions/{id}/hangup` i sideband `wss://api.openai.com/v1/live/sessions/{id}/attach` pozwalają sterować bez trwałego połączenia z trasy (Microsoft Learn gpt-live; OpenAI live-delegation).
- Wychodzący WebSocket chroni DO przed usunięciem tylko ~15 min na połączenie (Cloudflare durable-objects/best-practices/websockets) → rotacja sideband, bramka S12.
- `resolveSessionPhase` liczy budżet z `expiresAt − startedAt` (`src/lib/session-flow/session-phase.ts`), więc przycięcie `expires_at` do puli zachowuje łuk rozmowy.
- `start-next.ts` nie wymaga zajętej próby tekstowej, więc start głosowy może iść wyłącznie tą trasą bez zmiany `claim_free_trial_session`.
- `evaluateSessionSafety(input, { provider })` ma wstrzykiwany provider (`src/lib/session-safety/evaluate-session-safety.ts`), a `logOperationalEvent` nie zależy od `astro:env` — oba nadają się do DO.
- Denylist pól logów odrzuca każde pole zawierające `session`, `token`, `content` (`src/lib/operational-visibility/allowed-fields.ts`).

## What We're NOT Doing

- Zapisu przez rolę DB serwera (jak billing) ani podpisywanych poleceń z sekretem w bazie.
- Mieszania tekstu i głosu w jednej sesji; wpisywania tekstu w sesji głosowej; dziennego limitu premium; doby strefowej.
- Klasyfikowania wypowiedzi modelu; soczewek tematycznych w głosie (v1); głosowego `?start=now`; panelu admina dla trybu.
- Precyzyjnego liczenia puli z `usage` OpenAI (pula liczy czas od `voice_connected_at` do końca/`expires_at`).
- Automatycznego rozłączenia przy usunięciu konta (alarm utraty pulsu kończy sesję ≤ 90 s + latencja alarmu).
- Zmian CSP i `@cloudflare/workers-types`.

## Implementation Approach

Etap 0 (spike poza aplikacją) jest bramką: PL (S3/S4) zatrzymuje projekt, S12 rozstrzyga wariant architektury (obserwator w DO albo wariant A z zapisem z przeglądarki). Etapy 1–2 wdrażają schemat, warstwę danych, flagę, entry Workera i DO „na ciemno". Etap 3 dodaje transport Live i instrukcje głosowe (czyste moduły). Etap 4 dodaje trasy i haki za flagą. Etap 5 dodaje klienta, dashboard, konto i historię. Etap 6 domyka prywatność, dokumentację, E2E i przełącza flagę osobnym commitem.

## Critical Implementation Details

### Tryby są rozłączne

`message.ts` odrzuca `mode='voice'` (409 `session_mode_mismatch`) przed leasingiem; RPC głosowy odrzuca `mode='text'` (`P0015`). Sesja głosowa nie ma composera.

### Id sesji live tylko w DO

Bez kolumny, bez logów, bez DTO. Wszystkie komendy sideband i `hangup` wykonuje DO; trasy widzą tylko `live`, `closeReason`, `epoch`.

### Fencing epoką

`arm` podbija epokę; klasyfikacja, sterowanie i alarmy noszą epokę i są ignorowane, gdy nie zgadza się z bieżącą.

### Osobne pule

Trigger limitu free liczy tylko `mode='text'`; próba głosowa free to jeden wiersz `mode='voice'` na konto w każdym statusie (`P0016`), bucket 600. Pula premium liczona w TS od `voice_connected_at`; egzekucja przy starcie (`expires_at`) i w DO (termin).

### Bufor DO

Wypowiedzi czekają w SQLite obiektu do zrzutu przez heartbeat/reconcile-on-read, najdłużej 7 dni po zamknięciu; usunięcie rozmowy czyści bufor. Ujawnione na stronie prywatności.

## Phase 0: Spike

### Overview

Skrypty poza aplikacją (`scripts/spike/`), wyniki w `spike.md`. Bramki: S3/S4 (PL) → stop; S12 (DO 60 min) → wariant architektury.

### Changes Required:

#### 1. Skrypty spike'u

**Files**: `scripts/spike/live-voice-spike.mjs`, `scripts/spike/live-voice-browser.mjs`, `scripts/spike/live-voice-browser.html`, `scripts/spike/observer-worker/`, `.gitignore`

Podkomendy `probe-config`, `probe-create`, `tts`, `converse`, `hangup`; strona WebRTC z lokalnym serwerem trzymającym klucz; minimalny Worker z DO rotującym sideband i logującym luki.

#### 2. Wyniki

**File**: `context/changes/voice-live-conversation/spike.md`

Tabela S1–S15 z kryteriami go, liczby latencji, ocena próbek PL, decyzje dla etapu 1.

### Success Criteria:

#### Automated Verification:

- `node scripts/spike/live-voice-spike.mjs probe-config` wypisuje akceptację/odrzucenie każdego wariantu konfiguracji.
- `node scripts/spike/live-voice-spike.mjs converse --sideband --close-via hangup` kończy się `session.closed` i zapisuje `summary.json`.

#### Manual Verification:

- Dwóch native'ów ocenia PL na prawdziwych nagraniach; wynik w `spike.md`.
- 60-minutowy bieg obserwatora na prawdziwym runtime Cloudflare bez luki > 2 s przy rotacji.
- Test iOS Safari i Android Chrome ze strony spike'u.

## Phase 1: Schema, Data Layer, Flag, Quota

### Overview

Migracja addytywna i warstwa danych wdrażalne bez włączania funkcji.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/2026MMDDHHmmss_add_voice_sessions.sql`

`therapy_sessions.mode` (`text|voice`, insert-only), `voice_connected_at` (tylko `null → wartość`), bucket 600 w constraincie, trigger limitu free liczy `mode='text'` + bramka próby głosowej (`P0016 voice_trial_already_used`, bucket 600 dla free), `session_messages.utterance_id` z partial unique index, RPC `append_voice_session_utterances(p_session_id, p_utterances jsonb)` (security invoker, lock wiersza, `P0015` dla tekstu, idempotencja po `utterance_id`, okno 60 s po zamknięciu — z odpowiadającym poluzowaniem `guard_session_content_insert` dla `mode='voice'`), revoke/grant execute.

#### 2. Warstwa danych

**Files**: `src/lib/session-data/{types,rows,sessions,errors,repository,voice-utterances,voice-quota}.ts`, `src/lib/session-flow/session-budget.ts`, `src/lib/session-data/README.md`

`SessionMode`, `mode?`/`voiceConnectedAt?`, `SessionDurationBucketSeconds += 600`, `VoiceQuota` (`trial` | `pool`), `countOwnedSessions` tylko tekst, `countOwnedVoiceSessions`, `listOwnedVoiceSessionTimings`, `markVoiceSessionConnected`, `appendVoiceSessionUtterances`, `readVoiceQuota`, `resolveVoiceSessionDurationSeconds`.

#### 3. Flaga

**Files**: `src/lib/session-flow/voice-session-mode.ts`, `astro.config.mjs`, `wrangler.jsonc`, `.env.example`

`VOICE_SESSION_MODE=off|on`, `VOICE_MONTHLY_MINUTES` (domyślnie 120).

### Success Criteria:

#### Automated Verification:

- `npm run test` — `schema-drift.test.ts` pinuje `mode`, bucket 600, `P0015`/`P0016`, indeks, trigger; `voice-quota.test.ts`, `voice-utterances.test.ts`, `voice-session-mode.test.ts` zielone.
- `npm run test:db` — `tests/database/voice-sessions.test.mjs` (próba free, limit tekstowy nie zużyty, RPC idempotentny, okno 60 s, purge, tombstone zachowuje `mode`).
- `npm run typecheck`, `npm run lint`.

#### Manual Verification:

- Migracja zastosowana na lokalnym Supabase bez błędów; istniejące sesje mają `mode='text'`.

## Phase 2: Worker Entry, Durable Object, Wrangler, Types, Preview

### Overview

Własny `src/worker.ts` z DO `VoiceSessionObserver`; osobny PR z `wrangler deploy --dry-run`.

### Changes Required:

#### 1. Wrangler i entry

**Files**: `wrangler.jsonc`, `src/worker.ts`, `src/env.d.ts`, `tests/e2e/start-preview.mjs`, `context/deployment/deploy-plan.md`

`main: "src/worker.ts"`, binding `VOICE_SESSION_OBSERVER`, migracja `v1` `new_sqlite_classes`, `VOICE_RATE_LIMITER` (namespace 1004, 60/min), minimalne typy DO w deklaracji `cloudflare:workers`, podgląd kopiuje `durable_objects` i `migrations`.

#### 2. Durable Object

**Files**: `src/lib/voice/{constants,observer-state,observer-durable-object,coordinator}.ts`, `src/lib/session-safety/openai-safety-provider.ts`

Stan czysty (`nextAlarmAt`, `decideAlarm`, `applySafetyOutcome`, `acceptsEpoch`), klasa cienka (`arm`, `beat`, `drain`/`ack`, `hangupNow`, `getState`, `alarm`, pętla sideband z grupowaniem, klasyfikacją, sterowaniem, rotacją i reattach), `createOpenAiSafetyProvider` z jawnym kluczem, `getVoiceObserver(sessionId)`.

### Success Criteria:

#### Automated Verification:

- `observer-state.test.ts`, `observer-durable-object.test.ts` (mock `cloudflare:workers`), `wrangler-voice-config.test.ts` zielone.
- `npm run build` i `npx wrangler deploy --dry-run` przechodzą; `npm run test:e2e` (podgląd wstaje z własnym `main`).

#### Manual Verification:

- `npm run dev` startuje z bindingiem DO (miniflare) bez błędów.

## Phase 3: Live Transport And Voice Instructions

### Overview

Czyste moduły transportu i promptów, testowane atrapami sieci.

### Changes Required:

#### 1. Transport

**File**: `src/lib/openai/live.ts`

`createLiveSession`, `hangupLiveSession`, `openLiveSideband` z regułami z `chat.ts` (klucz `sk-or-` odrzucony, `redirect: "manual"`, ciała błędów anulowane, mapowanie statusów).

#### 2. Instrukcje

**Files**: `src/lib/session-ai/{session-response-prompt,voice-instructions}.ts`, `src/lib/modalities.ts`, `src/lib/session-safety/safety-copy.ts`

Eksport `buildSessionResponseSystemContent`, `recap` w `FENCE_MARKER_PATTERN`, `buildVoiceLiveInstructions`, `buildVoiceBackendInstructions`, `buildLiveSessionConfig`, `VOICE_PHASE_LINES`, `liveVoice` i `voiceLiveHint` per awatar, `getVoiceCrisisHandoffLine`, `getVoicePauseLine`.

### Success Criteria:

#### Automated Verification:

- `live.test.ts`, `voice-instructions.test.ts`, `openai-safety-provider.test.ts`, rozszerzone `deployed-model-budgets.test.ts` i `provider-routing.test.ts` zielone; `copy-parity.test.ts` zielony.

## Phase 4: Routes, Contracts, Limiter, Logs

### Overview

Trasy głosowe i haki za flagą.

### Changes Required:

#### 1. Start i reconcile

**Files**: `src/lib/session-flow/{session-start-request,voice-start,voice-reconcile,session-state,session-history}.ts`, `src/pages/api/session/{start,start-next}.ts`

`mode` w body, `resolveVoiceStart`, pominięcie limitu tekstowego dla głosu, `expiresAt` przycięte, bez wiadomości otwierającej, `SessionView.mode?`, reconcile-on-read aktywnej sesji głosowej.

#### 2. Trasy głosowe

**Files**: `src/pages/api/session/voice/{connect,heartbeat}.ts`, `src/lib/session-flow/voice-contract.ts`, `src/lib/request-guards.ts`, `src/lib/rate-limit.ts`, `src/middleware.ts`

`connect` (SDP ≤ 64 KiB, tworzenie sesji live, `markVoiceSessionConnected`, `arm`), `heartbeat` (`beat`, `drain`/`ack`, przejście `interrupted`, notice), limiter głosowy.

#### 3. Haki

**Files**: `src/pages/api/session/{message,end}.ts`, `src/pages/api/session/history/[sessionId].ts`, `src/lib/operational-visibility/{types,session-events}.ts`, `src/pages/dashboard.astro`, `src/pages/account/security.astro`

409 dla wiadomości tekstowej w sesji głosowej, hangup + drain przy końcu, hangup + purge przy usunięciu, nowe zdarzenia i kody, odczyt `voiceQuota`.

### Success Criteria:

#### Automated Verification:

- Testy tras (`voice-connect-route`, `voice-heartbeat-route`, `session-message-route`, `session-end-route`, `session-history-route`, `session-start-next-route`, `session-start-route`), `voice-reconcile.test.ts`, `request-guards.test.ts`, `rate-limit.test.ts`, `session-events.test.ts`, `sanitize-event.test.ts` zielone.

## Phase 5: Client, Dashboard, Account, History

### Overview

Wyspa `VoiceSession` na wyodrębnionym chrome `TimedSession`, drugi start na dashboardzie, minuty na koncie, odznaka w historii.

### Changes Required:

#### 1. Moduły czyste

**Files**: `src/lib/session-flow/{voice-contract,voice-live-events,voice-transcript,voice-session-state,microphone-error-copy}.ts`

Parser zdarzeń i grupowanie wspólne z DO; reducer statusów; przeniesienie `getMicrophoneErrorCopy`.

#### 2. Chrome i wyspa

**Files**: `src/components/session/{SessionScreenHeader,SessionEndConfirmDialog,SessionClosingCard,SessionBoundariesToggle,SessionMessages,VoiceSession,TimedSession}.tsx`, `src/components/hooks/{voice-peer,useVoiceSession,useTimedSession}.ts`, `src/components/session/voice-session-copy.ts`, `src/pages/dashboard/session.astro`

Wyodrębnienie bajt w bajt, `liveFragments`, „Włącz mikrofon", pasek statusu i wyciszenia, reconnect, hard stop, `session.astro` gałęziuje na `mode`.

#### 3. Dashboard, konto, historia

**Files**: `src/components/session/SessionStartCard.tsx`, `src/components/hooks/useSessionStart.ts`, `src/lib/session-flow/plan-copy.ts`, `src/components/session/session-start-card-copy.ts`, `src/pages/account/security.astro`, `src/components/modality/SessionHistoryList.tsx`, `src/components/modality/session-history-copy.ts`, `src/lib/i18n/__tests__/copy-catalogs.ts`

Pięć stanów przycisku głosowego, `mode` w body startu, copy PL/EN, akapit minut na koncie, odznaka „Głos".

### Success Criteria:

#### Automated Verification:

- Testy modułów czystych, hooków, `VoiceSession.test.tsx`, `TimedSession.test.tsx` bez zmian, `SessionStartCard.test.tsx`, `useSessionStart.test.ts`, test listy historii, `security-plan.test.ts`, `plan-copy.test.ts`, `copy-parity.test.ts`, `session-layout.test.ts` zielone.

#### Manual Verification:

- Chrome desktop, Android Chrome, iOS Safari: mikrofon, „Lena mówi"/„Słucham", wyciszenie, przerwanie, pauza 3 s, reconnect po Wi-Fi, zamknięcie karty i powrót, wygaśnięcie 10 min free, druga próba zablokowana, przycięcie premium, hard stop, awaria klasyfikatora, flaga off w trakcie, odznaka i pamięć awatara, `wrangler tail` bez treści.

## Phase 6: Privacy, Docs, E2E, Flag

### Overview

Sekcja `#voice`, kontrakty w `CLAUDE.md` i README, E2E dla powierzchni anonimowych, przełączenie flagi.

### Changes Required:

#### 1. Prywatność i docs

**Files**: `src/lib/page-copy/privacy-copy.ts`, `src/pages/privacy.astro`, `src/components/privacy/PrivacyContent{En,Pl}.astro`, `CLAUDE.md`, `src/lib/voice/README.md`, `src/lib/session-data/README.md`, `src/lib/ai-provider/README.md`, `src/lib/operational-visibility/README.md`, `context/deployment/deploy-plan.md`, `.env.example`, `tests/e2e/README.md`, `AGENTS.md`

#### 2. E2E i flaga

**Files**: `tests/e2e/voice-off.spec.ts`, `wrangler.jsonc`

### Success Criteria:

#### Automated Verification:

- `privacy-sections.test.ts`, `privacy-copy.test.ts`, `npm run test:e2e` zielone; pełne CI.

#### Manual Verification:

- Przełączenie flagi osobnym commitem po pozytywnym spike'u PL i weryfikacji manualnej etapu 5.

## References

- Plan zatwierdzony przez właściciela 2026-09-12 (sesja Claude Code): pełne kontrakty tras, DO, klienta i wariant awaryjny A.
- `context/changes/voice-live-conversation/plan-brief.md`, `spike.md`
- OpenAI: `developers.openai.com/api/docs/models/gpt-live-1`, `guides/live`, `guides/live-delegation`, `guides/voice-server-controls`, `guides/your-data`, `api/reference/typescript/resources/live`
- Microsoft Learn: `azure/foundry/openai/how-to/gpt-live`
- Cloudflare: `durable-objects/best-practices/websockets`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 0: Spike

#### Automated

- [x] 0.1 Skrypt Node spike'u (probe-config, probe-create, tts, converse, hangup)
- [x] 0.2 Strona WebRTC spike'u z lokalnym serwerem
- [x] 0.3 Worker obserwatora dla S12/S13
- [x] 0.4 Uruchomienia S1, S2, S5, S7, S8, S10, S11 i wpis do spike.md

#### Manual

- [ ] 0.5 Ocena PL na prawdziwych nagraniach (S3, S4)
- [ ] 0.6 Bieg obserwatora 60 min na runtime Cloudflare (S12) i klasyfikator z DO (S13)
- [ ] 0.7 Przeglądarki mobilne (S9), komendy klienta (S14), build z własnym main (S15), UE/ZDR (S6)

### Phase 1: Schema, Data Layer, Flag, Quota

#### Automated

- [ ] 1.1 Migracja add_voice_sessions
- [ ] 1.2 Warstwa danych i pula głosowa
- [ ] 1.3 Flaga i zmienne
- [ ] 1.4 Testy schema-drift, vitest i tests/database

#### Manual

- [ ] 1.5 Migracja na lokalnym Supabase

### Phase 2: Worker Entry, Durable Object, Wrangler, Types, Preview

#### Automated

- [ ] 2.1 wrangler.jsonc, src/worker.ts, env.d.ts, podgląd E2E
- [ ] 2.2 observer-state i VoiceSessionObserver
- [ ] 2.3 openai-safety-provider i coordinator
- [ ] 2.4 Testy DO i konfiguracji, build, dry-run

#### Manual

- [ ] 2.5 npm run dev z bindingiem DO

### Phase 3: Live Transport And Voice Instructions

#### Automated

- [ ] 3.1 src/lib/openai/live.ts
- [ ] 3.2 voice-instructions, eksport system content, modalities
- [ ] 3.3 Copy bezpieczeństwa dla głosu
- [ ] 3.4 Testy transportu, instrukcji, budżetów

### Phase 4: Routes, Contracts, Limiter, Logs

#### Automated

- [ ] 4.1 Start głosowy i reconcile-on-read
- [ ] 4.2 Trasy connect i heartbeat, kontrakt, limiter, cap ciała
- [ ] 4.3 Haki w message, end, history, zdarzenia operacyjne
- [ ] 4.4 Odczyt voiceQuota na dashboard i koncie
- [ ] 4.5 Testy tras i modułów

### Phase 5: Client, Dashboard, Account, History

#### Automated

- [ ] 5.1 Moduły czyste klienta
- [ ] 5.2 Wyodrębnienie chrome z TimedSession
- [ ] 5.3 Wyspa VoiceSession i hooki
- [ ] 5.4 Dashboard, konto, historia, copy
- [ ] 5.5 Testy klienta

#### Manual

- [ ] 5.6 Weryfikacja w przeglądarkach

### Phase 6: Privacy, Docs, E2E, Flag

#### Automated

- [ ] 6.1 Sekcja #voice i testy prywatności
- [ ] 6.2 CLAUDE.md, README, deploy-plan, .env.example
- [ ] 6.3 E2E voice-off

#### Manual

- [ ] 6.4 Przełączenie flagi w wrangler.jsonc
