# Soczewki tematyczne (`session-lens/`)

„Lekarz prowadzący i ławka specjalistów” bez zmiany modelu ani awatara: gdy rozmowa wyraźnie krąży wokół jednego tematu, prompt odpowiedzi dostaje krótki moduł „co słyszeć i o co pytać” doklejony do sekcji nurtu. Awatar zachowuje własny głos, własny łuk sesji i własne `Avoid:` — soczewka nigdy nie mówi „działaj jak”.

## Kontrakt

- **Katalog** żyje w `session-ai/session-lenses.ts` (`SESSION_LENS_IDS`: `family_of_origin`, `work_burnout`, `anxiety_avoidance`; każdy moduł ≤ 600 znaków, pinowane testem). To materiał promptu, więc siedzi obok promptu; ten katalog tylko go wykrywa.
- **Wykrywanie** to osobne, tanie wywołanie (`detectSessionLens`, model `OPENROUTER_SAFETY_MODEL`, strict JSON `{ lens }`, temperatura 0, limit 6 s, bez ponowień) uruchamiane w trasie wiadomości **równolegle** z klasyfikatorem bezpieczeństwa i tylko dopóki sesja nie ma soczewki. Nigdy nie rozszerza klasyfikatora bezpieczeństwa: jego zamknięty parser jest fail-closed dla każdej wiadomości, a soczewka ma być **fail-open** — każdy błąd, limit czasu czy zła odpowiedź to `outcome: "failed"` i tura bez soczewki. `detectSessionLens` nie rzuca.
- **Lepka na sesję**: pierwsza wykryta etykieta trafia do `therapy_sessions.session_lens` (`setOwnedSessionLens`: właściciel, sesja aktywna, kolumna jeszcze pusta) i obowiązuje do końca rozmowy; `none` nie jest zapisywane, więc następna tura próbuje ponownie. Nieudany zapis oznacza tylko ponowne wykrycie w następnej turze. Otwarcie sesji nigdy nie ma soczewki.
- **Flaga** `SESSION_LENS_MODE` (`off|on`, `session-flow/session-lens-mode.ts`, produkcja startuje z `off`) gasi wykrywanie i doklejanie, także dla sesji z zapisaną etykietą.
- **Prywatność**: etykieta mówi, o czym jest rozmowa. Nie trafia do logów (`session.lens_evaluated` niesie tylko wynik `detected|none|failed`, czas, dostawcę i liczniki jednostek), do widoku sesji dla klienta ani do agregatów operatora. Klasyfikator dostaje tę samą ograniczoną treść co bezpieczeństwo (bieżąca wiadomość i dwie ostatnie własne tury użytkownika) i jest uprzedzony, że tekst jest niezaufany.

## Testy

`__tests__/` pokrywa katalog (budżet i słownictwo modułów), prompt klasyfikatora, zamknięty parser, budowę żądania (schema strict, brak temperatury dla modeli OpenAI z serii gpt-5, minimalne rozumowanie dla Luny, routing `azure/eu`) i fail-open `detectSessionLens`. Trasa wiadomości ma własne scenariusze (`pages/api/session/__tests__/session-message-route.test.ts`), a `openrouter/__tests__/deployed-model-budgets.test.ts` przepuszcza wdrożony model przez builder soczewki.
