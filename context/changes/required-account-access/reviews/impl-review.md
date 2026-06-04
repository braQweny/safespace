<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: wymagany dostęp do konta

- **Plan**: `context/changes/required-account-access/plan.md`
- **Zakres**: fazy 1-5 z 5
- **Data**: 2026-06-04
- **Werdykt**: NEEDS ATTENTION
- **Ustalenia**: 0 krytycznych, 3 ostrzeżenia, 0 obserwacji

## Notatki o zakresie

Zakres review był ograniczony do implementacji `required-account-access`. W HEAD są już późniejsze commity S-03 (`modality-avatar-choice`) oraz S-01, ale nie zostały policzone jako dryf tej zmiany, bo weszły pod osobnymi change ID po zamknięciu `required-account-access`.

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | WARNING |

## Ustalenia

### F1 — Strony auth ufają dowolnemu tekstowi z `?error=`

- **Waga**: WARNING
- **Wpływ**: MEDIUM — realny kompromis; warto zatrzymać się i przemyśleć decyzję
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/pages/auth/signin.astro:6`
- **Szczegóły**: `signin.astro` i `signup.astro` czytają `Astro.url.searchParams.get("error")` i przekazują wartość bezpośrednio do `ServerError`. React escapuje tekst, więc nie jest to XSS, ale każdy może podlinkować `/auth/signin?error=...` i wyświetlić dowolny komunikat wyglądający jak błąd aplikacji na wrażliwej stronie logowania. Route'y API używają bezpiecznych komunikatów, ale granica strony nie sprawdza, co renderuje.
- **Poprawka A (zalecana)**: Przekazywać w URL stabilne kody błędów i mapować je na treść podczas renderowania.
  - Siła: Usuwa wstrzykiwanie dowolnego komunikatu i pasuje do kontraktu bezpiecznych błędów.
  - Kompromis: Dotyka helperów auth error oraz konsumentów błędów na signin/signup/password.
  - Pewność: HIGH — obecne route'y już centralizują kategorie błędów w `auth-errors.ts`.
  - Martwy punkt: Istniejące zewnętrzne linki z tekstowym `error=` przestałyby pokazywać komunikat.
- **Poprawka B**: Zostawić komunikaty w URL, ale renderować tylko wartości ze znanej allow-listy.
  - Siła: Mniejsza poprawka.
  - Kompromis: Zostawia user-facing copy w URL i sprzęga walidację strony z dokładnym brzmieniem tekstu.
  - Pewność: MEDIUM — mniej inwazyjne, ale słabsze jako długoterminowy kontrakt.
  - Martwy punkt: Przyszłe zmiany copy mogą przypadkiem rozjechać allow-listę.
- **Decision**: FIXED — zastosowano Poprawkę A. `getAuthErrorRedirect()` zapisuje stabilny kod błędu w `?error=`, a `signin.astro`, `signup.astro` i `account/security.astro` mapują znane kody na bezpieczną treść przed renderowaniem. Zweryfikowano `npx astro sync` i `npm run lint`.

### F2 — Wylogowanie używa domyślnego zakresu globalnego i ignoruje błędy

- **Waga**: WARNING
- **Wpływ**: MEDIUM — realny kompromis; warto zatrzymać się i przemyśleć decyzję
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/pages/api/auth/signout.ts:7`
- **Szczegóły**: Route czeka na `supabase.auth.signOut()`, ale ignoruje `{ error }` i zawsze przekierowuje na `/`. Supabase Auth domyślnie robi global sign-out; jeśli sieciowe odwołanie tokenów zwróci nieignorowany błąd, biblioteka kończy działanie przed usunięciem lokalnej sesji. UI może więc sugerować wylogowanie, mimo że cookies mogą pozostać.
- **Poprawka A (zalecana)**: Użyć `signOut({ scope: "local" })`, sprawdzić `{ error }` i traktować redirect jako sukces dopiero po lokalnym czyszczeniu.
  - Siła: Czyści sesję w aktualnej przeglądarce bez efektu ubocznego na innych urządzeniach.
  - Kompromis: Inne urządzenia pozostają zalogowane.
  - Pewność: HIGH — zainstalowane `@supabase/auth-js` dokumentuje local scope jako typowe zachowanie przycisku wylogowania.
  - Martwy punkt: Produkt może celowo chcieć "wyloguj wszędzie", ale UI tego nie komunikuje.
- **Poprawka B**: Zostawić global sign-out, ale obsłużyć błędy przed przekierowaniem jak po sukcesie.
  - Siła: Zachowuje semantykę odwołania sesji na wszystkich urządzeniach.
  - Kompromis: Wylogowanie zależy od zewnętrznego revoke call i może zaskoczyć osoby zalogowane na innych urządzeniach.
  - Pewność: MEDIUM — działa, jeśli global logout jest oczekiwany.
  - Martwy punkt: Potrzebny jest destination, który bezpiecznie pokaże błąd wylogowania.
- **Decision**: FIXED — zastosowano Poprawkę A. Endpoint signout używa `supabase.auth.signOut({ scope: "local" })`, sprawdza `{ error }` i przekierowuje przez bezpieczny kod `signout_failed` dopiero przy błędzie; sukces zwraca redirect `303` na `/`. Zweryfikowano `npx astro sync` i `npm run lint`.

### F3 — Ręczne checki OAuth/production są oznaczone jako wykonane bez dołączonego dowodu

- **Waga**: WARNING
- **Wpływ**: MEDIUM — realny kompromis; warto zatrzymać się i przemyśleć decyzję
- **Wymiar**: Kryteria sukcesu
- **Lokalizacja**: `context/changes/required-account-access/plan.md:521`
- **Szczegóły**: Faza 5 oznacza callback Google OAuth oraz production/preview redirect checks jako wykonane, ale commit zamykający tylko przestawia checkboxy w `plan.md`; w folderze zmiany nie ma notatki weryfikacyjnej, URL-a, środowiska ani dowodu konfiguracji providera. Lokalna konfiguracja providera Google nadal ma `skip_nonce_check = false` w `supabase/config.toml:330`, a wygenerowany komentarz configu mówi, że lokalne logowanie Google może wymagać włączenia tej opcji.
- **Poprawka**: Dodać artefakt z notatkami weryfikacyjnymi i konkretnym dowodem manualnym albo oznaczyć te checkboxy jako pending do czasu ponownego uruchomienia; zaktualizować lokalny checklist/config Google, jeśli lokalne CLI OAuth jest częścią dowodu.
  - Siła: Sprawia, że zewnętrzne twierdzenia OAuth/production będą audytowalne w przyszłych review.
  - Kompromis: Wymaga ponownego uruchomienia lub odtworzenia manualnych checków z oryginalnego środowiska.
  - Pewność: HIGH — obecny dowód w repo to tylko diff checkboxów.
  - Martwy punkt: Manualny dowód może istnieć poza repo.
- **Decision**: SKIPPED — świadomie pominięte w triage. Plan i artefakty weryfikacyjne pozostają bez zmian.

## Automatyczna weryfikacja

| Komenda / check | Wynik | Notatki |
|-----------------|--------|-------|
| `npx astro sync` | PASS | Zakończone; wygenerowano typy. |
| `npm run lint` | PASS | Zakończone tylko z istniejącymi ostrzeżeniami `astro-eslint-parser`. |
| `npm run build` | PASS | Zakończone z nieblokującymi ostrzeżeniami CSS minify i sitemap. |
| `git diff --check` | PASS | Brak błędów whitespace. |
| `rg -n "provider:\s*\"google\"" src` | PASS | Dokładnie jeden kontrakt providera w `src/lib/auth-providers.ts`. |
| `rg -n "Sign in|Sign up|Creating account|Password is required" src/pages/auth src/components/auth` | PASS | Brak dopasowań do publicznego starterowego copy auth. |
| `rg -n "(SUPABASE_SERVICE_ROLE_KEY|GOOGLE_[A-Z_]*SECRET|CLIENT_SECRET)\s*=" --glob '!context/changes/**' .` | PASS | Brak dopasowań do commitowanego runtime secret assignment z wyszukiwania w planie. |

## Sprawdzone dowody

- Progress planu pokazywał wszystkie pięć faz jako wykonane: `context/changes/required-account-access/plan.md`.
- Status `change.md` przed zapisem tego raportu był `implemented`, z datą aktualizacji `2026-05-31`.
- Historia git dla tej zmiany obejmowała `626756f`, `ce298ce`, `cee9821`, `da88619`, `9ab0ad8`, `4f41ead` i `35c6e9f`.
- Późniejsze zmiany S-03 i password-management były widoczne w HEAD, ale nie zostały policzone jako dryf S-02, bo weszły po closeout S-02.
