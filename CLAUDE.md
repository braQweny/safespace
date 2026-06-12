# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Communicate with the user in Polish. `AGENTS.md` holds overlapping contributor guidance plus the 10xDevs roadmap/test-plan toolkit — read it for the `/10x-*` workflow, not for the commands below (it predates the test runner and is stale on that point).

## What this is

**SafeSpace** is a mental-health / therapy-simulation app. A user picks a therapeutic modality + avatar, then runs a time-limited AI chat "session". Conversations are private by design: the entire architecture is built around a **privacy boundary** that keeps raw conversation content out of logs, admin surfaces, and unbounded context reuse. When in doubt about whether something may touch `session_messages.content`, `session_summaries.summary_text`, prompts, or provider payloads — assume it's privileged and route through the dedicated boundary helpers.

## Commands

- `npm run dev` — Astro dev server (Cloudflare workerd runtime)
- `npm run build` — production SSR build (`@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run test` — Vitest (run mode, no watch)
- `npx vitest run src/lib/session-flow/__tests__/session-state.test.ts` — run a single test file
- `npx vitest run -t "name"` — run tests matching a name
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules (Astro, React, hooks, react-compiler, a11y, Prettier)
- `npm run format` — Prettier (prettier-plugin-astro + prettier-plugin-tailwindcss)

Pre-commit (husky + lint-staged): `eslint --fix` on `*.{ts,tsx,astro}`, `prettier --write` on `*.{json,css,md}`.

## CI / deploy (`.github/workflows/ci.yml`)

On push/PR to **`main`** the `ci` job runs `npm run test` → `npx astro sync` → `npm run lint` → `npm run build` (needs `SUPABASE_URL`, `SUPABASE_KEY` secrets). On push to `main` only, `migrate` (`supabase db push` via Session Pooler URL) then `deploy` (Cloudflare) run after `ci`. Adding a test is mandatory CI coverage now, not optional.

## Architecture

Astro 6 SSR (`output: "server"`) + React 19 islands + Tailwind 4 + Supabase auth + shadcn/ui, deployed to Cloudflare Workers (`wrangler.jsonc`, `nodejs_compat`). All pages server-rendered; **API routes must export `const prerender = false`** and use uppercase method exports (`GET`, `POST`).

### Request lifecycle

`src/middleware.ts` runs on every request and:
1. Mints a `requestId` (`context.locals.requestId`) for operational logging and stamps it on the response header.
2. Rejects oversized `/api/*` bodies (413, 32 KB Content-Length cap) before any parsing.
3. Resolves the Supabase user via `createClient()` → `context.locals.user`.
4. Rate-limits AI-backed session endpoints (`/api/session/message`, `start`, `start-next`) per user via the Cloudflare `SESSION_RATE_LIMITER` binding (`src/lib/rate-limit.ts`, wrangler.jsonc). Fail-open when the binding is absent (local dev, tests); over-limit → 429 `{ code: "rate_limited" }`.
5. For `PROTECTED_ROUTES` (`/dashboard`, `/account`, `/admin`): redirects unauthenticated users to `/auth/signin`, then checks **account access** (`readAccountAccessState`) and redirects blocked/unavailable accounts to `/account/blocked`. Result lands in `context.locals.accountAccess`.

CSRF: `security.checkOrigin: true` in `astro.config.mjs` (explicit, do not remove) makes Astro reject form-content-type POST/PATCH/PUT/DELETE with a mismatched `Origin` header; JSON requests are covered by the CORS preflight model.

Auth: `src/lib/supabase.ts` (cookie SSR client, `astro:env/server` secrets), pages in `src/pages/auth/`, endpoints in `src/pages/api/auth/` (incl. Google OAuth `google.ts` + `callback.ts`).

### Session flow (the core feature)

`POST /api/session/message` (`src/pages/api/session/message.ts`) is the canonical orchestration and the file to read first. Order is load-bearing:
1. `getSessionDataContext(context)` — owner-bound private data context (never `.from(...)` private tables directly).
2. `requireActiveAccountAccess` — block check.
3. Load owned session metadata + recent messages via `session-data/repository` helpers.
4. **`evaluateSessionSafety()` gates everything.** Branch on `decision.action`, never on model output: `allow` → normal generation; `allow_with_constraints` → pass `decision.constraints` to the model (no user-visible warning); `hard_stop` / fail-closed → interrupt, return `decision.copy` + `decision.crisisResources` (HTTP 423). Missing OpenRouter config, timeout, or a malformed provider reply are all treated as `hard_stop`.
5. Enforce the per-session time budget (`session-flow/time-limit`); expired → 409.
6. `generateSessionResponse()` with recent messages + **approved summaries** as the only carried-over context (no unbounded raw history).
7. Persist the turn via `persistSuccessfulMessageTurn` (never direct inserts).

Other session routes: `start.ts` / `start-next.ts` (start free trial / summary-backed follow-up), `history/`, `summary/`.

### `src/lib/` subsystems and their boundaries

Several directories carry a `README.md` that is the **authoritative contract** — read it before touching the code. The boundaries are a privacy design, not just style:

- **`session-data/`** — owner-bound repository over private tables (`therapy_sessions`, `session_messages`, `session_summaries`, `session_trial_claims`). Entry point `getSessionDataContext()`. Free-trial start *must* go through `claimFreeTrialSession()` (DB unique constraint, not a UI check). Deletes go through `deleteOwnedSession()` (hard-deletes content, leaves a content-free tombstone). Hand-maintained domain types in `types.ts` are the privacy contract — see its README before adding Supabase typegen.
- **`session-safety/`** — `evaluateSessionSafety()`; OpenRouter classifier maps `normal|caution|crisis` → `allow|allow_with_constraints|hard_stop`. Fail-closed. Crisis resources for PL/US + local fallback.
- **`session-ai/`** — `generateSessionResponse()`, prompt + copy + OpenRouter request params. Provider abstraction in `provider.ts`, env in `env.ts`.
- **`session-summary/`** — generates user-visible session summaries (drives "summary-backed next session").
- **`session-flow/`** — pure-ish state machines, request/response contracts, persistence, markdown rendering, time-limit math (the orchestration glue used by routes).
- **`operational-visibility/`** — **the only sanctioned logging path.** Emit via `logOperationalEvent()` + builders in `session-events.ts`; never `console.log`. Allowlist-driven sanitizer. Permitted fields only: `requestId`, `outcome`, `durationMs`, `provider`, `riskState`, `action`, `reasonCode`, optional `userHash`. **Never** log message/prompt/content/summary/email/token/provider payloads/`modalityId`/`avatarId`/raw `user.id`. Read hosted logs with `npx wrangler tail --name safespace`.
- **`admin/`** — admin auth, account access/block, and **content-free aggregates only** (status, duration bucket, trial marker, dates — never conversation text). Surfaces: `src/pages/admin/`, `src/pages/api/admin/`.
- **`modalities.ts`** — modality + avatar catalog; `getValidAvatarChoice()` validates a stored choice.

### OpenRouter

AI is OpenRouter via `@openrouter/sdk` (`src/lib/openrouter/sdk-chat.ts`). Two models, set by env: `OPENROUTER_SAFETY_MODEL` (classifier) and `OPENROUTER_SESSION_MODEL` (responses, incl. reasoning-model support). Token-limit handling is unified across summary + session requests.

## Conventions

- **Path alias** `@/*` → `./src/*` (tsconfig + vitest both configured).
- **Astro components** for static layout; **React islands** only for interactivity. No Next.js directives (`"use client"`). Extract hooks under `src/components/hooks/`.
- **Tailwind**: merge classes with `cn()` from `@/lib/utils` — never concatenate class strings.
- **shadcn/ui** in `src/components/ui/` ("new-york", base color neutral, lucide icons). Add via `npx shadcn@latest add [name]`.
- **Validate API input with hand-written type guards / contract modules** (zod is NOT a dependency — e.g. `session-flow/message-contract.ts`, `parseSessionIdParam`, `auth-validation.ts`); return stable domain error codes, never raw Supabase `message`/`details`/`hint` to UI, logs, or response bodies.
- **Tests** live in `__tests__/` next to code (`src/lib/**`, `src/components/**`, `src/pages/**`); `.test.ts` / `.test.tsx`. Vitest `environment: "node"`.
- **Shared types** (entities, DTOs) in `src/types.ts`; subsystem-local domain types stay in that subsystem's `types.ts`.

## Migrations & data

`supabase/migrations/`, naming `YYYYMMDDHHmmss_short_description.sql`. **Always enable RLS on new tables with granular per-operation, per-role policies.** Private session tables and admin operation functions are defined here. Local stack: `npx supabase start` (Docker). There is no break-glass admin content access — any legal/safety exception needs a separate audited plan, not an implicit helper.

CI applies migrations *before* deploying code (`migrate` → `deploy`), so every migration must be backward-compatible with the currently deployed code (expand/contract: add before you remove). Multi-step owner-bound writes that must not partially fail live in SQL functions (`claim_free_trial_session`, `delete_owned_session`) — `security invoker`, so RLS keeps applying to the calling user. `src/lib/session-data/__tests__/schema-drift.test.ts` pins the hand-maintained domain enums in `session-data/types.ts` to the boundary migration's check constraints; update both sides together.

## Environment

- Node v22.14.0 (`.nvmrc`).
- Required secrets: `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`. Public/optional: `OPENROUTER_SAFETY_MODEL`, `OPENROUTER_SESSION_MODEL`, `OPERATIONAL_LOG_HASH_SECRET` (enables stable `userHash` correlation; absence does not block requests or fall back to raw `user.id`). All declared in `astro.config.mjs` `env.schema`.
- Local: `.env` (Node tooling) / `.dev.vars` (Cloudflare local dev, gitignored). Copy from `.env.example`.
- Product/architecture docs in `context/foundation/` (`prd.md` holds the privacy guardrails) and `context/deployment/deploy-plan.md`.
