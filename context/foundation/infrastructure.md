---
project: SafeSpace
researched_at: 2026-05-30T19:34:25+02:00
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 SSR + React 19 islands
  runtime: Cloudflare Workers
  database: Supabase
---

## Rekomendacja

**Deploy na Cloudflare Workers.**

Cloudflare Workers jest najlepszym wyborem dla tego MVP, bo aktualny projekt jest już skonfigurowany pod `@astrojs/cloudflare`, `wrangler`, `nodejs_compat` i server-side rendering na Workers. Decyzję wzmacniają odpowiedzi z wywiadu: aplikacja nie wymaga persistent server-side connections, priorytetem jest DX, jeden region wystarczy, a zewnętrzni dostawcy jak Supabase i OpenRouter są akceptowalni. Alternatywy są sensowne, ale Vercel, Netlify, Railway, Render i Fly.io wymagają migracji adaptera Astro albo przejścia na runtime Node/container.

Źródła: [Cloudflare Astro guide](https://developers.cloudflare.com/workers/frameworks/framework-guides/astro/), [Astro Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/), [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/), [Cloudflare docs for agents](https://developers.cloudflare.com/style-guide/ai-tooling/).

## Porównanie Platform

| Platforma          | CLI-first | Managed/serverless | Agent-readable docs | Stabilne deploy API | MCP/integracja | Wynik   |
| ------------------ | --------- | ------------------ | ------------------- | ------------------- | -------------- | ------- |
| Cloudflare Workers | Pass      | Pass               | Pass                | Pass                | Pass           | 5.0 / 5 |
| Vercel             | Pass      | Pass               | Pass                | Pass                | Partial        | 4.5 / 5 |
| Netlify            | Pass      | Pass               | Pass                | Partial             | Pass           | 4.0 / 5 |
| Railway            | Pass      | Partial            | Pass                | Partial             | Partial        | 3.0 / 5 |
| Render             | Partial   | Partial            | Pass                | Partial             | Pass           | 3.0 / 5 |
| Fly.io             | Pass      | Partial            | Partial             | Partial             | Partial        | 2.5 / 5 |

**Cloudflare Workers** pasuje bez zmiany runtime. `npm run build` buduje aplikację Astro, a `npx wrangler deploy` publikuje Worker z assetami z `dist`. Koszt dla 10k-100k requestów miesięcznie powinien mieścić się w free tierze, o ile CPU i subrequesty pozostaną niskie. Rollback, logi i deploy są obsługiwane przez CLI.

**Vercel** ma bardzo dobre CLI, rollback i oficjalny MCP w statusie beta, ale wymaga wymiany `@astrojs/cloudflare` na `@astrojs/vercel`. Dla tego projektu oznacza to retest middleware, Supabase SSR cookies i API routes. Vercel jest mocnym runner-upem, ale nie wygrywa, bo nie jest zgodny z aktualnym starterem bez migracji.

**Netlify** ma agent-readable docs, Netlify MCP i dobre preview deploys. Astro 6 działa na Netlify, ale ten projekt musiałby przejść na `@astrojs/netlify`. Dodatkowym ryzykiem jest model kredytowy i obsługa runtime secrets przy Astro 6, gdzie należy unikać niekontrolowanego inline'owania sekretów przez `import.meta.env`.

**Railway** jest bardzo wygodnym PaaS dla Node apps i ma własny MCP, ale Astro SSR na Railway oznacza runtime Node, `@astrojs/node`, start command i stale działający service. To dobry wybór, gdy aplikacja będzie potrzebowała always-on backendu, ale obecny MVP tego nie wymaga.

**Render** jest stabilnym PaaS z web services, WebSockets, Postgres i API rollbackiem, ale dla Astro SSR wymaga Node adaptera oraz start command `node dist/server/entry.mjs`. W przypadku tego repo oznacza migrację z Workers na Node runtime.

**Fly.io** daje najwięcej kontroli i najlepsze wsparcie dla persistent processes, ale wymaga kontenera, `@astrojs/node` i osobnego modelu operacyjnego. Dla stateless Astro SSR MVP to większy narzut niż potrzeba.

### Shortlista

#### 1. Cloudflare Workers (rekomendowane)

Wygrywa, bo jest zgodne z aktualnym kodem i konfiguracją. Repo ma `@astrojs/cloudflare`, `wrangler.jsonc`, `main: "@astrojs/cloudflare/entrypoints/server"`, `compatibility_date: "2026-05-08"` i `nodejs_compat`. Platforma ma bardzo dobry CLI loop, tanie request-based pricing i agent-readable docs przez `llms.txt` oraz MCP servers.

#### 2. Vercel

Najsilniejsza alternatywa pod względem DX i rollbacków. Przegrywa z Cloudflare, bo wymaga migracji adaptera oraz retestu zachowania Astro middleware/auth. Dla komercyjnego MVP realnie trzeba zakładać plan Pro lub pilnować limitów Hobby.

#### 3. Netlify

Dobre preview deploys, agent tools i funkcje serverless. Przegrywa, bo wymaga migracji adaptera i ostrożności przy runtime env/secrets w Astro 6. Jest sensowna opcja, gdy zespół chce mocniej oprzeć się na Netlify Agent Runners i Netlify workflow.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate - Słabości

1. Cloudflare Workers nie jest pełnym Node.js. `nodejs_compat` pomaga, ale biblioteki AI, auth, logowania albo SDK zakładające pełne Node API mogą zawieść w buildzie lub runtime.
2. Sekrety są rozproszone pomiędzy `.dev.vars`, Wrangler secrets i GitHub Secrets. Źle skonfigurowany preview deploy może przez pomyłkę uderzać w produkcyjny Supabase albo OpenRouter.
3. Edge runtime i pojedynczy region bazy Supabase mogą dać niepotrzebną latencję, jeśli aplikacja zacznie obsługiwać użytkowników daleko od regionu bazy.
4. `wrangler rollback` cofa kod i konfigurację Workera, ale nie cofa migracji Supabase, zmian danych, złych summary sesji ani wycieków sekretów.
5. Produkt dotyczy wrażliwych rozmów psychologicznych. Nieostrożne logowanie requestów, promptów albo odpowiedzi AI byłoby incydentem prywatności, nawet jeśli infrastruktura działa poprawnie.

### Pre-Mortem - Jak To Może Się Nie Udać

Sześć miesięcy po starcie decyzja o Cloudflare okazała się problematyczna, bo zespół potraktował "Astro wspiera Cloudflare" jak "wszystkie paczki zachowują się jak na Node.js". Pierwszy MVP wdrożył się poprawnie, ale późniejsze AI streaming, summary i moderacja dodały biblioteki zależne od Node-only API. Lokalny flow nie wychwycił wszystkich problemów, bo sekrety preview i produkcji były niespójnie ustawione. Część preview deployów trafiała w produkcyjną bazę Supabase, a debug logs zapisały fragmenty prywatnych rozmów. Gdy wadliwy deploy wszedł na produkcję, `wrangler rollback` szybko przywrócił poprzedni Worker, ale migracja bazy i błędne podsumowania sesji zostały. Zespół musiał poświęcić tydzień na rozdzielenie środowisk, czyszczenie logów i wymianę niekompatybilnych bibliotek. Platforma nadal była dobra, ale porażka wynikła z niedoszacowania runtime constraints i operacji prywatności.

### Unknown Unknowns

- Astro 6 + `@astrojs/cloudflare` v13 ma nowszy model niż starsze poradniki Pages-era; instrukcje z `Astro.locals.runtime` albo starym `main: "./dist/_worker.js/index.js"` mogą być nieaktualne.
- Workers preview URLs i `wrangler` environments wymagają jawnej dyscypliny bindingów i sekretów. Preview nie jest automatycznie bezpiecznym stagingiem.
- AI streaming pasuje do request/response, ale trzeba przetestować czas odpowiedzi OpenRouter, CPU time, subrequest limits i zachowanie przerwania sesji.
- Logi i observability muszą być ustawione przed prawdziwymi użytkownikami, ale bez logowania treści rozmów.
- `wrangler.jsonc` powinien zachować nazwę Workera zgodną z projektem, np. `safespace`; przed deployem sprawdzić, że nie wróciła nazwa starterowa.

## Operational Story

- **Preview deploys**: dla PR/branchy używać Workers preview URLs albo `npx wrangler versions upload --preview-alias pr-<number>` po pierwszym deployu. Preview z prawdziwymi sekretami powinny być chronione Cloudflare Access albo ograniczone do zaufanych branchy; fork PR nie powinien dostawać produkcyjnych sekretów.
- **Secrets**: sekrety produkcyjne trzymać w Cloudflare Workers Secrets przez `npx wrangler secret put SUPABASE_URL`, `npx wrangler secret put SUPABASE_KEY` i `npx wrangler secret put OPENROUTER_API_KEY`. Lokalnie używać `.dev.vars` albo `.env`; wartości nie trafiają do repo. Rotacja to nadpisanie sekretu przez `wrangler secret put` i redeploy.
- **Rollback**: lista wersji przez `npx wrangler versions list`, rollback przez `npx wrangler rollback <VERSION_ID> --message "rollback <reason>"`. Cofnie Worker, ale nie cofnie migracji Supabase ani zmian danych.
- **Approval**: agent może czytać logi, uruchamiać build i tworzyć preview. Człowiek zatwierdza produkcyjny deploy, rotację głównych sekretów, migracje bazy i operacje kasujące dane.
- **Logs**: runtime logs czytać read-only przez `npx wrangler tail`; historię deployów przez `npx wrangler deployments list` i `npx wrangler versions list`. Logi aplikacyjne muszą maskować treść rozmów i tokeny.

## Risk Register

| Ryzyko                                                           | Źródło                              | Prawdopodobieństwo | Wpływ | Mitigacja                                                                                                                                                     |
| ---------------------------------------------------------------- | ----------------------------------- | -----------------: | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node-only dependency nie działa na Workers                       | Devil's advocate                    |                  M |     H | Przed dodaniem SDK sprawdzić kompatybilność z Workers; trzymać `npm run build` jako gate i unikać paczek wymagających `fs`, TCP sockets albo child processes. |
| Preview korzysta z produkcyjnych sekretów                        | Devil's advocate / Unknown unknowns |                  M |     H | Oddzielić sekrety staging/prod, nie udostępniać sekretów fork PR, opisać `wrangler` environments przed włączeniem auto-preview.                               |
| Rollback nie cofa bazy danych                                    | Devil's advocate / Pre-mortem       |                  M |     H | Migracje Supabase traktować osobno: forward-only, backup przed ryzykowną migracją, manual approval dla zmian schematu.                                        |
| Prywatne rozmowy trafiają do logów                               | Devil's advocate / Pre-mortem       |                  M |     H | Wprowadzić zasadę: logować request IDs, statusy i czasy, nigdy treść rozmów, promptów ani tokenów.                                                            |
| Latencja edge-to-Supabase pogarsza UX                            | Devil's advocate                    |                  L |     M | Wybrać region Supabase blisko głównych użytkowników; mierzyć p95 dla logowania, historii i AI session start.                                                  |
| Stare poradniki Astro/Cloudflare wprowadzają błędną konfigurację | Unknown unknowns                    |                  M |     M | Opierać się na aktualnych docs dla Astro 6 i `@astrojs/cloudflare` v13; nie kopiować starych `platformProxy`/Pages-era instrukcji.                            |
| AI streaming przekracza limity runtime albo subrequestów         | Unknown unknowns                    |                  M |     M | Zrobić test integracyjny z OpenRouter na realnym Workerze przed publicznym launch; ustawić timeout i graceful fallback UI.                                    |
| Nazwa Workera wraca do starterowej                               | Research finding                    |                  L |     L | Przed deployem sprawdzić, że `name` w `wrangler.jsonc` pozostaje `safespace`.                                                                                 |

## Getting Started

1. Sprawdzić, że `name` w `wrangler.jsonc` pozostaje ustawione na `safespace`.
2. Zalogować CLI: `npx wrangler login`.
3. Dodać sekrety produkcyjne: `npx wrangler secret put SUPABASE_URL`, `npx wrangler secret put SUPABASE_KEY` oraz `npx wrangler secret put OPENROUTER_API_KEY`.
4. Sprawdzić lokalny build zgodny z Astro/Cloudflare: `npm run build`.
5. Wdrożyć: `npx wrangler deploy`; po wdrożeniu sprawdzić logi przez `npx wrangler tail`.

## Out of Scope

Nie oceniano w tym dokumencie:

- konfiguracji Docker image,
- pełnej konfiguracji CI/CD,
- produkcyjnej architektury wysokiej dostępności, multi-region, DR i formalnych SLA,
- wdrożenia Supabase migrations,
- compliance dla danych medycznych lub dokumentacji prawnej dla produktu mental-health-adjacent.
