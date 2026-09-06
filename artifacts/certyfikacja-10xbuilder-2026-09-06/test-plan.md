# Plan testów SafeSpace

Stan dokumentu: 6 września 2026. Dokument porządkuje istniejące testy według ryzyk użytkownika; nie oznacza, że wszystkie opisane scenariusze są zautomatyzowane w przeglądarce.

## Cel i zakres

Użytkownik ma móc zalogować się, wybrać perspektywę, zapisać rozmowę, wrócić do jej historii i ją usunąć. Prywatna treść musi pozostać dostępna tylko właścicielowi. Limity sesji i decyzje granicy bezpieczeństwa obowiązują także po stronie serwera i bazy danych.

Podstawa: [PRD](./prd.md), [roadmapa](./roadmap.md), [granica danych sesji](../../src/lib/session-data/README.md).

## Ryzyka i dowody ochrony

| Ryzyko                                                                              | Priorytet | Oczekiwany wynik dla użytkownika                                                                                              | Istniejąca automatyzacja                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01: dostęp do cudzej rozmowy lub pamięci, także z konta administratora            | Krytyczny | Inny użytkownik nie odczytuje ani nie zmienia prywatnej treści.                                                               | `tests/database/session-integrity.test.mjs`: rzeczywiste role PostgreSQL, RLS, izolacja wiadomości i pamięci; `src/pages/api/session/__tests__/session-history-route.test.ts`: kontrakt dostępu do historii.                                                                           |
| R-02: usunięta rozmowa zachowuje treść lub wraca po spóźnionej odpowiedzi           | Krytyczny | Usunięcie usuwa wiadomości, podsumowania i potwierdzenia tur; nowy zapis nie odtwarza rozmowy.                                | `src/lib/session-data/__tests__/deletion.test.ts`: atomowy purge i bezpieczny tombstone; `tests/database/session-integrity.test.mjs`: usunięcie kontra zapis oraz unieważnienie pamięci.                                                                                               |
| R-03: awaria klasyfikatora albo sygnał kryzysu uruchamia zwykłą odpowiedź AI        | Krytyczny | Zwykła generacja jest zatrzymana; błąd usługi jest odróżniony od wykrytego sygnału kryzysowego.                               | `src/lib/session-safety/__tests__/evaluate-session-safety.test.ts`, `src/lib/session-safety/__tests__/openrouter-classifier.test.ts`, `src/pages/api/session/__tests__/session-message-route.test.ts`. Testy sprawdzają sterowanie przepływem, nie kliniczną skuteczność klasyfikacji. |
| R-04: ponowienie lub równoległe wysłanie dubluje wiadomości                         | Wysoki    | Ponowienie tej samej tury zwraca zapisany wynik, a konkurencyjny zapis nie tworzy dodatkowych wiadomości.                     | `src/pages/api/session/__tests__/session-message-route.test.ts`: replay bez ponownego AI; `tests/database/session-integrity.test.mjs`: równoległe rezerwacje, blokady i wygasłe próby.                                                                                                 |
| R-05: obejście czasu lub liczby bezpłatnych rozmów                                  | Wysoki    | Upływ czasu i wyczerpanie limitu blokują niedozwolony start/zapis niezależnie od UI.                                          | `src/lib/session-flow/__tests__/session-state.test.ts`, `src/lib/session-data/__tests__/quota.test.ts`, `tests/database/session-integrity.test.mjs`: zegar serwera i ograniczenia bazy.                                                                                                |
| R-06: aktualizacja perspektywy nie zapisuje się albo obchodzi blokadę konta         | Wysoki    | Dozwolony wybór zostaje zapisany dla właściciela i jest widoczny po powrocie do panelu; zablokowane konto nie zapisuje zmian. | `src/pages/api/profile/__tests__/avatar.test.ts`: upsert wyboru i kontrola dostępu; ręczna weryfikacja odświeżenia w przeglądarce.                                                                                                                                                     |
| R-07: logowanie jest widoczne, ale formularz nie działa po hydratacji lub przez CSP | Wysoki    | Użytkownik może obsłużyć formularz i otrzymać walidację w produkcyjnym buildzie.                                              | `tests/e2e/seed.spec.ts`, `tests/e2e/signup-validation.spec.ts`: rzeczywisty Chromium i lokalny workerd; bez udawanego udanego logowania do Supabase.                                                                                                                                  |
| R-08: prywatna treść trafia do logów operacyjnych                                   | Krytyczny | Log zawiera wyłącznie dozwolone metadane, bez treści rozmów, promptów, e-maili i tokenów.                                     | `src/lib/operational-visibility/__tests__/sanitize-event.test.ts`, `src/lib/operational-visibility/__tests__/logger.test.ts`.                                                                                                                                                          |
| R-09: następna rozmowa otrzymuje pamięć innej osoby lub innego awatara              | Krytyczny | Pamięć jest ograniczona do właściciela i perspektywy; rozpoczęta sesja używa przypisanej kopii.                               | `tests/database/session-integrity.test.mjs`, `src/pages/api/session/__tests__/session-message-route.test.ts`, `src/lib/session-data/__tests__/avatar-memory-batch.test.ts`.                                                                                                            |

## Warstwy i uruchamianie

- `npm run test` — Vitest: logika, kontrakty tras i komponenty. Mocks w testach tras nie dowodzą integracji z prawdziwą bazą ani dostawcą AI.
- `npm run test:db` — migracje i testy RLS/współbieżności na jednorazowym PostgreSQL. Uproszczona tabela Auth jest fixturem; ten zestaw nie testuje logowania HTTP w Supabase.
- `npm run build`, następnie `npm run test:e2e` — Chromium, produkcyjny CSP i hydratacja. Zakres oraz izolację opisuje [README E2E](../../tests/e2e/README.md). Te testy nie potwierdzają całej zalogowanej rozmowy z AI.
- Przeglądarka + lokalny Supabase + rzeczywisty dostawca AI — ręczny scenariusz akceptacyjny poniżej. Używać wyłącznie syntetycznej treści i osobnego konta testowego.

Środowisko Node powinno odpowiadać `.nvmrc`. CI dodatkowo wykonuje audyt zależności, lint, TypeScript i Astro check.

## Scenariusz akceptacyjny CRUD

1. Utworzyć odrębne konto testowe w lokalnym Supabase i zalogować się formularzem aplikacji.
2. Zapisać perspektywę, zmienić ją i odświeżyć panel. Odczyt ma pokazać ostatni zapisany wybór (Update).
3. Rozpocząć rozmowę i wysłać neutralną wiadomość demonstracyjną. Poczekać na rzeczywistą odpowiedź (Create).
4. Zakończyć rozmowę. Jej stan ma przejść do zakończonego (Update).
5. Otworzyć historię, odświeżyć stronę i ponownie odczytać zapis (Read).
6. Wygenerować podsumowanie i sprawdzić jego widoczność po odświeżeniu.
7. Usunąć własną rozmowę demonstracyjną po potwierdzeniu; sprawdzić brak w historii i usunięcie prywatnych rekordów (Delete, R-02).
8. Posprzątać utworzone dane i serwery uruchomione wyłącznie do weryfikacji.

## Kryterium wydania i ograniczenia

Wymagane automatyczne kontrole muszą być zielone dla ocenianego commita. Oddzielnie zapisuje się wynik scenariusza ręcznego, zakres środowiska i źródła danych demonstracyjnych. Przechodzący test bezpieczeństwa nie stanowi dowodu skuteczności klinicznej ani gwarancji wykrywania kryzysów. Ocena certyfikacyjna nie obejmuje zatwierdzenia produktu do zastosowań medycznych.

Wynik przygotowania zgłoszenia z 6 września 2026 znajduje się w `artifacts/certyfikacja-10xbuilder-2026-09-06/`.
