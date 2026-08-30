# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Communicate with the user in Polish. `AGENTS.md` holds overlapping contributor guidance plus the 10xDevs roadmap/test-plan toolkit — read it for the `/10x-*` workflow, not for the commands below (it predates the test runner and is stale on that point).

## What this is

**SafeSpace** is a mental-health / therapy-simulation app. A user picks a therapeutic modality + avatar, then runs a time-limited AI chat "session". Conversations are private by design: the entire architecture is built around a **privacy boundary** that keeps raw conversation content out of logs, admin surfaces, and unbounded context reuse. When in doubt about whether something may touch `session_messages.content`, `session_summaries.summary_text`, prompts, or provider payloads — assume it's privileged and route through the dedicated boundary helpers.

## Commands

- `npm run dev` — Astro dev server (Cloudflare workerd runtime)
- `npm run build` — production SSR build (`@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run test` — Vitest (run mode, no watch); `npm run test:watch` — watch mode
- `npx vitest run src/lib/session-flow/__tests__/session-state.test.ts` — run a single test file
- `npx vitest run -t "name"` — run tests matching a name
- `npm run typecheck` — `tsc --noEmit` (part of CI)
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules (Astro, React, hooks, react-compiler, a11y, Prettier)
- `npm run format` — Prettier (prettier-plugin-astro + prettier-plugin-tailwindcss)

Pre-commit (husky + lint-staged): `eslint --fix` on `*.{ts,tsx,astro}`, `prettier --write` on `*.{json,css,md}`.

## CI / deploy (`.github/workflows/ci.yml`)

On push/PR to **`main`** the `ci` job runs `npm run test` → `npx astro sync` → `npm run lint` → `npm run typecheck` → `npm run build` (needs `SUPABASE_URL`, `SUPABASE_KEY` secrets). On push to `main` only, `migrate` (`supabase db push` via Session Pooler URL — the direct `db.*.supabase.co` host is rejected, it needs IPv6) then `deploy` (`wrangler deploy --secrets-file`) run after `ci`. Adding a test is mandatory CI coverage now, not optional.

## Architecture

Astro 6 SSR (`output: "server"`) + React 19 islands + Tailwind 4 + Supabase auth + shadcn/ui, deployed to Cloudflare Workers (`wrangler.jsonc`, `nodejs_compat`). All pages server-rendered; **API routes must export `const prerender = false`** and use uppercase method exports (`GET`, `POST`).

### Request lifecycle

`src/middleware.ts` runs on every request and:

1. Mints a `requestId` (`context.locals.requestId`) for operational logging and stamps it on the response header.
2. Rejects oversized `/api/*` bodies (413, Content-Length cap) before any parsing: 32 KB default, 7 MB only for `/api/session/transcribe` (WebM audio).
3. Resolves the Supabase user via `createClient()` → `context.locals.user`.
4. Rate-limits AI-backed session endpoints (POST `/api/session/message`, `start`, `start-next`, `transcribe`, and `summary/*` by prefix) per user via the Cloudflare `SESSION_RATE_LIMITER` binding (`src/lib/rate-limit.ts`, wrangler.jsonc). Fail-open when the binding is absent (local dev, tests); over-limit → 429 `{ code: "rate_limited" }`.
5. For `PROTECTED_ROUTES` (`/dashboard`, `/account`, `/admin`): redirects unauthenticated users to `/auth/signin`, then checks **account access** (`readAccountAccessState`) and redirects blocked/unavailable accounts to `/account/blocked`. Result lands in `context.locals.accountAccess`.
6. Stamps baseline security headers on every response (X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy…). A full CSP is **intentionally absent** — Astro islands need inline hydration scripts, so a real CSP requires nonce plumbing; don't add a blanket header.

CSRF: `security.checkOrigin: true` in `astro.config.mjs` (explicit, do not remove) makes Astro reject form-content-type POST/PATCH/PUT/DELETE with a mismatched `Origin` header; JSON requests are covered by the CORS preflight model.

Auth: `src/lib/supabase.ts` (cookie SSR client, `astro:env/server` secrets), pages in `src/pages/auth/`, endpoints in `src/pages/api/auth/` (incl. Google OAuth `google.ts` + `callback.ts`).

### Session flow (the core feature)

`POST /api/session/message` (`src/pages/api/session/message.ts`) is the canonical orchestration and the file to read first. Order is load-bearing:

1. `getSessionDataContext(context)` — owner-bound private data context (never `.from(...)` private tables directly).
2. `requireActiveAccountAccess` — block check.
3. Load owned session metadata + recent messages via `session-data/repository` helpers.
4. **`evaluateSessionSafety()` gates everything.** Branch on `decision.action`, never on model output: `allow` → normal generation; `allow_with_constraints` → pass `decision.constraints` to the model (no user-visible warning); `hard_stop` / fail-closed → interrupt, return `decision.copy` + `decision.crisisResources` (HTTP 423). Missing OpenRouter config, timeout, or a malformed provider reply are all treated as `hard_stop`.
5. Enforce the per-session time budget (`session-flow/time-limit`); expired → 409.
6. `generateSessionResponse()` with recent messages + **approved summaries** as the only carried-over context (no unbounded raw history) — and only when `session.usesApprovedContext` is true; a session the owner started without context never reads summaries, not even ones approved after it began. The reply is also shaped by `resolveSessionPhase()` (`session-flow/session-phase`), which maps the session's remaining budget to `opening | middle | closing`. Thresholds are **fractions of this session's own budget** (capped in absolute time), so the arc holds for the 15-minute trial and for longer paid sessions alike — never add fixed minute marks. Only the phase label reaches the model, never the remaining time.
7. Persist the turn via `persistSuccessfulMessageTurn` (never direct inserts).

Other session routes: `start.ts` / `start-next.ts` (start free trial / summary-backed follow-up), `end.ts` (explicit completion / expiry transition via `session-flow/session-completion-contract`), `transcribe.ts` (voice input → text), `history/`, `summary/`. Avatar choice is saved via `POST /api/profile/avatar` (redirect-based errors from `avatar-choice-errors.ts`).

### Account plans and the free-plan session limit

Accounts are `free` or `premium` (`admin_user_profiles.premium_granted_at is not null` ⇒ premium; `AccountPlan` in `session-data/types.ts`). **A free account may own at most `FREE_PLAN_SESSION_LIMIT` (3) sessions in total** — every `therapy_sessions` row it owns counts, any lifecycle status, deleted tombstones included, so deleting never frees a slot; premium accounts are not capped. The first session is still the one-per-user free-trial claim; sessions 2–3 are ordinary follow-ups — the cap is orthogonal to the start/start-next split and applies to both routes.

**The plan also sets the length of a single conversation**: free 15 min, premium 60 min (`FREE_TRIAL_DURATION_SECONDS` / `PREMIUM_SESSION_DURATION_SECONDS`, resolved by `resolveSessionDurationSeconds()` in `session-flow/session-budget.ts`). Both start routes pin it at start from the plan they already read for the quota, so a grant or revoke mid-conversation never stretches or cuts a session under way; everything downstream (timer, `resolveSessionPhase()`, expiry) derives from that session's own `expires_at`. Because a premium account's *first* session is still the trial claim, the DB side had to admit both budgets: `therapy_sessions_trial_duration_check` allows `(900, 3600)` and `claim_free_trial_session()` takes `p_duration_bucket_seconds` (default 900) and rejects anything else. `schema-drift.test.ts` pins the constraint, the function guard and the TS constants together.

- **The gate is the database**: BEFORE INSERT trigger `therapy_sessions_enforce_free_plan_limit` (per-user advisory lock + count) raises SQLSTATE `P0005` / `free_plan_session_limit_reached`, mapped by `session-data/errors.ts` to the stable `session_limit_reached` code (`FREE_PLAN_SESSION_LIMIT_SQLSTATE`). It fires for the trial-claim RPC and for direct owner inserts alike, so a client talking to PostgREST directly cannot bypass it.
- **Pre-flight, not enforcement**: `readSessionQuota()` (`session-data/quota.ts`: own plan row + `countOwnedSessions`) feeds `readSessionStartPageState()` → kind `session_limit_reached` (no start offered, `sessionQuota` carried in every start state for the remaining-sessions copy) and the early 403 `session_limit_reached` in `start.ts` / `start-next.ts` (redirect `/dashboard?start=limit_reached`). A race-time DB rejection maps to the same 403. Do not re-implement the cap in the UI or count per route.
- `schema-drift.test.ts` pins `FREE_PLAN_SESSION_LIMIT` and the SQLSTATE to the limit migration — change both sides together.
- There is **no payment integration**: premium is granted/revoked by an active admin (`POST /api/admin/users/[userId]/plan`, audited as `premium_granted` / `premium_revoked` with plan reason codes) or by owner-run SQL. `AccountAccessState` (middleware, `requireActiveAccountAccess`) carries `plan` for convenience, but session routes read the plan through `readSessionQuota()`.

### Where each screen starts and ends

The UI deliberately keeps one job per view; splitting a step across two pages is what the navigation audit removed, so re-adding a "prepare to start" screen is a regression, not a feature:

- **`/dashboard`** owns starting a conversation (`SessionStartCard` → `useSessionStart` → start/start-next, then redirect to the session page), the saved-avatar card, and the **only** conversation history in the app. History is stored per avatar, so the section names the perspective and offers a switcher (a row of avatar faces, `?historyAvatar=<avatarId>`, distinct from the `?avatar=updated` save flash). The list groups rows under day headings (`groupSessionHistoryItemsByDay`) and carries **one** action per row — opening the read-only preview; **deleting lives inside that preview**, never on the bare list, because rows differ only by time and deleting what you cannot see is how the wrong conversation goes. A row may carry a summary marker (`summaryState`, see `session-data/` below): state only, never a word of the summary itself.
- **`/dashboard/session`** is the live conversation only. Without a session (`readSessionStartPageState().session === null`) it redirects to `/dashboard` — the page never renders a start button. A finished session shows its closing card **with `SessionSummaryPanel` inline**: the decision about what carries into the next conversation belongs where the conversation ended, so the panel owns the only filled button on that screen and the navigation links stay quiet. The panel is built as a threshold — the logo's arch fills only once something actually passes — and its approve label lives in `session-copy.ts` (`SUMMARY_APPROVE_LABEL`) because `/privacy` quotes it verbatim. On a phone the session header stays one row (compact timer, a hairline progress bar under it, "Pomoc" always visible) and the boundaries line collapses to one tappable line; starter prompts show until the user's **first message**, not until the transcript is empty — a session starts with the avatar's opening message, so the old emptiness check hid them forever.
- **`/dashboard/avatar`** only picks a perspective. It carries no history and no start action. All five are shown side by side as voice cards — the `voiceSample` from the catalog is the thing that actually helps someone choose, so it is on every card at once rather than one at a time; `pairingNote` appears only under the selected card.
- **`AppHeader`** has no nav tabs. The logo returns to the dashboard, an active conversation surfaces as a contextual pill (`session-flow/active-session-badge`, read **across all avatars** — a conversation started under another perspective must still have a way back), and the account menu holds account + sign-out. The admin entry lives on the account page, behind `getAdminContext`; `AdminShell` carries its own "back to panel" + sign-out because it has no `AppHeader`.
- **Dead ends are bugs.** Every terminal state must say what to do next: the exhausted free allowance explains that premium is granted by hand and links the support contact; `/account` redirects to `/account/security` (plan + allowance + password + privacy link); `/account/blocked` redirects active accounts back to the dashboard and shows the contact; `404` keeps the header. `SiteFooter` (privacy/terms page `/privacy`, contact, crisis line) sits on every non-session page — the session page stays full-height and already shows boundaries + crisis help. Copy for plan/allowance lives in `session-flow/plan-copy.ts`, session length in `session-flow/session-budget.ts` (derive the minutes from `resolveSessionDurationSeconds(plan)` — never hard-code them, and never assume 15: a premium account is told 60), the support address in `support-contact.ts` (`DEFAULT_SUPPORT_EMAIL` = the official mailbox, `SUPPORT_EMAIL` env overrides it; an invalid override falls back to the default, so the contact CTA is always present).
- **Wording:** the user picks a **perspektywa** (the avatar is the face of it). Use "perspektywa" for the choice and "awatar" only for the persona; the first-run card on `/dashboard` shows the two-step path (choose perspective → start) and `?avatar=updated` confirms "krok 2 z 2".

### `src/lib/` subsystems and their boundaries

Several directories carry a `README.md` that is the **authoritative contract** — read it before touching the code. The boundaries are a privacy design, not just style:

- **`session-data/`** — owner-bound repository over private tables (`therapy_sessions`, `session_messages`, `session_summaries`, `session_trial_claims`). Entry point `getSessionDataContext()`. Free-trial start _must_ go through `claimFreeTrialSession()` (DB unique constraint, not a UI check); the free-plan session cap is read through `readSessionQuota()` (`quota.ts`) and enforced by a DB trigger (see "Account plans" above). Deletes go through `deleteOwnedSession()` (hard-deletes content, leaves a content-free tombstone). `SessionHistoryListItem.summaryState` is read for a whole page in one query by `listOwnedSessionSummaryStates()` over `SUMMARY_STATE_SELECT` — a select that deliberately omits `summary_text`, so the list can say _that_ something carries over without ever holding _what_; a failed read degrades to no markers rather than failing the history. Hand-maintained domain types in `types.ts` are the privacy contract — see its README before adding Supabase typegen.
- **`session-safety/`** — `evaluateSessionSafety()`; OpenRouter classifier maps `normal|caution|crisis` → `allow|allow_with_constraints|hard_stop`. Fail-closed. Crisis resources for PL/US + local fallback.
- **`session-ai/`** — `generateSessionResponse()`, prompt + copy + OpenRouter request params. Provider abstraction in `provider.ts`, env in `env.ts`.
- **`session-summary/`** — generates user-visible session summaries (drives "summary-backed next session").
- **`session-transcription/`** — voice-message transcription via OpenRouter (`transcribeSessionAudio()`, provider abstraction like `session-ai`); backs `POST /api/session/transcribe`. Audio is conversation content — same privacy rules apply.
- **`session-flow/`** — pure-ish state machines, request/response contracts, persistence, markdown rendering, time-limit math (the orchestration glue used by routes).
- **`operational-visibility/`** — **the only sanctioned logging path.** Emit via `logOperationalEvent()` + builders in `session-events.ts`; never `console.log`. Allowlist-driven sanitizer. Permitted fields only: `requestId`, `outcome`, `durationMs`, `provider`, `riskState`, `action`, `reasonCode`, optional `userHash`. **Never** log message/prompt/content/summary/email/token/provider payloads/`modalityId`/`avatarId`/raw `user.id`. Read hosted logs with `npx wrangler tail --name safespace`.
- **`admin/`** — admin auth, account access/block, account plan (free/premium grant + revoke, audited), and **content-free aggregates only** (status, duration bucket, trial marker, plan, dates — never conversation text). Surfaces: `src/pages/admin/`, `src/pages/api/admin/`. Admin identity lives in the `admin_users` table; there is no runtime service-role key and no endpoint to create the first admin — it's provisioned by owner-run SQL (snippet in README "Admin setup").
- **`modalities.ts`** — modality + avatar catalog; `getValidAvatarChoice()` validates a stored choice. Each entry carries two prompt fields: `sessionStyleHint` (the full avatar persona — voice, what it listens for, advice stance, session arc, reply shapes, `Avoid:`) used only by `session-ai`, and the short `summaryLensHint` used only by `session-summary`. Do not feed the full style hint to the summary path: a summary needs the modality lens, not conversational rules, and the oversized hint used to overflow that prompt budget and silently truncate its own `Avoid:` tail. Prompt-budget caps for both are asserted in tests — keep hints under the editorial budget rather than raising the cap.

### OpenRouter

AI is OpenRouter via `@openrouter/sdk` (`src/lib/openrouter/sdk-chat.ts`). Four models, set by env: `OPENROUTER_SAFETY_MODEL` (classifier), `OPENROUTER_SESSION_MODEL` (responses, incl. reasoning-model support), `OPENROUTER_SUMMARY_MODEL` (summaries; falls back to the session model), `OPENROUTER_TRANSCRIPTION_MODEL` (voice input); plus `OPENROUTER_SESSION_REASONING_EFFORT` (`minimal|low|medium|high|xhigh`, session responses only — overrides the per-model default effort in `session-ai/openrouter-request-params.ts`; `high`/`xhigh` also switch to a larger completion budget and a longer timeout in `openrouter-session-response.ts`, an invalid value is ignored); all optional — in-code defaults live in `src/lib/openrouter/env.ts` and the safety classifier.

**Token budgets and reasoning models.** Reasoning models bill hidden thinking against the same completion budget as the visible answer, and they think before writing — too small a budget returns `finish_reason: "length"`, which both session and summary parsers reject as `invalid_provider_response`. `resolveSummaryMaxCompletionTokens` (`session-summary/openrouter-summary.ts`) and `resolveSessionMaxCompletionTokens` (`session-ai/openrouter-session-response.ts`) list these models per-branch and **must be updated together** — a model added to one but not the other silently breaks that path (this is exactly how Gemini 3.7 Flash summaries failed).

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

CI applies migrations _before_ deploying code (`migrate` → `deploy`), so every migration must be backward-compatible with the currently deployed code (expand/contract: add before you remove). Multi-step owner-bound writes that must not partially fail live in SQL functions (`claim_free_trial_session`, `delete_owned_session`) — `security invoker`, so RLS keeps applying to the calling user. `src/lib/session-data/__tests__/schema-drift.test.ts` pins the hand-maintained domain enums in `session-data/types.ts` to the boundary migration's check constraints; update both sides together.

## Environment

- Node v22.14.0 (`.nvmrc`).
- Required secrets: `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`. Public/optional: `OPENROUTER_SAFETY_MODEL`, `OPENROUTER_SESSION_MODEL`, `OPENROUTER_SUMMARY_MODEL`, `OPENROUTER_TRANSCRIPTION_MODEL`, `OPERATIONAL_LOG_HASH_SECRET` (enables stable `userHash` correlation; absence does not block requests or fall back to raw `user.id`), `SUPPORT_EMAIL` (optional override of the public contact address `safespacenow123@gmail.com` — `support-contact.ts` — shown in the footer, on the blocked-account page, and as the premium CTA). All declared in `astro.config.mjs` `env.schema`. Build-time only: `SITE_URL` — when set, enables Astro `site` + the sitemap integration (deliberately off until the final domain is chosen).
- Local: `.env` (Node tooling) / `.dev.vars` (Cloudflare local dev, gitignored). Copy from `.env.example`.
- Product/architecture docs in `context/foundation/` (`prd.md` holds the privacy guardrails) and `context/deployment/deploy-plan.md`.
