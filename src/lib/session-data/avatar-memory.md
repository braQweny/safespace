# Automatyczna pamięć awatara

Każda nowa rozmowa po pierwszej próbie otrzymuje podsumowanie wszystkich dostępnych wcześniejszych rozmów właściciela z wybranym awatarem. Pierwsza rozmowa nie ma wcześniejszej historii. Pamięć obejmuje rozmowy zakończone, wygasłe i przerwane oraz sesje nadal oznaczone jako aktywne, których czas już minął. Puste rozmowy i samo powitanie bez wypowiedzi użytkownika są pomijane. Komunikaty `system_boundary` nie trafiają do podsumowania.

## Przygotowanie i granice kontekstu

- `prepareOwnedAvatarMemory` działa w tle na ekranie zakończenia rozmowy i w panelu, a `start-next` uzupełnia brakujący postęp przed utworzeniem sesji. Jeden krok czyta do 16 wiadomości i przekazuje do modelu maksymalnie 16 fragmentów po 1200 znaków Unicode. Długie wiadomości są dzielone; ich pozostała część przechodzi w następnym kroku. Nie odrzucamy początku rozmowy ani starszych sesji.
- Każdy krok aktualizuje wspólne podsumowanie do 6000 znaków, zachowując ważne informacje z wcześniejszej wersji. Jest to stratne streszczenie, nie gwarancja zachowania każdego szczegółu. Prompt wymaga rozróżniania wypowiedzi użytkownika od sugestii AI i uwzględniania późniejszych korekt.
- `POST /api/session/prepare-memory` przygotowuje wyłącznie pamięć właściciela wskazanej, poprawnej perspektywy. Sprawdza dostęp do konta i limit sesji; obejmuje go ten sam limiter co start. Nie tworzy sesji, nie uruchamia czasu i nie zwraca prywatnej treści. `202 avatar_memory_preparing` oznacza kolejny krok, `200 avatar_memory_ready` — gotowość. Po zapisie ostatniej partii od razu sprawdzamy kompletność, oszczędzając dodatkowe żądanie startu.
- Klient w tle pracuje do gotowości lub pierwszego błędu (także 429). Po opuszczeniu ekranu nie uruchamia kolejnych partii. Kliknięcie startu czeka na zapis trwającej partii, po czym `start-next` kontynuuje od trwałego kursora. Żądania jednej partii są współdzielone podczas ponownego montowania wyspy w tej samej karcie. Gotowość nie jest zapamiętywana w przeglądarce; kolejna wizyta wykrywa nowe i usunięte rozmowy. Praca w tle nie jest trwałą kolejką: zamknięcie strony, awaria sieci lub równoległe karty mogą pozostawić pracę do następnego wejścia/startu.
- `start-next` nadal zwraca `202 avatar_memory_preparing`, jeśli historii nie udało się przygotować wcześniej. Klient ponawia start i pokazuje przygotowywanie pamięci. Awaria nie zużywa nowej sesji ani jej czasu; ponowienie wznawia zapisany postęp.
- `get_avatar_memory_work` nie ma limitu liczby wcześniejszych sesji: wybiera najstarsze nieprzetworzone źródło. `avatar_memory_sources` przechowuje numer wiadomości i przesunięcie w znakach dla każdej przetwarzanej rozmowy.
- Aktualizacja używa dotychczasowego providera podsumowań i jego ustawień prywatności, z budżetem co najmniej 4000 tokenów. Nie wymaga nowych zmiennych środowiskowych.

## Izolacja, wyścigi i usuwanie

`avatar_memories`, `avatar_memory_sources` i `avatar_session_contexts` należą do prywatnej granicy `session-data`. RLS dopuszcza wyłącznie właściciela, także gdy inne konto jest administratorem. RPC działają jako `SECURITY INVOKER`, mają pusty `search_path`, a `anon` nie ma uprawnień. Tekst, kursory, identyfikatory źródeł i payloady providera nie trafiają do logów ani statystyk administratora.

Zapis pamięci sprawdza właściciela, awatara, końcowy stan źródła i UUID poprzedniej rewizji. Blokuje najpierw sesję, następnie pamięć, tak jak ścieżka usuwania. Przegrany zapis nie nadpisuje nowszej rewizji. Zmiana rewizji po unieważnieniu uniemożliwia odtworzenie usuniętej treści przez spóźniony provider.

Przy insercie sesji z `uses_avatar_memory=true` baza sprawdza, czy wszystkie źródła zostały przetworzone, i zapisuje prywatną kopię kontekstu. Niekompletna pamięć przerywa całą transakcję inserta. Zarówno otwarcie, jak i późniejsze odpowiedzi czytają tę samą kopię; nowe rozmowy nie zmieniają kontekstu starszej sesji. Błąd odczytu kopii blokuje generowanie zamiast cicho rozpoczynać od zera. Treść jest w prompcie ogrodzona jako niezaufane dane.

Usunięcie rozmowy czyści zbiorczą pamięć jej awatara, wszystkie kursory oraz przypięte kopie kontekstu tego awatara. Następny start odbudowuje pamięć z pozostałych rozmów. Nie usuwa to wiadomości już zapisanych w innych rozmowach, nawet jeśli nawiązywały do usuwanego źródła.

## Interfejs i zgodność wdrożenia

Panel wyjaśnia automatyczny start i udostępnia rozwijany podgląd obecnej pamięci. Przed startem może ona wymagać uzupełnienia o ostatnio zakończone rozmowy. Ręczne podsumowania pojedynczych rozmów pozostają opcjonalnym podglądem; nie sterują nową pamięcią.

Migracja `20260904225952_add_automatic_avatar_memory.sql` jest addytywna. Starszy Worker nadal używa `uses_approved_context`, a nowe `uses_avatar_memory` domyślnie ma wartość `false`. Nowe follow-upy ustawiają obie flagi na `true`. Migrację należy zastosować przed publikacją nowego Workera w istniejącym wspólnym locku wdrożenia.

Testy obejmują pełne przejście przez długie źródła, Unicode, awarie providera, wznowienie klienta po 202, pełne podsumowanie w promptach otwarcia i odpowiedzi oraz PostgreSQL: więcej niż trzy rozmowy, RLS, przypięcie kontekstu, odmowę niekompletnego startu i usuwanie podczas generowania.

## Weryfikacja lokalna — 5 września 2026

Przeszło 794 testów aplikacji, 16 testów PostgreSQL oraz produkcyjny test Chromium sprawdzający CSP i hydratację. Lint, TypeScript, Astro check i build zakończyły się poprawnie; audyt zależności nie wykazał podatności, a lokalny doradca bezpieczeństwa Supabase nie zgłosił problemów. Lista migracji i `schema_migrations` potwierdzają zastosowanie nowej migracji lokalnie.

Osobny scenariusz w Chromium na lokalnym buildzie produkcyjnym utworzył pięć syntetycznych zakończonych rozmów, przygotował ich zbiorczą pamięć, rozpoczął nową sesję i potwierdził, że prawdziwy model przywołuje fakty z pierwszej oraz czwartej rozmowy. Sprawdzono również podgląd pamięci przy szerokości 390 px. Jedna odpowiedź wymagała ponowienia po przejściowym błędzie dostawcy. Wcześniejsze próby potwierdziły zachowanie postępu po błędzie podczas przygotowania pamięci. Konta testowe usunięto. Weryfikacja nie obejmowała wdrożenia na produkcję.

## Przyspieszenie startu — 5 września 2026

Przygotowanie w tle, przekazanie trwającej partii do jawnego startu, błędy, limit żądań i lżejsze rozumowanie powitania mają testy regresji. Przeszły 864 testy aplikacji, 16 testów PostgreSQL, lint, TypeScript, Astro check, build i dwa istniejące testy Chromium na buildzie produkcyjnym.

Dodatkowy przebieg Chromium przy szerokości 390 px korzystał z lokalnego serwera deweloperskiego, prawdziwego Supabase i OpenRouter oraz osobnego konta z dwiema krótkimi rozmowami syntetycznymi. Przygotowanie pamięci w panelu zajęło 4,8 s i nie utworzyło sesji. Późniejsze kliknięcie otworzyło rozmowę z powitaniem w 2,4 s, przez jedno żądanie startu. Rewizja pamięci nie zmieniła się przy starcie, a przypięty kontekst był identyczny z przygotowaną pamięcią i obejmował obie rozmowy. Ekran zakończenia uruchomił przygotowanie ponownie; po wykorzystaniu trzeciej bezpłatnej sesji serwer zatrzymał je na limicie konta. Celowe wyłączenie przygotowania w panelu spowodowało błąd tego sprawdzenia; implementację przywrócono. Dane testowe usunięto.

To pomiar pojedynczego scenariusza lokalnego, nie porównanie wydajności na produkcji ani gwarancja czasu dla długiej historii. Zmiana nie wymaga migracji ani nowych zmiennych środowiskowych.
