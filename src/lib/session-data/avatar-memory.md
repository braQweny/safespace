# Automatyczna pamięć awatara

Każda nowa rozmowa po pierwszej próbie otrzymuje podsumowanie wszystkich dostępnych wcześniejszych rozmów właściciela z wybranym awatarem. Pierwsza rozmowa nie ma wcześniejszej historii. Pamięć obejmuje rozmowy zakończone, wygasłe i przerwane oraz sesje nadal oznaczone jako aktywne, których czas już minął. Puste rozmowy i samo powitanie bez wypowiedzi użytkownika są pomijane. Komunikaty `system_boundary` nie trafiają do podsumowania.

## Przygotowanie i granice kontekstu

- `prepareOwnedAvatarMemory` działa w tle na ekranie zakończenia rozmowy i w panelu, a `start-next` uzupełnia brakujący postęp przed utworzeniem sesji. Jeden krok przekazuje do modelu maksymalnie 48 000 znaków Unicode z nieprzetworzonej historii, łącząc wiele rozmów w porządku chronologicznym. Osobny limit 128 wiadomości ogranicza narzut metadanych dla bardzo krótkich wypowiedzi. Limity są egzekwowane już w bazie oraz ponownie przed wywołaniem providera; wspólne stałe aplikacji są w `session-summary/avatar-memory-budget.ts`. Długą wiadomość dzielimy dopiero na granicy budżetu partii; jej pozostała część przechodzi w następnym kroku. Nie odrzucamy początku rozmowy ani starszych sesji.
- Każdy krok aktualizuje wspólne podsumowanie do 6000 znaków, zachowując ważne informacje z wcześniejszej wersji. Jest to stratne streszczenie, nie gwarancja zachowania każdego szczegółu. Prompt wymaga rozróżniania wypowiedzi użytkownika od sugestii AI i uwzględniania późniejszych korekt.
- `POST /api/session/prepare-memory` przygotowuje wyłącznie pamięć właściciela wskazanej, poprawnej perspektywy. Sprawdza dostęp do konta i limit sesji; obejmuje go ten sam limiter co start. Nie tworzy sesji, nie uruchamia czasu i nie zwraca prywatnej treści. `202 avatar_memory_preparing` oznacza kolejny krok, `200 avatar_memory_ready` — gotowość. Po zapisie ostatniej partii od razu sprawdzamy kompletność, oszczędzając dodatkowe żądanie startu.
- Klient w tle pracuje do gotowości lub pierwszego błędu (także 429). Po opuszczeniu ekranu nie uruchamia kolejnych partii. Kliknięcie startu czeka na zapis trwającej partii, po czym `start-next` kontynuuje od trwałego kursora. Żądania jednej partii są współdzielone podczas ponownego montowania wyspy w tej samej karcie. Gotowość nie jest zapamiętywana w przeglądarce; kolejna wizyta wykrywa nowe i usunięte rozmowy. Praca w tle nie jest trwałą kolejką: zamknięcie strony, awaria sieci lub równoległe karty mogą pozostawić pracę do następnego wejścia/startu.
- `start-next` nadal zwraca `202 avatar_memory_preparing`, jeśli historii nie udało się przygotować wcześniej. Klient ponawia start i pokazuje przygotowywanie pamięci. Awaria nie zużywa nowej sesji ani jej czasu; ponowienie wznawia zapisany postęp.
- `get_avatar_memory_batch` nie ma limitu łącznej liczby wcześniejszych sesji: zbiera kolejne nieprzetworzone źródła do budżetu partii. `avatar_memory_sources` przechowuje numer wiadomości i bezwzględne przesunięcie w znakach Unicode dla każdej przetwarzanej rozmowy. Model otrzymuje wyłącznie lokalny `conversationIndex`, żeby odróżniać rozmowy; identyfikatory sesji zostają po stronie aplikacji.
- Aktualizacja używa dotychczasowego providera podsumowań i jego ustawień prywatności, z budżetem co najmniej 4000 tokenów. Nie wymaga nowych zmiennych środowiskowych.

## Izolacja, wyścigi i usuwanie

`avatar_memories`, `avatar_memory_sources` i `avatar_session_contexts` należą do prywatnej granicy `session-data`. RLS dopuszcza wyłącznie właściciela, także gdy inne konto jest administratorem. RPC działają jako `SECURITY INVOKER`, mają pusty `search_path`, a `anon` nie ma uprawnień. Tekst, kursory, identyfikatory źródeł i payloady providera nie trafiają do logów ani statystyk administratora.

`save_avatar_memory_batch` sprawdza właściciela, awatara, końcowy stan każdego źródła, poprawność i postęp kursorów oraz UUID poprzedniej rewizji. Blokuje najpierw wszystkie sesje w stałej kolejności UUID, następnie pamięć, zachowując kolejność sesja → pamięć używaną przez usuwanie. Zapis podsumowania i wszystkich kursorów jest atomowy; odrzucenie choć jednego źródła nie przesuwa żadnego kursora. Przegrany zapis nie nadpisuje nowszej rewizji. Zmiana rewizji po unieważnieniu uniemożliwia odtworzenie usuniętej treści przez spóźniony provider.

Przy insercie sesji z `uses_avatar_memory=true` baza sprawdza, czy wszystkie źródła zostały przetworzone, i zapisuje prywatną kopię kontekstu. Niekompletna pamięć przerywa całą transakcję inserta. Zarówno otwarcie, jak i późniejsze odpowiedzi czytają tę samą kopię; nowe rozmowy nie zmieniają kontekstu starszej sesji. Błąd odczytu kopii blokuje generowanie zamiast cicho rozpoczynać od zera. Treść jest w prompcie ogrodzona jako niezaufane dane.

Usunięcie rozmowy czyści zbiorczą pamięć jej awatara, wszystkie kursory oraz przypięte kopie kontekstu tego awatara. Następny start odbudowuje pamięć z pozostałych rozmów. Nie usuwa to wiadomości już zapisanych w innych rozmowach, nawet jeśli nawiązywały do usuwanego źródła.

## Interfejs i zgodność wdrożenia

Panel wyjaśnia automatyczny start i udostępnia rozwijany podgląd obecnej pamięci. Przed startem może ona wymagać uzupełnienia o ostatnio zakończone rozmowy. Ręczne podsumowania pojedynczych rozmów pozostają opcjonalnym podglądem; nie sterują nową pamięcią.

Migracja `20260904225952_add_automatic_avatar_memory.sql` jest addytywna. Starszy Worker nadal używa `uses_approved_context`, a nowe `uses_avatar_memory` domyślnie ma wartość `false`. Nowe follow-upy ustawiają obie flagi na `true`. Migrację należy zastosować przed publikacją nowego Workera w istniejącym wspólnym locku wdrożenia.

Migracja `20260905075745_batch_avatar_memory_by_text_budget.sql` dodaje RPC obsługujące partie wielu rozmów. Zachowuje stare `get_avatar_memory_work` i `save_avatar_memory_work` dla starszego Workera oraz kontroli kompletności przy insercie sesji. Obie wersje współdzielą rewizję i kursory, również częściowo przetworzone wiadomości. Ta migracja również musi poprzedzić nowego Workera; nie wymaga nowych sekretów ani usług.

## Liczba wywołań modelu

Gotowa pamięć bez nowych źródeł nie wymaga wywołania modelu. Przy aktualizacji jedna partia to jedna generacja: dotychczasowe podsumowanie plus nowa treść, bez ponownego wysyłania całej przetworzonej historii. Na przykład 40 wiadomości po 1200 znaków mieści się teraz w jednej generacji zamiast trzech, a dziesięć rozmów po osiem krótkich wiadomości — w jednej zamiast dziesięciu, o ile ich łączna treść mieści się w budżecie 48 000 znaków.

Mniej generacji oznacza również mniej wielokrotnych wysyłek poprzedniego podsumowania i mniej odpowiedzi pośrednich. Redukcja liczby wywołań nie jest jednak identyczna z procentową oszczędnością kosztu tokenów; zależy od długości historii, odpowiedzi modelu i liczby ponowień. Opcjonalne ręczne podsumowanie pojedynczej rozmowy nadal jest osobną generacją na żądanie użytkownika.

Testy obejmują pełne przejście przez długie źródła, Unicode, awarie providera, wznowienie klienta po 202, pełne podsumowanie w promptach otwarcia i odpowiedzi oraz PostgreSQL: więcej niż trzy rozmowy, RLS, przypięcie kontekstu, odmowę niekompletnego startu i usuwanie podczas generowania.

## Weryfikacja lokalna — 5 września 2026

Przeszło 794 testów aplikacji, 16 testów PostgreSQL oraz produkcyjny test Chromium sprawdzający CSP i hydratację. Lint, TypeScript, Astro check i build zakończyły się poprawnie; audyt zależności nie wykazał podatności, a lokalny doradca bezpieczeństwa Supabase nie zgłosił problemów. Lista migracji i `schema_migrations` potwierdzają zastosowanie nowej migracji lokalnie.

Osobny scenariusz w Chromium na lokalnym buildzie produkcyjnym utworzył pięć syntetycznych zakończonych rozmów, przygotował ich zbiorczą pamięć, rozpoczął nową sesję i potwierdził, że prawdziwy model przywołuje fakty z pierwszej oraz czwartej rozmowy. Sprawdzono również podgląd pamięci przy szerokości 390 px. Jedna odpowiedź wymagała ponowienia po przejściowym błędzie dostawcy. Wcześniejsze próby potwierdziły zachowanie postępu po błędzie podczas przygotowania pamięci. Konta testowe usunięto. Weryfikacja nie obejmowała wdrożenia na produkcję.

## Przyspieszenie startu — 5 września 2026

Przygotowanie w tle, przekazanie trwającej partii do jawnego startu, błędy, limit żądań i lżejsze rozumowanie powitania mają testy regresji. Przeszły 864 testy aplikacji, 16 testów PostgreSQL, lint, TypeScript, Astro check, build i dwa istniejące testy Chromium na buildzie produkcyjnym.

Dodatkowy przebieg Chromium przy szerokości 390 px korzystał z lokalnego serwera deweloperskiego, prawdziwego Supabase i OpenRouter oraz osobnego konta z dwiema krótkimi rozmowami syntetycznymi. Przygotowanie pamięci w panelu zajęło 4,8 s i nie utworzyło sesji. Późniejsze kliknięcie otworzyło rozmowę z powitaniem w 2,4 s, przez jedno żądanie startu. Rewizja pamięci nie zmieniła się przy starcie, a przypięty kontekst był identyczny z przygotowaną pamięcią i obejmował obie rozmowy. Ekran zakończenia uruchomił przygotowanie ponownie; po wykorzystaniu trzeciej bezpłatnej sesji serwer zatrzymał je na limicie konta. Celowe wyłączenie przygotowania w panelu spowodowało błąd tego sprawdzenia; implementację przywrócono. Dane testowe usunięto.

To pomiar pojedynczego scenariusza lokalnego, nie porównanie wydajności na produkcji ani gwarancja czasu dla długiej historii. Zmiana nie wymaga migracji ani nowych zmiennych środowiskowych.

## Oszczędniejsze partie pamięci — 5 września 2026

Przeszło 876 testów aplikacji, 23 testy PostgreSQL oraz dwa istniejące testy Chromium na buildzie produkcyjnym. Lint, TypeScript, Astro check i build zakończyły się poprawnie. Nowe testy sprawdzają liczbę wywołań modelu, wspólny budżet wielu rozmów, długie wiadomości Unicode, zgodność ze starymi kursorami, atomowy zapis wszystkich źródeł, równoległe generacje i usuwanie podczas generowania. Lokalna baza ma wszystkie 14 migracji, w tym `20260905075745`; doradca bezpieczeństwa Supabase nie zgłosił problemów.

Dodatkowy scenariusz przez lokalne API z prawdziwym Supabase i OpenRouter objął dziesięć syntetycznych rozmów, 80 wiadomości i 43 036 znaków źródłowych. Jedno żądanie przygotowania wykonało jedną generację, zapisało postęp wszystkich dziesięciu źródeł i zwróciło gotowość w 4460 ms, bez utworzenia sesji. Pamięć zawierała wskazane fakty z pierwszej i ostatniej rozmowy. Ponowne przygotowanie zajęło 130 ms i pozostawiło tę samą rewizję. Start z przygotowaną pamięcią zwrócił 201 w 922 ms, a przypięta kopia była identyczna z przygotowanym podsumowaniem. Konto i dane testowe usunięto. Są to pojedyncze pomiary lokalne; zmiana nie została wdrożona na produkcję.

## Język pamięci — 5 września 2026

Pamięć jest pisana w języku interfejsu z chwili żądania `prepare-memory`/`start-next` (`buildAvatarMemorySystemPrompt(locale)`), tak jak otwarcie rozmowy i podsumowania. Po przełączeniu języka między rozmowami kolejna partia może przepisać całą pamięć w nowym języku — fakty zostają, zmienia się tylko język prozy. Przypięta kopia trwającej rozmowy nigdy nie jest przepisywana w jej trakcie.
