# Session data boundary

F-01 tworzy prywatna granice danych sesji. Kod przyszlych slice'ow S-04, S-05, S-06 i S-07 ma uzywac tego katalogu zamiast bezposrednich zapytan `.from(...)` do tabel prywatnych.

## Zasady uzycia

- Kazdy przyszly handler `/api/session`, `/api/chat` albo historii najpierw wywoluje `getSessionDataContext(context)`.
- Handler nie wymaga `user.email`, provider tokenow ani service-role secretow. Przekazuje standardowy Astro context; cookies sa uzywane tylko przez SSR `createClient`, a publiczny kontrakt helpera opiera sie na `context.locals.user.id`.
- Start darmowej sesji musi przejsc przez helper limitu/claimu z F-01, zanim powstanie zwykla sesja rozmowy.
- Wiadomosci sa dopisywane przez repository helpery. Nie tworz nowych direct insertow do `session_messages`.
- Podsumowania widoczne dla uzytkownika sa tworzone przez summary helpery. Nie laduj nieograniczonej historii raw messages jako kontekstu kolejnej sesji.
- Usuwanie sesji ma przechodzic przez deletion helper z Fazy 3, ktory zostawia minimalny tombstone sesji i usuwa prywatne wiadomosci oraz podsumowania.
- Nie loguj raw `content`, `summaryText`, promptow, provider payloadow ani tekstu wypowiedzi uzytkownika/asystenta.
- Nie dodawaj admin-readable helperow ani widokow z trescia rozmow w F-01.

## Typy domenowe teraz

Ten katalog uzywa recznie utrzymywanych typow domenowych w `types.ts`. To celowe: F-01 ma byc mozliwe do wdrozenia bez lokalnego lub hostowanego typegen Supabase.

Typy domenowe sa kontraktem prywatnosci, nie tylko odbiciem tabel. Oddzielaja:

- `SessionMetadata` od prywatnych rekordow contentu.
- `SessionMessageRecord` i `SessionSummaryRecord`, ktore zawieraja tresc prywatna.
- `DeletedSessionTombstone`, ktory nie zawiera `content`, `summaryText`, tytulu, podgladu, promptu, provider payloadu, `modalityId` ani `avatarId`.

## Typegen handoff

Gdy lokalny lub hostowany Supabase bedzie dostepny, dodaj wygenerowane typy `Database` osobnym krokiem. Oczekiwany kierunek:

```bash
npx supabase gen types typescript --local > src/lib/supabase-database.types.ts
```

albo dla hostowanego projektu:

```bash
npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" > src/lib/supabase-database.types.ts
```

Wygenerowane typy maja wzmacniac ten boundary, nie zastepowac go. Publiczne route handlery dalej powinny zwracac typy domenowe i stabilne kody bledow, a nie raw Supabase rows.

## Stabilne bledy

Helpery zwracaja `SessionDataResult<T>` i `SessionDataErrorCode`. Nie przekazuj raw Supabase `message`, `details` ani `hint` do UI, logow lub response body. Dla konfliktu darmowej sesji uzyj stabilnego kodu `trial_already_claimed`.

## Integralność tury i ponawianie żądań

Migracja `20260904204248` wymusza dozwolone przejścia statusów także dla bezpośredniego
Data API. Stan końcowy nie może wrócić do `created` ani `active`. Aktywacja wymaga
ograniczonego, aktualnego budżetu. Triggery zapisu treści blokują wiersz sesji:
wiadomości wymagają aktywnej, niewygasłej sesji, a podsumowania — nieusuniętej.

`message-turns.ts`, eksportowany przez `repository.ts`, obsługuje trzy RPC:

- `claimSessionMessageTurn`: rezerwuje jedną generację na sesję na dwie minuty albo
  zwraca już zapisany wynik dla tego samego `clientMessageId` i tekstu.
- `completeSessionMessageTurn`: sprawdza właściciela, rezerwację, status i czas;
  przydziela indeksy oraz zapisuje parę wiadomości i potwierdzenie w jednej transakcji.
- `releaseSessionMessageTurn`: usuwa wyłącznie niezakończoną, zgodną rezerwację;
  po awarii Workera rezerwacja wygasa, a stare żądanie nie może zapisać odpowiedzi
  po przejęciu jej przez nową próbę.

`session_message_turns` jest prywatną tabelą z RLS per operacja. Skrót tekstu,
identyfikatory prób i powiązania wiadomości nie mogą trafiać do logów ani admina.
Treść istnieje tylko w transkrypcie; usunięcie sesji usuwa również potwierdzenia
i niezakończone rezerwacje. Stary Worker zachowuje możliwość bezpośredniego zapisu
wiadomości, ale obowiązują go nowe triggery. Stare otwarte klienty bez identyfikatora
wiadomości działają nadal; deduplikację ponowień zapewnia nowy klient.

`npm run test:db` weryfikuje pełny zestaw migracji w izolowanym PostgreSQL, także
rzeczywiste oczekiwanie dwóch połączeń na blokadę. Minimalny schemat Auth jest
fixturem; testy te nie zastępują sprawdzania logowania przez HTTP w Supabase.

## Start pierwszej darmowej sesji

S-04 `first-safe-timed-session` implementuje pierwszy realny start sesji przez `/dashboard/session` i `/api/session/start`. Ten przeplyw ma zachowac taka kolejnosc:

1. Uwierzytelnij request przez `getSessionDataContext(context)`.
2. Jesli styl rozmowy potrzebuje aktualnego wyboru awatara, wczytaj go osobnym owner-bound helperem S-03.
3. Wywolaj `claimFreeTrialSession()` z `quota.ts`; helper tworzy sesje probna i zapisuje claim w `session_trial_claims`, gdzie unikalny kontrakt bazy wymusza jeden claim na uzytkownika.
4. Dopiero po claimie przejdz do granicy F-02: ocen bezpieczenstwo i sytuacje kryzysowa przed zwykla generacja AI.
5. Jesli F-03 jest dostepne, loguj tylko bezpieczne metadane przeplywu. Nie loguj tresci rozmowy, promptow, podsumowan ani payloadow providera.

Nie sprawdzaj limitu darmowej sesji tylko w UI. Odczyt dostepnosci moze sluzyc do komunikatu, ale claim musi przejsc przez `claimFreeTrialSession()` i DB unique constraint.

## Plan konta i limit sesji planu bezplatnego

Konto ma plan `free` albo `premium` (`AccountPlan`). Wspólna reguła SQL `private.is_effective_premium` łączy niezależne uprawnienia: ręczne `admin_user_profiles.premium_granted_at` albo opłacone `billing_entitlements.paid_until > now()`. Widok `account_access` oblicza efektywne premium według czasu bazy i zachowuje RLS właściciela. `premiumGrantedAt` w aplikacji oznacza wyłącznie ręczne nadanie; płatność nigdy nie zmienia tego znacznika. Odczyty aplikacji, filtry i agregaty administratora oraz oba triggery limitów korzystają z tej samej reguły.

Konto `free` może posiadać łącznie najwyżej `FREE_PLAN_SESSION_LIMIT` (3) sesji tekstowych — liczy się każdy wiersz `therapy_sessions` właściciela z `mode = 'text'`, niezależnie od statusu, także tombstone po usunięciu; rozmowy głosowe mają osobną pulę (sekcja „Rozmowa głosowa”). Konto `premium` nie ma limitu liczby rozmów, każda ma budżet 3600 sekund. Po wygaśnięciu opłaconego okresu obowiązuje plan darmowy bez oczekiwania na webhook; rozpoczęta rozmowa zachowuje przypisany budżet. Rola `safespace_billing` nie ma dostępu do tabel rozmów, wiadomości ani podsumowań.

- Prawdziwa bramka to trigger BEFORE INSERT `therapy_sessions_enforce_free_plan_limit` (advisory lock per uzytkownik + count). Dziala dla `claim_free_trial_session()` i dla bezposredniego insertu wlasciciela, wiec klient gadajacy wprost z PostgREST tez go nie ominie. Odrzucenie to SQLSTATE `P0005` / `free_plan_session_limit_reached`, mapowane w `errors.ts` na stabilny kod `session_limit_reached`.
- `readSessionQuota()` w `quota.ts` (wlasny wiersz planu + `countOwnedSessions()`) to odczyt pre-flight: zasila stan startu (`session_limit_reached`, licznik pozostalych rozmow) i wczesne 403 w `/api/session/start` oraz `/api/session/start-next`. Nie implementuj limitu ponownie w UI ani per trasa — follow-upy licza sie do tej samej puli co pierwsza sesja.
- `schema-drift.test.ts` przypina `FREE_PLAN_SESSION_LIMIT` i SQLSTATE do migracji limitu; zmieniaj obie strony razem.

## Rozmowa głosowa (GPT-Live-1)

Migracja `20260912200000_add_voice_sessions.sql` dodaje tryb rozmowy i osobne pule głosowe; obserwator, transport i klient są opisane w `src/lib/voice/README.md`, a użytkownikowi w `/privacy#voice`:

- `therapy_sessions.mode` (`text` | `voice`, `SessionMode`) jest ustalany przy insercie i zamrożony (bez grantu update, trigger metadanych przepisuje starą wartość). **Tryby są rozłączne**: RPC głosowy odrzuca sesję tekstową SQLSTATE `P0015` (`session_mode_mismatch`), a `POST /api/session/message` odrzuca sesję głosową 409 `session_mode_mismatch` przed leasingiem tury. Start głosowy idzie wyłącznie przez `createPendingSession({ mode: "voice" })` w `start-next`; `claim_free_trial_session` zostaje tekstowy.
- `therapy_sessions.voice_connected_at` to pierwsze udane połączenie audio (`markVoiceSessionConnected`, tylko `null → wartość`; zwraca wiersz po zapisie albo `null`, gdy kolumna była już ustawiona); od niego liczy się pula minut i próba konta free, więc odmowa mikrofonu kosztuje 0 minut. Ten sam zapis w aktywnym wierszu głosowym przesuwa w triggerze metadanych `started_at` na `now()` bazy, a `expires_at` o tyle samo (długość bez zmian, start nigdy się nie cofa, reconnect niczego nie przesuwa) — zegar rozmowy głosowej rusza od połączenia, nie od startu (`20260923120000_voice_trial_starts_on_connect.sql`). **Znaczniki czasu puli należą do serwera** (`20260922120000_server_owned_voice_timestamps.sql`): pierwszy zapis `voice_connected_at` dostaje `now()` bazy niezależnie od wartości z żądania, a `ended_at` stempluje trigger metadanych przy przejściu w `completed | expired | interrupted` (oraz `active → deleted`) i zamraża — liczony z zamrożonego startu, nigdy ze `started_at` przysłanego w tym samym żądaniu, i najwyżej 5 s przed zegarem bazy (dalszy start wiersza `created` kontrola kolejności czasów odrzuca); wiersz aktywny nie może dostać `ended_at`, a rozmowa usunięta przed startem nie ma końca. Właściciel ma granty update na obie kolumny (Worker pisze jego JWT), więc bez tego bezpośredni PATCH przez PostgREST zerował zużycie puli i rozciągał okno zrzutu.
- Konto `free` ma jedną próbę głosową (bucket 600 s = `VOICE_TRIAL_DURATION_SECONDS`): bramką jest trigger limitu, który dla wiersza `mode = 'voice'` liczy własne wiersze głosowe trzymające próbę (`P0016` / `voice_trial_already_used`, `20260923120000`) — połączone kiedykolwiek (`voice_connected_at is not null`, każdy status, tombstone też, więc usunięcie użytej próby jej nie przywraca) albo trwające (`created` / `active` przed swoim `expires_at`); rozmowa zakończona, wygasła albo usunięta bez połączenia audio próby nie zabiera. `countOwnedVoiceSessions(context, now)` liczy tak samo (pre-flight panelu, konta i `start-next`). Limit 3 rozmów liczy tylko `mode = 'text'` (`countOwnedSessions` filtruje tak samo). Konto `premium` ma miesięczną pulę sekund (`VOICE_MONTHLY_MINUTES`, domyślnie 120, miesiąc UTC). Sekundy liczy baza — `readOwnedVoiceUsage` → RPC `get_owned_voice_usage(since, exclude)` (security invoker, RLS właściciela, **bez limitu wierszy**): zużyte od `voice_connected_at` do najwcześniejszego z `ended_at` / `expires_at` / teraz, nigdy ponad bucket, tombstone też; plus rezerwa innych trwających rozmów do ich `expires_at`. `voice-quota.ts` jest jedynym miejscem, które zamienia te sekundy w uprawnienie: `readVoiceQuota` (panel, konto, pre-flight `start-next`: `usedSeconds` to naprawdę przegadane, `reservedSeconds` osobno, `remainingSeconds` = pula minus jedno i drugie; `expires_at` przycięte do reszty, start wymaga `VOICE_MIN_START_SECONDS`; zdanie na koncie mówi o rezerwie trwającej rozmowy osobno, nie jako „wykorzystano”) i `readVoiceConnectAllowance` (każde `POST /api/session/voice/connect`, także wznowienie, przed płatną sesją live: reszta nie dłuższa niż rezerwa terminu obserwatora, 15 s → 403 `voice_minutes_exhausted`, bo sesja live zostałaby rozłączona od razu; mniejsza reszta niż termin rozmowy → krótszy termin obserwatora, który `connect` i heartbeat oddają klientowi w `session.expiresAt`). Rozmowa z bucketem premium liczy się do puli także po odebraniu planu; rozmowa konta free z bucketem próby dostaje łącznie 600 s w całej historii konta (→ 403 `voice_trial_used`). Nie przez bazę: bez Workera nikt nie utworzy płatnej sesji live.
- Zapis idzie pod RLS właściciela z tras: heartbeat (`POST /api/session/voice/heartbeat`), reconcile-on-read w `readSessionStartPageState` (hak `reconcileVoiceSession` repozytorium stanu) i zakończenie/usunięcie rozmowy (`closeVoiceSession`) zrzucają bufor obserwatora dwufazowo (`drain` → RPC → `ack`, `session-flow/voice-reconcile.ts`), więc awaria zapisu niczego nie gubi. `DeletedSessionTombstone.mode` mówi trasie usuwania, że trzeba rozłączyć i wyczyścić obserwatora. Usunięcie konta czyta `listOwnedVoiceObserverSessionIds` (połączone rozmowy aktywne albo z okna retencji bufora, najnowsze do 100) przed RPC i po nim woła `erase` każdego obserwatora (`session-flow/voice-account-erasure.ts`, best-effort w limicie 5 s — kaskada bazy nie sięga Durable Objects).
- Transkrypt rozmowy głosowej zapisuje wyłącznie `appendVoiceSessionUtterances` (RPC `append_voice_session_utterances`, security invoker, blokada wiersza sesji, indeksy max+1, znane `utterance_id` pomijane, ≤ 50 wypowiedzi na wywołanie). Wypowiedzi pochodzą z obserwatora po stronie serwera; przeglądarka nigdy nie dostarcza treści do zapisu. Po zamknięciu rozmowy głosowej jest 60-sekundowe okno zrzutu (`guard_session_content_insert` i RPC), bo model bywa w połowie zdania, gdy mija termin.
- `schema-drift.test.ts` przypina wartości trybu, bucket 600, oba SQLSTATE, granty, stemplowanie obu znaczników i funkcję zużycia; `tests/database/voice-sessions.test.mjs` sprawdza bramki, okno zrzutu, idempotencję, serializację, purge, znaczniki czasu serwera i zużycie ponad 200 rozmów na prawdziwym PostgreSQL.
- `VoiceQuota` (`trial` z `available` albo `pool` z `remainingSeconds`/`canStartVoice`) jest czytana równolegle z innymi odczytami na `/dashboard` i `/account/security` tylko przy `isVoiceStartAvailable()`; panel pokazuje z niej drugi przycisk startu i miernik minut, konto — jedno zdanie o puli. Wypowiedzi głosowe są zwykłymi wierszami `session_messages`, więc pamięć awatara, karty osób, mapa tematów, podsumowania i historia (odznaka „Głos” z `SessionHistoryListItem.mode`) działają bez osobnej ścieżki.

## Usuwanie sesji

Przyszly S-05 ma uzywac `deleteOwnedSession()` z `deletion.ts`. Ten helper usuwa rekordy `session_messages` i `session_summaries`, a nastepnie oznacza `therapy_sessions` jako `deleted`. Zwracany tombstone nie zawiera prywatnej tresci ani wyboru nurtu/awatara.

## Legal/safety exceptions

F-01 nie implementuje break-glass content access. Waskie wyjatki prawne lub bezpieczenstwa wymagaja osobnego planu z jawna autoryzacja, audytem, minimalizacja danych i decyzja ownera. Nie dodawaj implicit admin access w helperach F-01.

## Implemented S-04 first safe timed session

S-04 uzywa `getSessionDataContext()` jako pierwszego kroku kazdego prywatnego handlera i `claimFreeTrialSession()` jako jedynej sciezki startu darmowej sesji. Po claimie dopisuje wiadomosci przez repository helpery i czyta je przez owner-bound repository helpers.

S-04 nie moze tworzyc alternatywnego UI-only limitu darmowej sesji, direct insertow do `therapy_sessions`, `session_messages` albo `session_trial_claims`, service-role runtime secretow, ani logow z raw contentem rozmowy. Granica F-02 musi nadal decydowac o zwyklej generacji AI i przerwaniu kryzysowym.

S-04 nie dodaje listy historii, podsumowan ani admin access do prywatnej tresci. Te kierunki zostaja osobnymi slice'ami S-05, S-06 i S-07.

## Handoff for S-05 session history control

S-05 ma czytac historie przez owner-bound metadata/message helpers i usuwac sesje przez `deleteOwnedSession()`. Usuniecie oznacza hard-delete rekordow `session_messages` i `session_summaries` oraz pozostawienie minimalnego tombstone w `therapy_sessions`.

S-05 nie moze implementowac kasowania jako samego flagowania UI, nie moze zachowywac podgladow/tytulow/promptow/provider payloadow po usunieciu i nie moze zwracac tombstone z `modalityId` lub `avatarId`.

## Ciągłość rozmów i automatyczna pamięć awatara

Nowe rozmowy korzystają z automatycznego podsumowania wszystkich dostępnych wcześniejszych rozmów z tym samym awatarem. Kontrakt i ograniczenia opisuje [avatar-memory.md](./avatar-memory.md). Pamięć i jej kopie są treścią prywatną, tak jak wiadomości i podsumowania.

`therapy_sessions.uses_avatar_memory` oznacza nowy tryb. Starsze sesje zachowują swoje `uses_approved_context`: `false` nadal wyklucza odczyt kontekstu, a `true` korzysta ze starych zatwierdzonych podsumowań, zawężonych do awatara sesji. Obie flagi są niezmienne po insercie.

Ręczne `session_summaries` oraz ich statusy pozostają zgodne ze starą wersją aplikacji. W nowym przepływie służą wyłącznie jako opcjonalny podgląd pojedynczej rozmowy; ich zatwierdzenie nie steruje pamięcią nowych rozmów.

## Handoff for S-07 private admin operations

S-07 moze budowac tylko agregaty i operacje admina bez prywatnej tresci. Jesli potrzebne sa statystyki, powinny bazowac na bezpiecznych polach metadata/tombstone, takich jak status, duration bucket, trial marker i daty, bez `session_messages.content` oraz bez `session_summaries.summary_text`.

S-07 nie moze dodawac admin-readable content policies, views ani helperow z trescia rozmow. Kazdy legal/safety exception wymaga osobnego audited planu, a nie rozszerzenia F-01.
