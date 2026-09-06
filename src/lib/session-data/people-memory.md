# Karty osób („Osoby z Twoich rozmów”)

Prywatne notatki o ludziach, o których użytkownik wspomina w rozmowach, budowane wsadowo z zakończonych rozmów i podawane awatarowi jako krótki brief. Zakres per użytkownik + awatar, jak automatyczna pamięć awatara (`avatar-memory.md`). Funkcja jest za flagą `PEOPLE_MEMORY_MODE` (`off|on`, publiczna zmienna serwerowa; `wrangler.jsonc` startuje z `off`). Flaga gasi tworzenie i używanie kart: ekstrakcję, sekcję na panelu, brief w prompcie i prefill startu. Zarządzanie zapisanymi kartami (zapomnienie, usunięcie wpisu, „wyłącz i usuń wszystko”) działa zawsze.

## Model danych i tożsamość

- `people_memories(user_id, avatar_id, revision)` — agregat z rewizją (CAS), osobny od `avatar_memories`.
- `people_memory_sources` — kursory partii, lustro `avatar_memory_sources`, ale niezależne: pamięć i karty mogą być w różnych miejscach historii.
- `people_persons` — osoba: `display_name` (≤60), `relation` (≤80, opcjonalna), `user_note` (≤600), `name_locked` / `relation_locked` (ustawione przez edycję użytkownika, model ich nie zmienia), `relation_source_session_id`. **Tożsamość to UUID, nie imię**: „Marta z pracy” i „Marta, kuzynka” to dwie osoby; prompt każe rozróżniać po relacji i przy niepewności tworzyć nową osobę, nigdy scalać.
- `people_facts` — mały, niezależny wpis: `kind` ∈ `who | account | feeling | wish` („kim jest dla Ciebie”, „z Twojego opisu”, „jak to przeżywasz”, „co chcesz zmienić”), `text` (≤200), `user_edited` (poprawiony ręcznie: model nie może go zastąpić ani usunąć).
- `people_fact_sources` — zbiór rozmów źródłowych wpisu. `replaceFacts` dziedziczy źródła starego wpisu plus nową rozmowę; usunięcie **dowolnej** ze źródłowych rozmów usuwa wpis (usuwanie ma pierwszeństwo przed zachowaniem treści).
- `people_person_mentions` — jedna rozmowa to jedna wzmianka niezależnie od liczby partii; stąd `mentionCount`, `firstMentionedAt`, `lastMentionedAt`.
- `people_exclusions` — zapomniane osoby jako `(imię, relacja)` po normalizacji. Osoba zapomniana nie może wrócić, gdy imię pasuje, a relacja jest zgodna **lub nieznana**; imiennik z wyraźnie inną relacją może.
- `avatar_session_contexts.people_brief_text` — brief przypięty przy starcie sesji obok `summary_text`. `therapy_sessions.about_person_id` — karta wybrana przez „Porozmawiaj o tej osobie”; trigger sprawdza właściciela i zgodność awatara (`P0012`), a brief stawia ją pierwszą z dopiskiem, że użytkownik wybrał ją na dziś.
- `user_preferences.people_memory_enabled` (domyślnie `true`); `locale` stało się opcjonalne, żeby zapis samego przełącznika nie utrwalał domyślnego języka.

Limity liczbowe (40 osób na awatara, 12 wpisów na osobę, partia 16 000 znaków w zakresie 2 000–24 000, brief 6000 znaków / 10 osób / 4 wpisy) siedzą w `session-summary/people-memory-budget.ts` i są spięte z migracją `20260906120000_add_people_memory.sql` przez `schema-drift.test.ts`. Długości liczymy w znakach Unicode po obu stronach.

## Ekstrakcja

`POST /api/session/prepare-people` (`session-flow/people-memory.ts`, `prepareOwnedPeopleMemory`) to osobna pętla od `prepare-memory`: klient (`usePeopleMemoryPreparation`) uruchamia ją w panelu i na ekranie zakończonej rozmowy, czeka przed każdym żądaniem na trwającą partię pamięci tej perspektywy, a start rozmowy **nigdy** na nią nie czeka. Trasa nie sprawdza limitu rozmów (aktualizacja własnej historii to nie prawo do nowej rozmowy), jest w limiterze `SESSION_RATE_LIMITER`, a przy fladze `off` zwraca 404.

Jeden krok: `get_people_memory_batch(p_avatar_id, p_max_chars)` zwraca rewizję, indeks istniejących osób, listę zapomnianych i nieprzetworzone wiadomości (wspólny kolektor `private.collect_unprocessed_messages`, z którego korzysta też `get_avatar_memory_batch`). Prompt (`session-summary/people-memory-prompt.ts`) dostaje wyłącznie **lokalne refy** osób i wpisów oraz `conversationIndex` — żadnych UUID ani dat. Odpowiedź to strict JSON (`people-memory-schema.ts`): `newPersons`, `updates` (`personRef`, `relation`, `addFacts`, `replaceFacts`, `removeFactRefs`, `mentionedInConversations`) i `incomplete`. Parser (`parse-people-memory-changes.ts`) jest twardy na strukturę (nieznane klucze, złe typy, `finish_reason: length` → `invalid_provider_response`) i łagodny na semantykę (nieznane refy pomija, teksty przycina, limity odpowiedzi egzekwuje). Przepełniona odpowiedź (`incomplete`) dzieli partię na pół bez ruchu kursorów: 16 000 → 8 000 → 4 000 znaków w jednym żądaniu, potem wynik jest przyjmowany jako częściowy (`session.people_memory_updated` z `reasonCode: people_memory_partial`).

`save_people_memory_batch` blokuje sesje źródłowe w kolejności UUID, sprawdza kursory jak pamięć, ponownie czyta preferencję, robi CAS na rewizji i stosuje zmiany: relacja pomijana przy `relation_locked`, `replaceFacts`/`removeFactIds` pomijane dla `user_edited`, nowe osoby odrzucane przy wykluczeniu, limity na osobę i awatara. `false` tylko przy wyścigach (rewizja, cofnięty kursor, sesja nieterminalna albo cudza, preferencja wyłączona w trakcie); `22023` przy naruszeniu kontraktu (źródło spoza partii, zły kształt); wszystko semantyczne jest pomijane, a kursory i tak się przesuwają — inaczej klient pollowałby bez końca. Pusty zestaw zmian również zapisuje kursory.

Kolejność blokad wspólna dla wszystkich funkcji: `therapy_sessions` (rosnąco po UUID) → `avatar_memories` → `people_memories` → `avatar_session_contexts`.

## Brief w prompcie

`loadOwnedSessionContinuity` czyta `summary_text` i `people_brief_text` jednym odczytem (`getOwnedSessionPinnedContext`) i przekazuje brief tylko przy włączonej fladze. `session-ai/session-response-prompt.ts` dokleja sekcję za pamięcią awatara, ogrodzoną `<<<people>>>` / `<<<end people>>>`; markery obu ogrodzeń są zdejmowane z każdej notatki. Sekcja mówi modelowi, że notatki to relacja i odczucia użytkownika, nie fakty o tych osobach; że nie diagnozuje i nie przypisuje motywów nieobecnym; że może spytać, bez zakładania, czy coś się zmieniło; że przy dwóch osobach o tym samym imieniu dopytuje o którą chodzi; że osoba wybrana na dziś może być tematem od pierwszej wiadomości, a poza tym nie otwiera rozmowy od osoby.

## Kontrakt wyłączania, zapominania, usuwania

- **Zapomnij o tej osobie** (`forget_person`): usuwa osobę z wpisami, źródłami i wzmiankami; wpisuje wykluczenie; **unieważnia pamięć awatara tak jak usunięcie rozmowy** (czyści `summary_text`, kursory pamięci i przypięte kopie), a kolejne przygotowanie pamięci dostaje `forgottenPeople` w prompcie i odbudowuje ją bez tej osoby; przypięte briefy są renderowane na nowo. Zapisy rozmów i ich podsumowania zostają — copy mówi to wprost.
- **Wyłącz zapamiętywanie** (`set_people_memory_enabled(false)`): zeruje przypięte briefy wszystkich awatarów; zapis partii wyłączonej w trakcie generowania zwraca `false`; kursory stoją.
- **Włącz ponownie** (`set_people_memory_enabled(true)`): przewija kursory kart na koniec dotychczasowych rozmów — rozmowy z okresu wyłączenia nie są przetwarzane („od teraz”). Pamięć awatara bez zmian.
- **Wyłącz i usuń wszystkie karty** (`disable_and_delete_people_memory`): usuwa wszystko dla wszystkich perspektyw, także wykluczenia; pamięci awatara nie unieważnia. Natywny formularz na `/account/security` z wymaganym polem wyboru; działa niezależnie od flagi.
- **Usunięcie rozmowy**: trigger usuwa wpisy mające ją wśród źródeł, wzmianki, kursor, zeruje relacje z tym źródłem (gdy nie zablokowane), usuwa osoby bez wpisów i bez notatki, bumpuje rewizję i renderuje briefy na nowo. Trigger pamięci pomija kopie kontekstu sesji usuniętych w tej samej transakcji (kaskada konta) — bez tego druga aktualizacja tej samej kopii wymuszała sprawdzenie klucza obcego do już usuniętej sesji.
- **Korekty użytkownika** (`update_person_card`, `update_person_fact`, `delete_person_fact`): zmienione imię lub relacja dostają blokadę, poprawiony wpis `user_edited`; każda edycja bumpuje rewizję, więc trwająca partia przegrywa CAS zamiast nadpisać korektę.
- **Usunięcie konta**: kaskada z `auth.users`, bez zmian w `delete_own_account`.

## Interfejs

- `/dashboard`: sekcja `PeopleCards` (`client:visible`) pod historią, za zapisaną perspektywą; lista bez treści wpisów (cały wiersz to przycisk), natywny dialog karty z pochodzeniem wpisów (linki do `/dashboard?session=`), edycją osoby, poprawą i usuwaniem wpisów, zapomnieniem z potwierdzeniem oraz akcją główną „Porozmawiaj o tej osobie” (`/dashboard?start=now&about=<id>`; przy aktywnej rozmowie tej samej perspektywy — powrót do niej). Po zakończeniu przygotowania w tle lista odświeża się przez `GET /api/session/people?avatar=`.
- Start: `aboutPersonId` w body `/api/session/start(-next)` → walidacja właściciela i awatara → `about_person_id` w sesji → osoba pierwsza w briefie; `session.astro` wstawia zdanie z imieniem i relacją do pola tylko przed pierwszą wiadomością użytkownika. Imię nigdy nie jedzie w adresie.
- `/account/security`: karta „Osoby z Twoich rozmów” z przełącznikiem (`/api/profile/people-memory`, natywny formularz, nie fail-open) i „Wyłącz i usuń wszystkie karty”; przy fladze `off` karta zostaje, jeśli istnieją zapisy.
- `/privacy`: akapit w `#ai` i punkt w `#deletion` w obu językach, oba za flagą.
- Trasy właściciela: `GET /api/session/people`, `PATCH /api/session/people/[personId]`, `PATCH|DELETE /api/session/people/[personId]/facts/[factId]`, `POST /api/session/people/[personId]/forget`, `POST /api/session/people/delete-all`. Kontrakt w `session-flow/people-contract.ts`. Bez logowania (imiona to treść) i bez limitera (brak AI).

## Logi i prywatność

`session.people_memory_updated` niesie tylko `outcome`, `durationMs`, `provider`, `inputUnits`/`outputUnits` i ewentualnie `reasonCode: people_memory_partial`; awaria providera idzie przez `session.ai_provider_failed`. Żadnych imion, liczby osób ani identyfikatorów. Admin nie widzi nic. Reguły o cechach szczególnych osób trzecich (religia, zdrowie, orientacja, pochodzenie, poglądy) i o obelgach egzekwuje wyłącznie prompt; mechanizmem kontroli są widoczne karty, poprawa i usuwanie wpisów oraz zapomnienie. Wykluczenia to trwale przechowywane imiona osób trzecich z relacją, owner-only, kasowane z kontem.

## Weryfikacja lokalna — 6 września 2026

Testy jednostkowe: prompt i strict schema ekstrakcji, parser (struktura twardo, semantyka łagodnie, limity → `incomplete`), request builder (Luna: `low`, `azure/eu`, ≥6000 tokenów), `deployed-model-budgets`, warstwa danych, flow z podziałem partii i wykluczeniami, kontynuacja, body startu, trasa `prepare-people`, trasy właściciela i przełącznik, wyspa kart (stany, dialog, potwierdzenia, oba warianty akcji głównej), hooki przygotowania (czekanie na partię pamięci, stop bez czekania), asercje tekstowe panelu, strony rozmowy, strony bezpieczeństwa i partiali prywatności, parytet i diakrytyki copy. Testy PostgreSQL (`tests/database/people-memory.test.mjs`): izolacja właściciela łącznie z adminem i anon, dwie Marty, wyścigi CAS i kursorów, `22023` dla obcego źródła, pochodzenie i usuwanie po źródle, korekty użytkownika po późniejszej partii, zapomnienie z unieważnieniem pamięci i regułą relacji, wyłączanie/włączanie/usuwanie wszystkiego, render briefu z osobą wybraną na dziś, wyścig zapomnienia z przypięciem, kaskada konta i `supabase_auth_admin`, zgodność starych RPC pamięci.

Scenariusz syntetyczny z prawdziwym OpenRouter (trzy rozmowy z dwiema Martami, `prepare-people` do 200, start z `aboutPersonId`, odpowiedź modelu dopytująca o którą Martę chodzi, zapomnienie i odbudowa pamięci) oraz przejście w Chromium przy 390 px i 1280 px **nie zostały jeszcze wykonane** — to lista kontroli przed włączeniem flagi na produkcji, razem z konsultacją prawną dotyczącą danych osób trzecich.
