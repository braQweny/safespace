# Weryfikacja: rozmowa głosowa z GPT-Live-1

Data: 2026-09-12. Gałąź `voice-live-conversation`, etapy 1–6 zacommitowane, nic nie wypchnięte. `VOICE_SESSION_MODE` zostaje `off` w `wrangler.jsonc` (wdrożenie „na ciemno”); przełączenie to osobny commit po bramkach manualnych z tego pliku.

## Komendy automatyczne (stan po etapie 6)

| Check                                                    | Wynik | Uwagi                                                                                                                           |
| -------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test`                                           | pass  | Vitest: 182 pliki, 1708 testów (etap 5: 1702; nowe: `privacy-copy.test.ts`, rozszerzony `privacy-sections.test.ts`).            |
| `npm run lint`                                           | pass  | Znane ostrzeżenia parsera Astro o `projectService`.                                                                             |
| `npm run typecheck`                                      | pass  |                                                                                                                                 |
| `npm run check:astro`                                    | pass  | 6 hints, 0 błędów.                                                                                                              |
| `SUPABASE_URL=https://example.supabase.co npm run build` | pass  | Własne `main: src/worker.ts`; publiczne zmienne `astro:env` wkompilowane z `wrangler.jsonc` (`parseVoiceSessionMode("off")`).   |
| `npm run test:e2e`                                       | pass  | 5/5, w tym `voice-off.spec.ts` (podgląd kopiuje odtąd `unsafe.bindings` limiterów z buildu).                                    |
| `npx wrangler deploy --dry-run`                          | pass  | Klasa `VoiceSessionObserver`, migracja `v1` (`new_sqlite_classes`), cztery limitery.                                            |
| Prettier, `git diff --check`                             | pass  |                                                                                                                                 |
| `npm run test:db`                                        | —     | Nie uruchamiane w etapie 6 (Docker); `tests/database/voice-sessions.test.mjs` powstał w etapie 1, CI uruchamia go w jobie `ci`. |

## Celowe złamanie E2E (`tests/e2e/voice-off.spec.ts`)

| Build                                                                                        | Oczekiwanie                                         | Wynik                                                |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| `VOICE_SESSION_MODE: "on"` w `wrangler.jsonc`, źródła bez zmian                              | gałąź „włączone”: link i sekcja widoczne, trasy 401 | pass — próba generalna commitu 6.4                   |
| flaga `off`, wymuszone `voice: true` w `privacy.astro` i `voiceSession = true` w partialu EN | test pada                                           | fail na `toHaveCount(0)` linku „Voice conversations” |
| build czysty                                                                                 | pełny zestaw zielony                                | 5/5                                                  |

Ustalenie po drodze: przełączenie `VOICE_SESSION_MODE` w `vars` podglądu (`start-preview.mjs`) nic nie zmienia, bo `access: "public"` w `astro:env` jest wkompilowane w build; stąd spec czyta flagę z `wrangler.jsonc`, a `CLAUDE.md` („Environment”) opisuje oba tory odczytu.

## Source sweeps

| Zakres                                                                         | Komenda                                                                                                                                        | Wynik                                                              |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Bezpośredni `.from(...)` do prywatnych tabel poza `session-data/`              | `rg "\.from\(['\"](therapy_sessions\|session_messages\|session_summaries\|session_trial_claims)['\"]\)" src --glob '!src/lib/session-data/**'` | brak trafień                                                       |
| `console.*` w `src/lib/voice`, trasach `voice/*`, `voice-*.ts`, hooku i peerze | `rg "console\.(log\|error\|warn)"`                                                                                                             | tylko szpieg w `observer-core.test.ts`, który pilnuje braku treści |
| Pola `liveSessionId`, `sdp`, `content`, `text` w builderach zdarzeń głosowych  | `rg` po `session-events.ts`                                                                                                                    | brak trafień; sanitizer odrzuca pola z `session`/`token`/`content` |
| `api.openai.com` w kodzie przeglądarki                                         | `rg "api\.openai\.com" src/components`                                                                                                         | brak trafień (SDP idzie przez Worker, CSP bez `connect-src`)       |
| `send(` po kanale danych w peerze                                              | `rg "\.send\(" src/components/hooks/voice-peer.ts`                                                                                             | brak trafień; test peera pinuje, że `send` nigdy nie jest wołane   |

## Bramki manualne (otwarte)

Status: **nie potwierdzone** — wymagają właściciela, prawdziwego konta Cloudflare i telefonów. Bez nich flaga zostaje `off`.

- **0.5 (S3/S4)** — ocena PL na prawdziwych nagraniach: ≥ 9/10 próbek poprawnych semantycznie, 0 zmian sensu, 0 przełączeń na EN w 20 turach, wymowa akceptowalna dla dwóch native'ów; odsłuch głosu `cedar` (Marek, Olek) — katalog przypisał go bez odsłuchu.
- **0.6 (S12/S13)** — `npx wrangler login`, bieg 60 min Workera obserwatora z `scripts/spike/observer-worker/` na runtime Cloudflare: rotacja sideband co 12 min bez luki > 2 s, luka po wymuszonym eviction ≤ 30 s domykana przez alarm/heartbeat, klasyfikator z DO działa. Negatywny wynik → wariant awaryjny A z planu.
- **0.7 (S6, S9, S14)** — ZDR i region konta OpenAI dla sesji live w panelu (cytat, bez wklejania); iOS Safari i Android Chrome: prośba o mikrofon, łańcuch dotknięcia i `audio_blocked`, barge-in na głośniku, szczelność wyciszenia; S14 udokumentowane ryzyko (komendy klienta dotyczą tylko własnej sesji).
- **1.5** — migracja `20260912200000_add_voice_sessions.sql` na lokalnym Supabase (`npx supabase start`, `db push`) i `npm run test:db`.
- **2.5** — `npm run dev` z bindingiem DO i `.dev.vars` (`VOICE_SESSION_MODE=on`, klucz OpenAI): trasa `connect` uzbraja obserwatora lokalnie.
- **5.6** — lista z planu („Weryfikacja manualna”): mikrofon i łańcuch dotknięcia, „Lena mówi”/„Słucham”, wyciszenie, przerwanie awatara w pół zdania, pauza 3 s bez wcięcia, reconnect po zmianie Wi-Fi (ta sama sesja, ten sam termin), zamknięcie karty i powrót po 2 min (zapis kompletny, stan prawdziwy), wygaśnięcie sesji 10-minutowej free, druga próba free zablokowana także po usunięciu pierwszej, przycięcie premium do resztki puli, hard stop na frazie testowej (zdanie przekazania słyszalne, ekran z numerami, `interrupted` w historii), awaria klasyfikatora (podmieniony model) → pauza, po trzeciej próbie zamknięcie do ponowienia, flaga wyłączona w trakcie → rozmowa zamknięta z komunikatem, odznaka „Głos” i pamięć awatara z transkryptu, `npx wrangler tail` bez tekstu i id, 60-minutowa rozmowa premium bez luk w zapisie.
- **6.4** — po powyższych: osobny commit zmieniający tylko `VOICE_SESSION_MODE` na `on` w `wrangler.jsonc` (E2E `voice-off.spec.ts` przełączy się sam na gałąź „włączone”).

## Hosted checks

Brak — gałąź nie została wypchnięta; wdrożenie produkcyjne (migracja + Worker z klasą DO) nastąpi przez `deploy` na `main`.
