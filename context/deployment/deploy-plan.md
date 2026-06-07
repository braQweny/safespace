# Plan pierwszego wdrozenia SafeSpace

## Podsumowanie

- Target: Cloudflare Workers na `workers.dev`, bez custom domain w tym etapie.
- Deploy: GitHub Actions auto-deploy po pushu albo merge do `main`.
- Baza i auth: istniejacy hosted Supabase project; pending migrations z `supabase/migrations/` sa wykonywane przed deployem Workera.
- F-01 `private-session-data-boundary` dodaje pending Supabase migrations dla prywatnych sesji, wiadomosci, podsumowan, tombstone deletion i trial claim; zostana wypchniete ta sama sciezka Session Pooler CI.
- Worker: `safespace`.
- Zrodla komend: Cloudflare Workers GitHub Actions, Wrangler secrets/deploy, `wrangler-action`.

## Rzeczy reczne przed deployem

- Potwierdzic, ze GitHub repo `braQweny/safespace` ma wlaczone Actions i uzywa branch `main`.
- W Cloudflare utworzyc albo wybrac konto, aktywowac Workers i ustawic `workers.dev` subdomain.
- Utworzyc Cloudflare API token scoped do tego konta z uprawnieniem do edycji Workers. Nie uzywac global API key.
- Przygotowac dane istniejacego Supabase projektu: Project URL, anon public key i connection string do migracji DB.
- Przygotowac owner-owned `OPENROUTER_API_KEY` dla F-02 safety boundary i S-04 zwyklych odpowiedzi sesji. Nie uzywac OpenRouter management key.
- Opcjonalnie przygotowac owner-owned `OPERATIONAL_LOG_HASH_SECRET`, jesli produkcyjne logi F-03 maja zawierac stabilny pseudonimiczny `userHash`; brak sekretu pomija korelacje uzytkownika.
- Po pierwszym deployu dopisac finalny URL Workera w Supabase Auth jako Site URL / redirect URL, jesli email confirmation ma dzialac produkcyjnie.
- Dla S-02 dopisac w Supabase Auth redirect URL `https://safespace.<workers-dev-subdomain>.workers.dev/auth/callback` i upewnic sie, ze Google Cloud OAuth client ma Supabase `Callback URL (for OAuth)` z dashboardu.
- Nie konfigurowac teraz custom domain. OpenRouter jest wymagany dla runtime granicy bezpieczenstwa F-02.

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
  - `OPENROUTER_API_KEY` - server-only sekret klasyfikatora bezpieczenstwa F-02 i zwyklych odpowiedzi S-04 przekazywany do Wranglera podczas deployu
  - `OPERATIONAL_LOG_HASH_SECRET` - opcjonalny server-only sekret F-03 dla pseudonimicznego `userHash` w logach operacyjnych
- Supabase: istniejacy hosted project z wlaczonym Email/Password Auth oraz Google providerem skonfigurowanym w Supabase Auth, bez sekretow Google w runtime aplikacji.
- Nie dodawac teraz `SUPABASE_SERVICE_ROLE_KEY`; aplikacja go nie uzywa i nie powinien trafiac do runtime frontendowego SSR.
- F-01 nie wymaga nowych runtime secretow poza istniejacymi `SUPABASE_URL` i `SUPABASE_KEY`; migracje nadal uzywaja `SUPABASE_DB_PASSWORD` albo `SUPABASE_DB_URL` w GitHub Actions.
- F-02 i S-04 wymagaja `OPENROUTER_API_KEY` w runtime Workera. Brak klucza powoduje fail-closed w `evaluateSessionSafety()` albo bezpieczny stan niedostepnosci zwyklej odpowiedzi sesji zamiast przepuszczac rozmowe bez klasyfikacji lub zapisywac sztuczna odpowiedz.
- `OPENROUTER_SAFETY_MODEL` jest opcjonalna konfiguracja bez sekretu. Domyslnie kod uzywa `openai/gpt-4o-mini`; override mozna wpisac lokalnie w `.env` / `.dev.vars`, ale nie jest wymagany w GitHub secrets.
- `OPENROUTER_SESSION_MODEL` jest opcjonalna konfiguracja bez sekretu dla zwyklych odpowiedzi S-04. Domyslnie kod uzywa `openai/gpt-4o-mini`; override mozna wpisac lokalnie w `.env` / `.dev.vars`, ale nie jest wymagany w GitHub secrets.
- F-03 opcjonalnie uzywa `OPERATIONAL_LOG_HASH_SECRET`. Brak sekretu nie blokuje zadnego requestu i nie moze powodowac logowania raw Supabase `user.id`; `userHash` jest wtedy pomijany.

## Kroki automatyczne

- `wrangler.jsonc`:
  - `name` ustawione na `safespace`.
  - Worker target zostaje przez `main: "@astrojs/cloudflare/entrypoints/server"`.
  - Wymagane sekrety zadeklarowane jako `SUPABASE_URL`, `SUPABASE_KEY` i `OPENROUTER_API_KEY`.
- `.github/workflows/ci.yml`:
  - Trigger ustawiony na `main` dla push i pull request.
  - Job `ci` zachowuje `npm ci`, `npm run test`, `npx astro sync`, lint i build.
  - Job `migrate` dziala tylko dla push do `main`, po przejsciu `ci`, buduje Session Pooler URL z `SUPABASE_DB_PASSWORD` i wykonuje `npx supabase db push`.
  - Job `deploy` dziala tylko dla push do `main`, po przejsciu `migrate`.
  - Deploy uzywa `cloudflare/wrangler-action@v3`, `wranglerVersion: "4.95.0"` i `deploy --secrets-file .env.production`.
  - `.env.production` jest tworzony tymczasowo z GitHub secrets (`SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY` oraz opcjonalnie `OPERATIONAL_LOG_HASH_SECRET`) i usuwany po deployu.
- Commit i push dopiero po potwierdzeniu, ze wymagane GitHub secrets sa ustawione.
- Po pushu sprawdzic workflow, URL Workera, redirect `/dashboard -> /auth/signin` oraz callback `/auth/callback` dodany do Supabase Auth Redirect URLs.
- Gdy hosted Supabase migration F-01 zostanie faktycznie zastosowana, zapisac date, srodowisko, komende i wynik w `context/changes/private-session-data-boundary/verification.md`; bez tego nie oznaczac hosted migration evidence jako potwierdzone.

## Komendy lokalnej weryfikacji

```bash
nvm use 22.14.0
npm ci
npm run lint
npm run test
npm run build
npx wrangler deploy --dry-run
```

## Komendy deployu w GitHub Actions

```bash
npx supabase db push --db-url "$SUPABASE_MIGRATION_DB_URL" --yes
{
  printf 'SUPABASE_URL=%s\n' "$SUPABASE_URL"
  printf 'SUPABASE_KEY=%s\n' "$SUPABASE_KEY"
  printf 'OPENROUTER_API_KEY=%s\n' "$OPENROUTER_API_KEY"
  if [ -n "$OPERATIONAL_LOG_HASH_SECRET" ]; then
    printf 'OPERATIONAL_LOG_HASH_SECRET=%s\n' "$OPERATIONAL_LOG_HASH_SECRET"
  fi
} > .env.production
npx wrangler deploy --secrets-file .env.production
```

## Fallback lokalny

Tylko jesli GitHub Actions zawiedzie z powodu konfiguracji CI:

```bash
npx wrangler login
npx supabase db push --db-url "$SUPABASE_MIGRATION_DB_URL" --yes
{
  printf 'SUPABASE_URL=%s\n' "$SUPABASE_URL"
  printf 'SUPABASE_KEY=%s\n' "$SUPABASE_KEY"
  printf 'OPENROUTER_API_KEY=%s\n' "$OPENROUTER_API_KEY"
  if [ -n "$OPERATIONAL_LOG_HASH_SECRET" ]; then
    printf 'OPERATIONAL_LOG_HASH_SECRET=%s\n' "$OPERATIONAL_LOG_HASH_SECRET"
  fi
} > .env.production
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
