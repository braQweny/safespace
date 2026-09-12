# Voice Conversation With GPT-Live-1 - Plan Brief

> Full plan: `context/changes/voice-live-conversation/plan.md` · Spike: `context/changes/voice-live-conversation/spike.md`

## What & Why

Użytkownik może prowadzić z awatarem rozmowę głosową „jak z człowiekiem": mówi, słyszy odpowiedź, może ją przerwać, a model wtrąca potwierdzenia i milczy, gdy użytkownik się zastanawia. Model **GPT-Live-1** (API od 2026-09-10) jest warstwą głosową full-duplex; rozumowanie deleguje do Luny. Rozmowa głosowa zachowuje pamięć awatara, karty osób, mapę tematów, podsumowania i historię, bo transkrypt trafia do `session_messages` jak każda rozmowa pisana.

## Starting Point

Rozmowy są tekstowe: `POST /api/session/message` klasyfikuje wypowiedź (fail-closed, przed generowaniem), generuje odpowiedź przez Chat Completions i zapisuje parę wiadomości jednym RPC. Dyktowanie tylko przepisuje nagranie. Repo nie ma Durable Objects ani własnego entry Workera; CSP to `default-src 'self'` bez `connect-src`; limit 3 rozmów free liczy każdy wiersz `therapy_sessions`.

## Desired End State

Na `/dashboard` drugi przycisk startu (próba 10 min dla free, pula minut dla premium). Na `/dashboard/session` sesja `mode='voice'` renderuje wyspę `VoiceSession`: „Włącz mikrofon" → WebRTC do OpenAI (SDP przez nasz Worker, klucz nigdy w przeglądarce). Durable Object `VoiceSessionObserver` obserwuje sesję przez sideband, klasyfikuje każdą wypowiedź użytkownika, steruje modelem (faza, ograniczenia, pauza, przekazanie kryzysowe), rozłącza na termin i buforuje transkrypt, który heartbeat właściciela zrzuca do bazy pod RLS. Historia pokazuje odznakę „Głos"; strona prywatności opisuje przepływ audio i bufor.

## Key Decisions Made

| Decision                     | Choice                                                                | Why (1 sentence)                                                                          | Source                            |
| ---------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------- |
| Bramka bezpieczeństwa        | Reaktywna na transkrypcie, po wypowiedzi                              | Model full-duplex mówi natychmiast; klasyfikacja przed generowaniem jest niemożliwa.      | Właściciel 2026-09-12             |
| Dostęp                       | Free: jedna próba 10 min; premium: pula `VOICE_MONTHLY_MINUTES` (120) | Hak konwersji za ~0,5–1 USD na konto, koszt premium ograniczony pulą.                     | Właściciel 2026-09-12             |
| Język                        | EN i PL po pozytywnym spike'u                                         | Polski nie jest oficjalnie wspierany; jakość mierzona na próbkach.                        | Właściciel 2026-09-12             |
| Źródło transkryptu i nadzoru | Serwer (DO z sideband, rotacja co 12 min)                             | Zamyka klasę „sfałszowany transkrypt / pominięta klasyfikacja"; wymaga potwierdzenia S12. | Plan zewnętrzny + Cloudflare docs |
| Zapis do bazy                | Heartbeat właściciela zrzuca bufor DO przez RPC pod RLS               | Bez roli DB serwera i bez podpisywanych poleceń.                                          | Plan                              |
| Tworzenie sesji live         | Serwer (`POST /v1/live/sessions` z SDP)                               | Klucz nigdy w przeglądarce, serwer zna id od razu.                                        | OpenAI docs                       |
| Id sesji live                | Tylko w DO                                                            | Bez kolumny, logów i DTO.                                                                 | Plan                              |
| Tryby                        | Rozłączne (`P0015`, 409 `session_mode_mismatch`)                      | Wpisana wiadomość nie może trafić do transkryptu, którego model nie słyszał.              | Plan                              |
| Start głosowy                | Zawsze `start-next.ts`, bramka próby w triggerze (`P0016`)            | Nie dotyka `claim_free_trial_session`; limit tekstowy liczy tylko `mode='text'`.          | Plan                              |
| Czas sesji                   | Free 600 s; premium `min(3600, pula)` w `expires_at`                  | Timer mówi prawdę; faza rozmowy liczy budżet z `expiresAt − startedAt`.                   | Plan                              |
| Zużycie puli                 | Od `voice_connected_at`                                               | Odmowa mikrofonu kosztuje 0 minut.                                                        | Plan zewnętrzny                   |
| Delegacja zaplecza           | `responses` z Luną, `low`; `client` tylko po S11                      | Pre-warmed połączenie, mniej pracy w DO.                                                  | OpenAI docs                       |
| Przycisk na stronie rozmowy  | „Włącz mikrofon", nie „Rozpocznij"                                    | Strona rozmowy nigdy nie startuje rozmowy (test to pinuje).                               | CLAUDE.md                         |
| Typy Cloudflare              | Ręczna deklaracja w `src/env.d.ts`                                    | `@cloudflare/workers-types` koliduje z lib DOM.                                           | Plan                              |
| CSP                          | Bez zmian                                                             | Przeglądarka nie robi fetch do OpenAI; WebRTC poza CSP.                                   | Plan                              |

## Scope

**In scope:**

- Spike poza aplikacją (S1–S15) z bramkami PL i DO.
- Migracja: `mode`, `voice_connected_at`, bucket 600, `utterance_id`, trigger limitu, RPC `append_voice_session_utterances`.
- Worker entry z DO `VoiceSessionObserver`, `VOICE_RATE_LIMITER`, typy, podgląd E2E.
- Transport `src/lib/openai/live.ts`, instrukcje głosowe, głos i wskazówka per awatar.
- Trasy `voice/connect`, `voice/heartbeat`, haki w `start-next`, `message`, `end`, usuwaniu; reconcile-on-read.
- Wyspa `VoiceSession`, wyodrębnienie chrome z `TimedSession`, dashboard, konto, historia.
- Prywatność `#voice`, `CLAUDE.md`, README, E2E dla powierzchni anonimowych, flaga.

**Out of scope:**

- Rola DB serwera lub podpisywane polecenia; mieszanie tekstu i głosu; dzienny limit premium; klasyfikacja wypowiedzi modelu; soczewki w głosie; głosowy `?start=now`; panel admina; precyzyjne liczenie z `usage`.

## Open Risks & Assumptions

- PL nieoficjalny (S3/S4 zatrzymują projekt).
- Obserwator w DO przez 60 min opiera się na „15 min na połączenie" z dokumentacji Cloudflare — S12 mierzy; wariant A gotowy.
- Własny `main` z `@astrojs/cloudflare/handler` (moduł wirtualny) — S15.
- Klient z data channel może dopisywać instrukcje własnej sesji — S14.
- Treść w pamięci DO do 7 dni — ujawnione w prywatności.
