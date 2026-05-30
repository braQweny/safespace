# Plan pierwszego wdrozenia SafeSpace

## Podsumowanie

- Target: Cloudflare Workers na `workers.dev`, bez custom domain w tym etapie.
- Deploy: GitHub Actions auto-deploy po pushu albo merge do `main`.
- Baza i auth: istniejacy hosted Supabase project, bez migracji DB na tym etapie.
- Worker: `safespace`.
- Zrodla komend: Cloudflare Workers GitHub Actions, Wrangler secrets/deploy, `wrangler-action`.

## Rzeczy reczne przed deployem

- Potwierdzic, ze GitHub repo `braQweny/safespace` ma wlaczone Actions i uzywa branch `main`.
- W Cloudflare utworzyc albo wybrac konto, aktywowac Workers i ustawic `workers.dev` subdomain.
- Utworzyc Cloudflare API token scoped do tego konta z uprawnieniem do edycji Workers. Nie uzywac global API key.
- Przygotowac dane istniejacego Supabase projektu: Project URL i anon public key.
- Po pierwszym deployu dopisac finalny URL Workera w Supabase Auth jako Site URL / redirect URL, jesli email confirmation ma dzialac produkcyjnie.
- Nie konfigurowac teraz custom domain, OpenRouter ani Supabase migrations, bo obecny kod ich jeszcze nie uzywa.

## Konta, serwisy i sekrety

- Cloudflare: konto z Workers, `workers.dev`, automatycznie provisionowane bindingi Astro/Workers widoczne w dry-run: `ASSETS`, `SESSION` KV, `IMAGES`.
- GitHub: repository secrets dla workflow:
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_API_TOKEN`
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
- Supabase: istniejacy hosted project z wlaczonym Email/Password Auth.
- Nie dodawac teraz `SUPABASE_SERVICE_ROLE_KEY`; aplikacja go nie uzywa i nie powinien trafiac do runtime frontendowego SSR.
- `OPENROUTER_API_KEY` zostaje zaplanowany na przyszly milestone AI, nie jako sekret pierwszego deployu.

## Kroki automatyczne

- `wrangler.jsonc`:
  - `name` ustawione na `safespace`.
  - Worker target zostaje przez `main: "@astrojs/cloudflare/entrypoints/server"`.
  - Wymagane sekrety zadeklarowane jako `SUPABASE_URL` i `SUPABASE_KEY`.
- `.github/workflows/ci.yml`:
  - Trigger ustawiony na `main` dla push i pull request.
  - Job `ci` zachowuje `npm ci`, `npx astro sync`, lint i build.
  - Job `deploy` dziala tylko dla push do `main`, po przejsciu `ci`.
  - Deploy uzywa `cloudflare/wrangler-action@v3`, `wranglerVersion: "4.95.0"` i `deploy --secrets-file .env.production`.
  - `.env.production` jest tworzony tymczasowo z GitHub secrets i usuwany po deployu.
- Commit i push dopiero po potwierdzeniu, ze wymagane GitHub secrets sa ustawione.
- Po pushu sprawdzic workflow, URL Workera oraz redirect `/dashboard -> /auth/signin`.

## Komendy lokalnej weryfikacji

```bash
nvm use 22.14.0
npm ci
npm run lint
npm run build
npx wrangler deploy --dry-run
```

## Komendy deployu w GitHub Actions

```bash
printf 'SUPABASE_URL=%s\nSUPABASE_KEY=%s\n' "$SUPABASE_URL" "$SUPABASE_KEY" > .env.production
npx wrangler deploy --secrets-file .env.production
```

## Fallback lokalny

Tylko jesli GitHub Actions zawiedzie z powodu konfiguracji CI:

```bash
npx wrangler login
printf 'SUPABASE_URL=%s\nSUPABASE_KEY=%s\n' "$SUPABASE_URL" "$SUPABASE_KEY" > .env.production
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
- Brak `supabase/migrations`, wiec pierwszy deploy nie wykonuje migracji.
- `site` w `astro.config.mjs` zostaje poza zakresem do czasu wyboru finalnej domeny; warning sitemap nie blokuje deployu.
