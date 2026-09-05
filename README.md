# SafeSpace

SafeSpace is a mental-health / therapy-simulation web app. A user picks a therapeutic modality (a "perspective" represented by an avatar) and runs a time-limited AI chat session in the browser. Conversations are private by design: the architecture is built around a **privacy boundary** that keeps raw conversation content out of logs, admin surfaces, and unbounded context reuse. The product is a simulation and an educational aid, not a replacement for a therapist — a crisis classifier interrupts the session and points to real help when needed.

The UI is available in English (default) and Polish; the choice is stored in a cookie and, for signed-in users, on the account (`user_preferences`). Every user-facing string lives in a locale copy module (`*-copy.ts`), never inline in JSX/Astro. Contributor guidance for AI agents lives in `CLAUDE.md` (architecture, boundaries) and `AGENTS.md` (conventions, 10xDevs toolkit).

## Tech Stack

- [Astro](https://astro.build/) v7 - SSR (`output: "server"`) with server-first rendering
- [React](https://react.dev/) v19 - interactive islands only
- [TypeScript](https://www.typescriptlang.org/) v5 - type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 + [shadcn/ui](https://ui.shadcn.com/) - styling and UI primitives
- [Supabase](https://supabase.com/) - authentication and private application tables (RLS everywhere)
- [OpenRouter](https://openrouter.ai/) - AI provider for safety classification, session replies, summaries, and voice transcription
- [Cloudflare Workers](https://workers.cloudflare.com/) - edge deployment runtime
- [Vitest](https://vitest.dev/) - unit tests

## Prerequisites

- Node.js v22.23.2 (pinned in `.nvmrc`; `package.json` requires `>=22.19.0`)
- npm (comes with Node.js)
- Docker (for the local Supabase stack and disposable PostgreSQL integration tests)

## Getting Started

1. Install dependencies:

```bash
nvm use
npm install
```

2. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below. `.env` is read by Node tooling (build, tests), `.dev.vars` by the Cloudflare local dev server; both are gitignored:

```bash
cp .env.example .env
cp .env.example .dev.vars
```

3. Add the OpenRouter runtime key to `.env` and `.dev.vars` when working on AI session flows — see [AI Runtime Configuration](#ai-runtime-configuration).

4. Run the development server:

```bash
npm run dev
```

Note that Astro emits the Content Security Policy only in production builds — `astro dev` sends no policy, so CSP regressions are invisible in dev. Use `npm run build && npm run preview` to check them.

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production (requires `SUPABASE_URL` — the build-time CSP needs the Supabase origin and fails fast without it)
- `npm run preview` - Preview production build
- `npm run test` - Run Vitest once (unit tests in `__tests__/` folders next to the code)
- `npm run test:watch` - Run Vitest in watch mode
- `npm run test:db` - Apply all migrations to a disposable PostgreSQL 17 container and verify RLS, lifecycle, idempotency and concurrent writes; requires Docker, never uses project credentials
- `npm run test:e2e` - Verify production CSP and sign-in hydration in Chromium after `npm run build`; install the browser once with `npx playwright install chromium`
- `npm run typecheck` - `tsc --noEmit`
- `npm run check:astro` - Type-check Astro templates as well
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm run audit:prod` - `npm audit` for production dependencies at `high` severity or above (first CI step)

Pre-commit (husky + lint-staged) runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Project Structure

```text
.
├── src/
│   ├── layouts/                 # Astro layouts (the inline theme script is hashed into the CSP at build time)
│   ├── pages/                   # Server-rendered Astro pages: /, /auth/*, /dashboard, /dashboard/session,
│   │   │                        #   /dashboard/avatar, /account/*, /admin/*, /privacy, 404
│   │   └── api/                 # API routes (auth, profile, session, admin) — uppercase method exports
│   ├── components/              # Astro components + React islands (admin, auth, modality, session, hooks, ui = shadcn/ui)
│   ├── lib/                     # Server-side subsystems (see below)
│   ├── styles/                  # Tailwind 4 global styles
│   └── middleware.ts            # Request lifecycle: requestId, body-size cap, Supabase user, rate limit,
│                                #   route protection + account access, security headers
├── public/                      # Static assets (avatar images, favicon, robots.txt)
├── supabase/
│   ├── config.toml              # Local Supabase stack configuration
│   └── migrations/              # SQL migrations (RLS on every table; applied by CI before each deploy)
├── context/                     # Product docs (foundation/prd.md, roadmap) and per-change plans
├── astro.config.mjs             # SSR, env schema, build-time CSP
├── wrangler.jsonc               # Cloudflare Workers config (required secrets, model vars, rate limiter)
└── .github/workflows/ci.yml     # CI, migrations, deploy
```

### `src/lib/` subsystems

Several directories carry a `README.md` that is the authoritative contract for that boundary — read it before touching the code.

- `session-data/` - Owner-bound repository over the private tables (`therapy_sessions`, `session_messages`, `session_summaries`, `session_trial_claims`); the only sanctioned way to read or write conversation data.
- `session-safety/` - `evaluateSessionSafety()`: the OpenRouter crisis classifier that gates every session turn and fails closed.
- `session-ai/` - `generateSessionResponse()`: ordinary session replies, prompt, and OpenRouter request parameters.
- `session-summary/` - User-visible session summaries that back a "next session with context".
- `session-transcription/` - Voice-message transcription behind `POST /api/session/transcribe`.
- `session-flow/` - State machines, request/response contracts, time-limit and session-phase math, persistence glue used by the routes.
- `operational-visibility/` - The only sanctioned logging path (`logOperationalEvent()` + allowlist sanitizer); never `console.log`.
- `admin/` - Admin identity, account access/blocking, account plans, and content-free aggregates.
- `openrouter/` - Shared OpenRouter SDK client, model/env resolution, and private provider routing preferences.
- `security/` - Build-time CSP helpers (`csp.mjs`) used by `astro.config.mjs`.
- `modalities.ts` - Modality + avatar catalog; `supabase.ts` - cookie-based SSR client; `rate-limit.ts` - per-user limiter for AI-backed endpoints; `support-contact.ts` - public contact address.

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication and application tables. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM. The local stack configuration (`supabase/config.toml`) is committed, so there is no need to run `supabase init`.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Start the local stack (downloads Docker images on first run and applies `supabase/migrations/`):

```bash
npx supabase start
```

3. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

4. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

Database migrations live in `supabase/migrations/` (`YYYYMMDDHHmmss_short_description.sql`). Every new table must enable RLS with granular per-operation, per-role policies. Hosted deployments push pending migrations with `npx supabase db push` before the Cloudflare Worker is deployed, so every migration must be backward-compatible with the currently deployed code (expand before you contract).

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                   | Description                                                               |
| ----------------------- | ------------------------------------------------------------------------- |
| `/auth/signin`          | Email/password sign-in form with "Kontynuuj z Google"                     |
| `/auth/signup`          | Email/password sign-up form                                               |
| `/auth/confirm-email`   | Post-signup "check your inbox" page                                       |
| `/auth/forgot-password` | Password reset request                                                    |
| `/auth/callback`        | Supabase OAuth callback (Google sign-in code exchange)                    |
| `/dashboard`            | Protected home: start a session, saved perspective, conversation history  |
| `/account`              | Protected account page (redirects to `/account/security`)                 |
| `/admin`                | Protected admin panel (additionally requires an active `admin_users` row) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication; protected routes also check account access and send blocked accounts to `/account/blocked`.

Google sign-in is a form-triggered redirect chain (app → Supabase → Google), so the production CSP `form-action` directive must list the Supabase origin. That origin is read from `SUPABASE_URL` at build time, which is why `npm run build` refuses to run without it.

### Admin setup

S-07 adds `/admin` and `/admin/users` for product statistics and user blocking. Admin identity is stored in the application table `admin_users`; the app does not use a runtime `SUPABASE_SERVICE_ROLE_KEY` and does not expose an endpoint for creating the first admin.

Provision the first admin with owner-controlled SQL in Supabase after the target user exists:

```sql
insert into public.admin_users (user_id, is_active)
values ('<auth.users.id>', true)
on conflict (user_id) do update
set is_active = true, deactivated_at = null;
```

The admin MVP has no CSV/JSON exports, no user deletion, no password reset, no trial reset, no legal/safety break-glass content access, and no admin-readable private conversation content.

### Account plans (free vs premium)

Every account is either `free` or `premium`. A free account may own at most **3 sessions in total** (every session row counts — any status, deleted ones included); premium accounts are not capped. The cap is enforced by a database trigger on `therapy_sessions` inserts, so it cannot be bypassed from the client. The plan also sets the length of a single session: 15 minutes for free, 60 minutes for premium, pinned when the session starts.

There is no payment integration yet. Premium is granted or revoked by an active admin in `/admin/users` ("Nadaj premium" / "Odbierz premium", audited as `premium_granted` / `premium_revoked`), or with owner-controlled SQL:

```sql
-- grant
update public.admin_user_profiles
set premium_granted_at = now(), premium_granted_by = null
where user_id = '<auth.users.id>';

-- revoke
update public.admin_user_profiles
set premium_granted_at = null, premium_granted_by = null
where user_id = '<auth.users.id>';
```

## AI Runtime Configuration

F-02 adds a server-only safety boundary for AI sessions. `evaluateSessionSafety()` calls OpenRouter before any ordinary AI generation and fails closed when the key is missing or the provider response is invalid.

S-04 adds a separate server-only ordinary response helper under `src/lib/session-ai/`. It reuses the same OpenRouter runtime key, keeps ordinary replies separate from the safety classifier, and returns safe retry/unavailable states instead of fake assistant messages when the provider fails. Summaries (`src/lib/session-summary/`) and voice transcription (`src/lib/session-transcription/`) use the same key with their own model settings.

Add these variables to local `.env` and `.dev.vars` files:

| Variable                              | Description                                                                                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`                  | Server-only OpenRouter API key used by the safety classifier, session responses, summaries, and transcription                                                                             |
| `OPENROUTER_SAFETY_MODEL`             | Optional safety classifier model override; the in-code default is `openai/gpt-4o-mini` when empty                                                                                         |
| `OPENROUTER_SESSION_MODEL`            | Optional session response model override; the in-code default is `openai/gpt-4o-mini` when empty                                                                                          |
| `OPENROUTER_SESSION_REASONING_EFFORT` | Optional reasoning effort for session responses (`minimal`, `low`, `medium`, `high`, `xhigh`); empty keeps the model default, `high`/`xhigh` also raise the completion budget and timeout |
| `OPENROUTER_SUMMARY_MODEL`            | Optional summary model override; falls back to the session model                                                                                                                          |
| `OPENROUTER_TRANSCRIPTION_MODEL`      | Optional voice transcription model override; the in-code default is `openai/gpt-4o-mini-transcribe`                                                                                       |

```
OPENROUTER_API_KEY=replace-with-openrouter-api-key
OPENROUTER_SAFETY_MODEL=openai/gpt-5.6-luna
OPENROUTER_SESSION_MODEL=openai/gpt-5.6-luna
```

`OPENROUTER_API_KEY` is the only required OpenRouter secret. Model variables are optional public configuration: locally they come from `.env` / `.dev.vars` (`.env.example` carries the recommended values), in production from the `vars` block in `wrangler.jsonc` — keep the two in sync. Chat-completion requests that carry session data use OpenRouter's private provider routing (`src/lib/openrouter/privacy.ts`: no data collection, ZDR, required parameters), so a model without a matching endpoint fails instead of silently weakening privacy; the dedicated transcription endpoint cannot take request-level ZDR, so the production key itself must enforce it (see `.env.example`). OpenRouter secrets must stay server-only. Do not import them from client components, do not commit real values, and do not use an OpenRouter management key for this app runtime.

## Operational Visibility

F-03 emits privacy-safe structured JSON events to Cloudflare Workers Logs through `src/lib/operational-visibility/`. Application code should use `logOperationalEvent()` and the helper builders there instead of direct `console.log()` calls.

Events may include request ID, route bucket, method, status, outcome, safe reason code, duration, provider, risk state, action, deployment target, and optional pseudonymous `userHash`. They must never include private conversation content, prompts, summaries, emails, tokens, cookies, authorization headers, raw provider payloads, raw database errors, selected modality/avatar IDs, or raw Supabase user IDs.

`OPERATIONAL_LOG_HASH_SECRET` is an optional server-only secret. Set it locally in `.env` / `.dev.vars` and in GitHub or Cloudflare secrets only when stable user-level log correlation is needed. If it is missing, the logger omits `userHash` and product flows continue.

Read hosted logs through the Cloudflare dashboard or read-only CLI tailing:

```bash
npx wrangler tail --name safespace
```

Use event names and `requestId` for debugging. S-07 admin surfaces must use aggregate views defined in their own plan, not raw operational logs.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/). The normal path is the `deploy` job in CI (see below); the manual equivalent is:

1. Build the project:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL`, `SUPABASE_KEY`, and `OPENROUTER_API_KEY` as Worker secrets (they are listed as required in `wrangler.jsonc`) via the Cloudflare dashboard or `npx wrangler secret put`:

```bash
npx wrangler secret put OPENROUTER_API_KEY
```

Optionally set `OPERATIONAL_LOG_HASH_SECRET` to enable pseudonymous `userHash` fields in operational logs:

```bash
npx wrangler secret put OPERATIONAL_LOG_HASH_SECRET
```

Model selection is not a secret and lives in the `vars` block of `wrangler.jsonc`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs audit → unit tests → disposable PostgreSQL integration tests → Astro sync → lint → TypeScript → Astro check → production build → Chromium E2E. A newer push to the same branch cancels the in-progress `ci` run. Docker is required for database tests. Tests use isolated fixtures; the build receives `SUPABASE_URL` (required for CSP) and `SUPABASE_KEY`.

Pushes to `main` then run one `deploy` job: reject superseded commits, build, apply migrations through the Supabase Session Pooler, and publish with `wrangler deploy --secrets-file`. One concurrency lock covers the entire migration/publication sequence (`queue: max`, `cancel-in-progress: false`); deployments cannot interleave those steps. Migrations remain backward-compatible. No new production secrets are required by the turn-integrity or test changes. Dependabot opens weekly grouped npm and GitHub Actions update PRs (`.github/dependabot.yml`).

Configure these repository **secrets** in GitHub:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_DB_PASSWORD` - database password used to build the Session Pooler migration URL
- `SUPABASE_DB_URL` - optional fallback full Postgres connection string; use the Session Pooler URL and keep the password URL-encoded
- `SUPABASE_DB_POOLER_HOST` - optional override if Supabase shows a different host than `aws-0-eu-west-1.pooler.supabase.com`
- `OPENROUTER_API_KEY` - server-only key used by F-02 safety classification, S-04 session responses, summaries, and transcription; passed to Wrangler during deploy
- `OPERATIONAL_LOG_HASH_SECRET` - optional server-only salt for pseudonymous operational log correlation
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

And this optional repository **variable** (not a secret):

- `SUPPORT_EMAIL` - optional override of the public contact address shown to users (footer, blocked-account page, premium request CTA); defaults to `safespacenow123@gmail.com` in `src/lib/support-contact.ts`

OpenRouter model overrides (`OPENROUTER_*_MODEL`, `OPENROUTER_SESSION_REASONING_EFFORT`) are not GitHub secrets — they are versioned in `wrangler.jsonc`.

## License

MIT
