# 10x Astro Starter

![](./public/template.png)

A modern, opinionated starter template for building fast, accessible web applications.

## Tech Stack

- [Astro](https://astro.build/) v6 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/przeprogramowani/10x-astro-starter.git
cd 10x-astro-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Add the OpenRouter runtime key to `.env` and `.dev.vars` when working on AI session flows — see [AI Runtime Configuration](#ai-runtime-configuration).

6. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run test` - Run unit tests for server-side helper logic
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication and application tables. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

Database migrations live in `supabase/migrations/`. Hosted deployments push pending migrations with `npx supabase db push` before the Cloudflare Worker is deployed. The F-01 private session data boundary adds pending Supabase migrations for session memory, summaries, deletion, and trial claims; record hosted migration evidence in the relevant `context/changes/<change-id>/verification.md` when those migrations are actually applied.

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

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

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

Every account is either `free` or `premium`. A free account may own at most **3 sessions in total** (every session row counts — any status, deleted ones included); premium accounts are not capped. The cap is enforced by a database trigger on `therapy_sessions` inserts, so it cannot be bypassed from the client.

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

S-04 adds a separate server-only ordinary response helper under `src/lib/session-ai/`. It reuses the same OpenRouter runtime key, keeps ordinary replies separate from the safety classifier, and returns safe retry/unavailable states instead of fake assistant messages when the provider fails.

Add these variables to local `.env` and `.dev.vars` files:

| Variable                              | Description                                                                                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`                  | Server-only OpenRouter API key used by the safety classifier and ordinary session responses                                                                                               |
| `OPENROUTER_SAFETY_MODEL`             | Optional safety model override; defaults to `openai/gpt-4o-mini` when empty                                                                                                               |
| `OPENROUTER_SESSION_MODEL`            | Optional ordinary session response model override; defaults to `openai/gpt-4o-mini`                                                                                                       |
| `OPENROUTER_SESSION_REASONING_EFFORT` | Optional reasoning effort for session responses (`minimal`, `low`, `medium`, `high`, `xhigh`); empty keeps the model default, `high`/`xhigh` also raise the completion budget and timeout |

```
OPENROUTER_API_KEY=replace-with-openrouter-api-key
OPENROUTER_SAFETY_MODEL=openai/gpt-4o-mini
OPENROUTER_SESSION_MODEL=openai/gpt-4o-mini
```

`OPENROUTER_API_KEY` is the only required OpenRouter secret. Model variables are optional configuration only. OpenRouter secrets must stay server-only. Do not import them from client components, do not commit real values, and do not use an OpenRouter management key for this app runtime.

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

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as secrets in your Cloudflare dashboard or via `npx wrangler secret put`.
Set `OPENROUTER_API_KEY` the same way before enabling AI session runtime behavior:

```bash
npx wrangler secret put OPENROUTER_API_KEY
```

Optionally set `OPERATIONAL_LOG_HASH_SECRET` to enable pseudonymous `userHash` fields in operational logs:

```bash
npx wrangler secret put OPERATIONAL_LOG_HASH_SECRET
```

## CI

GitHub Actions runs unit tests, lint, and build on every push and PR to `main`. Pushes to `main` then run `npx supabase db push` against the Supabase Session Pooler before deploying to Cloudflare Workers. The test job does not require hosted Supabase credentials, Cloudflare secrets, OpenRouter, or Docker.

Configure these repository secrets in GitHub:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_DB_PASSWORD` - database password used to build the Session Pooler migration URL
- `SUPABASE_DB_URL` - optional fallback full Postgres connection string; use the Session Pooler URL and keep the password URL-encoded
- `SUPABASE_DB_POOLER_HOST` - optional override if Supabase shows a different host than `aws-0-eu-west-1.pooler.supabase.com`
- `OPENROUTER_API_KEY` - server-only key used by F-02 safety classification and S-04 ordinary session responses, passed to Wrangler during deploy
- `OPENROUTER_SESSION_MODEL` - optional ordinary response model override; not required as a secret because code defaults to `openai/gpt-4o-mini`
- `OPENROUTER_SESSION_REASONING_EFFORT` - optional reasoning effort for session responses (`minimal`…`xhigh`); public config, not a secret
- `OPERATIONAL_LOG_HASH_SECRET` - optional server-only salt for pseudonymous operational log correlation
- `SUPPORT_EMAIL` - optional override of the public contact address shown to users (footer, blocked-account page, premium request CTA); defaults to `safespacenow123@gmail.com` in `src/lib/support-contact.ts`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

## License

MIT
