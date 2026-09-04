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

Konto ma plan `free` albo `premium` (`AccountPlan`); znacznikiem premium jest `admin_user_profiles.premium_granted_at`. Konto `free` moze posiadac lacznie najwyzej `FREE_PLAN_SESSION_LIMIT` (3) sesji — liczy sie kazdy wiersz `therapy_sessions` wlasciciela, niezaleznie od statusu, tombstone po usunieciu tez. Konto `premium` nie ma limitu. Nie ma integracji platnosci: premium nadaje aktywny admin (audytowane) albo owner-run SQL.

- Prawdziwa bramka to trigger BEFORE INSERT `therapy_sessions_enforce_free_plan_limit` (advisory lock per uzytkownik + count). Dziala dla `claim_free_trial_session()` i dla bezposredniego insertu wlasciciela, wiec klient gadajacy wprost z PostgREST tez go nie ominie. Odrzucenie to SQLSTATE `P0005` / `free_plan_session_limit_reached`, mapowane w `errors.ts` na stabilny kod `session_limit_reached`.
- `readSessionQuota()` w `quota.ts` (wlasny wiersz planu + `countOwnedSessions()`) to odczyt pre-flight: zasila stan startu (`session_limit_reached`, licznik pozostalych rozmow) i wczesne 403 w `/api/session/start` oraz `/api/session/start-next`. Nie implementuj limitu ponownie w UI ani per trasa — follow-upy licza sie do tej samej puli co pierwsza sesja.
- `schema-drift.test.ts` przypina `FREE_PLAN_SESSION_LIMIT` i SQLSTATE do migracji limitu; zmieniaj obie strony razem.

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
