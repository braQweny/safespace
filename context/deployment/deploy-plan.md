# Plan pierwszego wdrozenia SafeSpace

## Podsumowanie

- Target: Cloudflare Workers na `workers.dev`, bez custom domain w tym etapie.
- Deploy: GitHub Actions auto-deploy po pushu albo merge do `main`.
- Baza i auth: istniejacy hosted Supabase project; pending migrations z `supabase/migrations/` sa wykonywane przed deployem Workera.
- F-01 `private-session-data-boundary` dodaje pending Supabase migrations dla prywatnych sesji, wiadomosci, podsumowan, tombstone deletion i trial claim; zostana wypchniete ta sama sciezka Session Pooler CI.
- Worker: `safespace`.
- Zrodla komend: Cloudflare Workers GitHub Actions, Wrangler secrets/deploy, `wrangler-action`.

## Dostawca AI

`wrangler.jsonc` wybiera `AI_PROVIDER=openai`; powrót do OpenRouter wymaga `AI_PROVIDER=openrouter`. Ustawienia modeli i rozumowania pozostają w dotychczasowych zmiennych `OPENROUTER_*`. Lokalnie dodaj wybrany klucz do `.env` i `.dev.vars`. Nowy klucz OpenAI należy uzupełnić osobno w GitHub Secrets; zmiana kodu nie jest wdrożeniem ani potwierdzeniem dostępu do modeli. Retencję i ZDR OpenAI należy sprawdzić na koncie — `store: false` nie zastępuje tych ustawień. [Szczegóły](../../src/lib/ai-provider/README.md).

## Rzeczy reczne przed deployem

- Potwierdzic, ze GitHub repo `braQweny/safespace` ma wlaczone Actions i uzywa branch `main`.
- W Cloudflare utworzyc albo wybrac konto, aktywowac Workers i ustawic `workers.dev` subdomain.
- Utworzyc Cloudflare API token scoped do tego konta z uprawnieniem do edycji Workers. Nie uzywac global API key.
- Przygotowac dane istniejacego Supabase projektu: Project URL, anon public key i connection string do migracji DB.
- Przygotować `OPENAI_API_KEY` dla domyślnego `AI_PROVIDER=openai`. Zachować `OPENROUTER_API_KEY` do powrotu przez `AI_PROVIDER=openrouter`. Klucze są niezależne.
- Opcjonalnie przygotowac owner-owned `OPERATIONAL_LOG_HASH_SECRET`, jesli produkcyjne logi F-03 maja zawierac stabilny pseudonimiczny `userHash`; brak sekretu pomija korelacje uzytkownika.
- Po pierwszym deployu dopisac finalny URL Workera w Supabase Auth jako Site URL / redirect URL, jesli email confirmation ma dzialac produkcyjnie.
- Dla S-02 dopisac w Supabase Auth redirect URL `https://safespace.<workers-dev-subdomain>.workers.dev/auth/callback` i upewnic sie, ze Google Cloud OAuth client ma Supabase `Callback URL (for OAuth)` z dashboardu.
- Nie konfigurowac teraz custom domain. Wybrany dostawca AI jest wymagany dla granicy bezpieczeństwa F-02.

## Konta, serwisy i sekrety

- Cloudflare: konto z Workers, `workers.dev`, automatycznie provisionowane bindingi Astro/Workers widoczne w dry-run: `ASSETS`, `SESSION` KV, `IMAGES`.
- GitHub: repository secrets dla workflow:
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_API_TOKEN`
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
  - `SUPABASE_DB_PASSWORD` - haslo bazy do zbudowania Session Pooler migration URL
  - `SUPABASE_DB_URL` - opcjonalny fallback jako pelny connection string; uzywac Session Pooler URL z URL-encoded password
  - `SUPABASE_DB_POOLER_HOST` - opcjonalny override, jesli Supabase pokazuje inny host niz `aws-0-eu-west-1.pooler.supabase.com`
  - `OPENAI_API_KEY` — wymagany serwerowy klucz dla domyślnego OpenAI
  - `OPENROUTER_API_KEY` — zachowany alternatywny klucz, wymagany tylko przy `AI_PROVIDER=openrouter`
  - `OPERATIONAL_LOG_HASH_SECRET` - opcjonalny server-only sekret F-03 dla pseudonimicznego `userHash` w logach operacyjnych
- Supabase: istniejacy hosted project z wlaczonym Email/Password Auth oraz Google providerem skonfigurowanym w Supabase Auth, bez sekretow Google w runtime aplikacji.
- Nie dodawac teraz `SUPABASE_SERVICE_ROLE_KEY`; aplikacja go nie uzywa i nie powinien trafiac do runtime frontendowego SSR.
- F-01 nie wymaga nowych runtime secretow poza istniejacymi `SUPABASE_URL` i `SUPABASE_KEY`; migracje nadal uzywaja `SUPABASE_DB_PASSWORD` albo `SUPABASE_DB_URL` w GitHub Actions.
- F-02 i S-04 wymagają klucza wybranego dostawcy w runtime Workera. Brak klucza powoduje fail-closed w `evaluateSessionSafety()` albo bezpieczny stan niedostepnosci zwyklej odpowiedzi sesji zamiast przepuszczac rozmowe bez klasyfikacji lub zapisywac sztuczna odpowiedz.
- `OPENROUTER_SAFETY_MODEL` jest opcjonalna konfiguracja bez sekretu. Domyslnie kod uzywa `openai/gpt-4o-mini`; override mozna wpisac lokalnie w `.env` / `.dev.vars`, ale nie jest wymagany w GitHub secrets.
- `OPENROUTER_SESSION_MODEL` jest opcjonalna konfiguracja bez sekretu dla zwyklych odpowiedzi S-04. Domyslnie kod uzywa `openai/gpt-4o-mini`; override mozna wpisac lokalnie w `.env` / `.dev.vars`, ale nie jest wymagany w GitHub secrets.
- F-03 opcjonalnie uzywa `OPERATIONAL_LOG_HASH_SECRET`. Brak sekretu nie blokuje zadnego requestu i nie moze powodowac logowania raw Supabase `user.id`; `userHash` jest wtedy pomijany.
- Stripe Managed Payments na tym etapie obejmuje wyłącznie lokalny sandbox. Produkcyjny `wrangler.jsonc` zachowuje `BILLING_MODE=off` i sekrety wymagane przez wybranego dostawcę; nie dodawać kluczy testowych Stripe ani połączenia billingowego do GitHub/Cloudflare. Aktywacja płatności i konfiguracja ich przyszłego wdrożenia są osobnym zakresem. Lokalna procedura: `npm run build` → `npm run dev:billing`, ignorowany plik `.dev.vars.billing`; szczegóły w `src/lib/billing/README.md`.
- S-07 admin nie dodaje nowych runtime secretow ani `SUPABASE_SERVICE_ROLE_KEY`. Pierwszego admina owner provisionuje recznym SQL po utworzeniu konta:

```sql
insert into public.admin_users (user_id, is_active)
values ('<auth.users.id>', true)
on conflict (user_id) do update
set is_active = true, deactivated_at = null;
```

- S-07 nie dodaje eksportow CSV/JSON, user deletion, password reset, trial reset, raw operational log browser ani legal/safety break-glass content access.

## Kroki automatyczne

- `wrangler.jsonc`:
  - `name` ustawione na `safespace`.
  - Worker target zostaje przez `main: "@astrojs/cloudflare/entrypoints/server"`.
  - Wymagane `SUPABASE_URL`, `SUPABASE_KEY` i klucz wybranego dostawcy sprawdza `scripts/write-production-secrets.mjs` przed migracjami. Nie ustawiamy `secrets.required`, aby lokalnie nie odfiltrować klucza alternatywnego dostawcy.
- `.github/workflows/ci.yml`:
  - Trigger ustawiony na `main` dla push i pull request.
  - Job `ci` wykonuje audyt, Vitest, testy migracji/RLS/wyścigów w izolowanym PostgreSQL, Astro sync, lint, TypeScript, Astro check, build i test Chromium z produkcyjnym CSP.
  - Build w `ci` używa testowych `SUPABASE_URL=https://example.supabase.co` i `SUPABASE_KEY=test-public-key`, zgodnych z izolowanym preview E2E. Działa również dla PR-ów Dependabota i forków bez sekretów. Ten artefakt nie jest publikowany; job `deploy` buduje osobno z prawdziwą konfiguracją Supabase.
  - Jeden job `deploy`, tylko po push do `main` i przejściu `ci`, sprawdza aktualność commita, buduje aplikację, wykonuje `npx supabase db push` przez Session Pooler i publikuje Workera.
  - Blokada `deploy-main` obejmuje cały job (`queue: max`, `cancel-in-progress: false`). Nie rozdzielać migracji i publikacji na joby z osobnymi blokadami. Nieaktualny commit zostaje odrzucony przed zmianami produkcyjnymi.
  - Deploy używa `cloudflare/wrangler-action@v3`, `wranglerVersion: "4.126.0"` i `deploy --secrets-file .env.production`.
  - Migracja `20260904204248` dodaje integralność cyklu sesji i prywatne potwierdzenia tur bez nowych sekretów. Zachowuje zapis wiadomości ze starego Workera; nowe triggery sprawdzają status, termin i usunięcie. Migracja musi wejść przed kodem używającym nowych RPC.
  - Migracja `20260905075745` dodaje `get_avatar_memory_batch` i `save_avatar_memory_batch`: jedna generacja pamięci może objąć wiele rozmów do wspólnego budżetu tekstu. Stare RPC pamięci pozostają dostępne i dzielą postęp z nowymi, więc starszy Worker działa podczas wdrożenia. Migracja musi wejść przed nowym Workerem; nie ma nowych zmiennych ani sekretów.
  - Migracja `20260905175333` dodaje rozliczenia, widoki właścicielskie, niezależne opłacone premium i bramkę anulowania abonamentu przed usunięciem konta. Jest kompatybilna z dotychczasowym kodem, przy pustych danych billingowych nie zmienia ręcznego premium ani limitów. Nie tworzy loginu z hasłem i nie aktywuje płatności. Jeśli ten kod będzie wdrażany, migracja musi poprzedzać Worker czytający nowe widoki; blokada migracje + publikacja pozostaje wspólna. Obecny etap weryfikacji lokalnej nie wykonuje wdrożenia ani zmian sekretów produkcyjnych.
  - `.env.production` jest tworzony tymczasowo z GitHub secrets (`SUPABASE_URL`, `SUPABASE_KEY`, dostępne `OPENAI_API_KEY` i `OPENROUTER_API_KEY` oraz opcjonalnie `OPERATIONAL_LOG_HASH_SECRET`) i usuwany po deployu.
- Commit i push dopiero po potwierdzeniu, ze wymagane GitHub secrets sa ustawione.
- Po pushu sprawdzic workflow, URL Workera, redirect `/dashboard -> /auth/signin` oraz callback `/auth/callback` dodany do Supabase Auth Redirect URLs.
- Gdy hosted Supabase migration F-01 zostanie faktycznie zastosowana, zapisac date, srodowisko, komende i wynik w `context/changes/private-session-data-boundary/verification.md`; bez tego nie oznaczac hosted migration evidence jako potwierdzone.

## Komendy lokalnej weryfikacji

```bash
nvm use
npm ci
npm run lint
npm run test
npm run test:db
npm run typecheck
npm run check:astro
npm run build
npx playwright install chromium
npm run test:e2e
npx wrangler deploy --dry-run
```

## Komendy deployu w GitHub Actions

```bash
node scripts/write-production-secrets.mjs
npx supabase db push --db-url "$SUPABASE_MIGRATION_DB_URL" --yes
npx wrangler deploy --secrets-file .env.production
```

## Fallback lokalny

Tylko jesli GitHub Actions zawiedzie z powodu konfiguracji CI:

```bash
npx wrangler login
node scripts/write-production-secrets.mjs
npx supabase db push --db-url "$SUPABASE_MIGRATION_DB_URL" --yes
npx wrangler deploy --secrets-file .env.production
rm .env.production
```

## Weryfikacja po deployu

```bash
curl -I https://safespace.<workers-dev-subdomain>.workers.dev/
curl -I https://safespace.<workers-dev-subdomain>.workers.dev/auth/signin
curl -I https://safespace.<workers-dev-subdomain>.workers.dev/dashboard
npx wrangler deployments list --name safespace
npx wrangler versions list --name safespace
```

## Zalozenia

- Branch produkcyjny to `main`, bo lokalnie i na `origin` nie ma `master`.
- Deploy na `main` wykonuje wszystkie pending migrations z `supabase/migrations/` przed wdrozeniem Workera.
- `site` w `astro.config.mjs` zostaje poza zakresem do czasu wyboru finalnej domeny; warning sitemap nie blokuje deployu.
