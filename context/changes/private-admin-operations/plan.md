# Private Admin Operations Implementation Plan

## Overview

Implement S-07 from `context/foundation/roadmap.md`: a private admin area where an admin can view product statistics and manage users without access to private conversation messages, prompts, provider payloads, or user-visible summary text.

The MVP admin scope is deliberately narrow. It adds two admin views (`/admin` and `/admin/users`), server-only product aggregates, user list/search/status filtering, block/unblock actions, and an audit trail for admin mutations. It does not add exports, billing, raw operational-log browsing, break-glass content access, or admin-readable private content policies.

## Current State Analysis

SafeSpace already has the privacy foundations that S-07 must respect. F-01 created owner-bound private session tables and a `src/lib/session-data/` boundary. F-03 created privacy-safe operational logs and explicitly states raw logs are not an admin UI. S-04/S-05/S-06 added timed sessions, history, deletion, summaries, and follow-up sessions, all still routed through owner-bound helpers.

There is no admin surface yet. `src/middleware.ts` protects `/dashboard` and `/account`, but not `/admin`, and there is no role model in `App.Locals`, no `admin_users` table, no account-block state, no admin audit trail, and no admin API. The existing Supabase client is the SSR user client and intentionally does not use service-role secrets.

## Desired End State

The repo has an application-level admin boundary based on an `admin_users` allowlist keyed by `auth.users.id`. The first admin is owner-provisioned through controlled SQL, not through a client-side secret. Admin routes and APIs authenticate the current Supabase user, verify they are an active admin, verify the admin account itself is not blocked, and then read/write only safe admin data.

`/admin` shows a basic product dashboard: total users, blocked users, sessions by lifecycle, active/completed sessions, trial usage, follow-up sessions, and approved summary counts. Segment-style counts use a privacy threshold so small cohorts display as suppressed or `<5` instead of exact values. `/admin/users` shows email, safe account metadata, block status, last activity bucket, and session counters; it supports email search, active/blocked filtering, sorting by created/last activity, and block/unblock actions.

Blocked users cannot access private product routes or session APIs. Blocking does not delete private data, restore trial quota, expose history, or modify message/summary content. Every block/unblock action writes an audit row with admin ID, target user ID, safe reason code, action, and timestamp.

### Key Discoveries:

- Roadmap S-07 requires admin statistics and user management without private conversation contents: `context/foundation/roadmap.md:182`.
- Roadmap marks S-07 blocked specifically by the decision about minimal admin statistics: `context/foundation/roadmap.md:189`.
- PRD requires product statistics and user management without private conversation contents except narrow legal/safety exceptions: `context/foundation/prd.md:95`.
- PRD guardrail says admin does not have access to private conversation contents: `context/foundation/prd.md:47`.
- F-01 S-07 handoff allows only safe metadata/tombstone aggregates and forbids `session_messages.content` and `session_summaries.summary_text`: `src/lib/session-data/README.md:86`.
- F-03 says raw operational logs are not an admin-facing panel: `src/lib/operational-visibility/README.md:7`.
- Existing middleware protects `/dashboard` and `/account`, so `/admin` and blocked-account handling must be added explicitly: `src/middleware.ts:10`.
- Existing session APIs authenticate through `getSessionDataContext()` and therefore need an additional account-block guard: `src/lib/session-data/auth.ts:12`.
- Private session rows contain safe metadata such as status, trial marker, duration bucket, and timestamps; messages and summaries contain private text: `src/lib/session-data/types.ts:40`.
- The private session migration has owner-only RLS policies and no admin content policies today: `supabase/migrations/20260606120000_create_private_session_data_boundary.sql:329`.
- Current test config already includes library, component, and API route tests, so S-07 can add coverage without new test infrastructure: `vitest.config.ts:10`.

## What We're NOT Doing

- No admin access to `session_messages.content`, `session_summaries.summary_text`, prompts, generated answers, provider payloads, classifier inputs/outputs, or raw Supabase errors.
- No legal/safety break-glass content access. Any exception mechanism requires a separate audited plan.
- No `SUPABASE_SERVICE_ROLE_KEY` in Astro/Worker runtime, client code, `.env.example`, Wrangler config, or GitHub Actions.
- No client-side Supabase Auth Admin API and no client-side direct private-table admin queries.
- No user deletion, trial reset, password reset, provider metadata viewer, billing, subscriptions, exports, CSV/JSON downloads, or admin analytics warehouse.
- No raw Cloudflare Workers Logs browser inside the app.
- No Playwright/E2E setup in this slice.
- No roadmap archive mutation in this plan-only change.

## Implementation Approach

Build S-07 in three larger phases. First establish the admin/account-control data and access boundary. Then build the dashboard and user-management vertical slice on top of that boundary. Finally run targeted tests, source sweeps, docs, and verification notes to prove the admin surface did not cross the private-content boundary.

## Critical Implementation Details

### Admin identity source

Use an application table `admin_users` keyed by Supabase `auth.users.id`; do not use an env email allowlist or client-side Auth Admin API. The first admin is added by owner-controlled SQL documented in setup/deploy notes.

### Email without service role

Admin user search needs email, but runtime must not use service-role secrets. Create a safe application profile/status table maintained by database trigger/backfill from `auth.users`, then expose it through admin-only RLS and server-only helper functions.

### Block enforcement

Blocking is an application-level access control, not a Supabase Auth ban. Enforce it in protected page middleware and in every private session API so a blocked user cannot keep using an existing browser session to start, continue, read, summarize, or delete private sessions through product endpoints.

### Privacy thresholds

Use exact global totals only where they cannot identify behavior by segment. Segment or breakdown rows, including lifecycle/status and optional activity buckets, must suppress small cohorts under the MVP threshold of 5.

## Phase 1: Admin Foundation And Access

### Overview

Add the database and server-only access boundary for admins, safe account status, blocking, and audit events. This phase creates the contracts later UI/API code must use.

### Changes Required:

#### 1. Admin Operations Migration

**File**: `supabase/migrations/20260607190000_create_private_admin_operations.sql`

**Intent**: Create the application-level admin role, safe user profile/status table, block state, and audit trail without granting admins access to private conversation content.

**Contract**: Add tables equivalent to `admin_users`, `admin_user_profiles` or `user_account_controls`, and `admin_audit_events`. The profile/status table may include `user_id`, `email`, account created timestamp, last sign-in or last activity timestamp if safely available, blocked timestamp, blocking admin ID, block reason code, and database-owned timestamps. It must not include messages, summaries, prompts, provider payloads, avatar/modality details, or raw auth metadata.

#### 2. Auth User Sync Contract

**File**: `supabase/migrations/20260607190000_create_private_admin_operations.sql`

**Intent**: Make admin email search possible without runtime service-role access.

**Contract**: Backfill safe user profile/status rows from `auth.users` and add a database trigger/function that keeps email and safe auth timestamps synchronized for future users. The trigger must store only the fields the admin UI needs for account management.

#### 3. Admin RLS And Helper Functions

**File**: `supabase/migrations/20260607190000_create_private_admin_operations.sql`

**Intent**: Let active admins read and mutate admin-safe account state while preventing non-admin users from listing other accounts.

**Contract**: Enable RLS on every new admin table. Add a stable `is_private_admin()` or equivalent helper that checks active admin membership for `auth.uid()`. Admins can read safe admin tables, update only block-related columns, and insert audit rows. Users may read only their own minimal block state if needed for access checks. No RLS policy or grant may expose `session_messages`, `session_summaries.summary_text`, raw logs, or auth raw metadata to admins.

#### 4. Admin Domain Types And Errors

**File**: `src/lib/admin/types.ts`, `src/lib/admin/errors.ts`

**Intent**: Define stable app-level contracts for admin auth, user profiles, product aggregates, block state, and audit events.

**Contract**: Export types for admin context, safe user profile, account status, block reason codes, audit event types, privacy-safe counts, overview metrics, user list filters/sorting, and stable error codes. The public admin types may include email and safe account metadata, but must not include content fields, summary text, raw provider/database errors, cookies, tokens, or raw auth metadata.

#### 5. Admin Guard And Account Access Helpers

**File**: `src/lib/admin/auth.ts`, `src/lib/admin/account-access.ts`

**Intent**: Provide one server-only entry point for admin routes and one account-access guard for blocked users.

**Contract**: `getAdminContext(context)` authenticates through the existing Supabase SSR client, verifies current user membership in `admin_users`, and rejects blocked admin accounts. `readAccountAccessState(context)` or equivalent checks whether the current authenticated user is blocked. Both helpers return stable codes and never log or expose raw Supabase errors.

#### 6. Middleware Enforcement

**File**: `src/middleware.ts`, `src/env.d.ts`

**Intent**: Protect `/admin` and enforce account blocking before private pages load.

**Contract**: Extend protected route handling to include `/admin`. Add blocked-account checks for `/dashboard`, `/account`, and `/admin`, with a safe redirect or neutral blocked page that still allows sign-out. `App.Locals` may gain safe admin/account access fields only if they do not include private content or raw auth metadata.

#### 7. Session API Block Enforcement

**File**: `src/pages/api/session/start.ts`, `src/pages/api/session/start-next.ts`, `src/pages/api/session/message.ts`, `src/pages/api/session/history/index.ts`, `src/pages/api/session/history/[sessionId].ts`, `src/pages/api/session/summary/[sessionId].ts`

**Intent**: Prevent blocked users from bypassing page middleware through JSON endpoints.

**Contract**: Every private session API route checks account access before starting, continuing, reading, deleting, summarizing, or approving private session data. Blocked responses use stable safe codes and do not reveal whether a specific session exists.

#### 8. Blocked Account Page Or Copy

**File**: `src/pages/account/blocked.astro` or equivalent route/copy location

**Intent**: Give blocked users a safe, non-private endpoint after middleware denies private product access.

**Contract**: The page says the account is unavailable and offers sign-out or contact guidance if applicable. It must not show history, summaries, session counts, admin reasoning details, or private data.

### Success Criteria:

#### Automated Verification:

- Admin migration source enables RLS on every new admin table.
- Admin migration source contains no policy, view, grant, or function exposing `session_messages.content` or `session_summaries.summary_text`.
- Source search confirms no `SUPABASE_SERVICE_ROLE_KEY` runtime dependency was added.
- Source search confirms `/admin` is protected and blocked users are denied private pages.
- Source search confirms all private session API routes call the account-block guard or shared equivalent.
- Unit tests cover admin membership checks, blocked-account checks, non-admin rejection, blocked admin rejection, and safe error-code mapping.
- `npm run test` passes for Phase 1 tests.
- `npx astro sync` passes.
- `npm run lint` passes.
- `npm run build` passes.

#### Manual Verification:

- Review migration and confirm the first-admin bootstrap path is owner-controlled and not hard-coded to an email secret.
- Confirm a blocked user loses product/session access without deleting or exposing private data.
- Confirm the blocked-account copy is neutral and does not expose admin audit details.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Admin Dashboard And User Management

### Overview

Build the two admin views and server-only API/helper layer for overview stats, user listing, search/filter/sort, and block/unblock actions.

### Changes Required:

#### 1. Admin Overview Aggregates

**File**: `src/lib/admin/aggregates.ts`

**Intent**: Compute product statistics from safe metadata only.

**Contract**: Export helpers for total users, blocked users, sessions by lifecycle, active/completed sessions, trial usage, follow-up session count, and approved summary count. Queries may use `therapy_sessions` metadata, `session_trial_claims`, safe user profile/status rows, and summary status/count metadata. They must not select `session_messages.content`, `session_summaries.summary_text`, prompts, provider payloads, or raw operational logs.

#### 2. Privacy-Safe Count Helpers

**File**: `src/lib/admin/privacy-counts.ts`

**Intent**: Apply the small-cohort rule consistently.

**Contract**: Export a helper that represents counts as exact global totals or suppressed segment counts. Segment and breakdown rows below threshold 5 must display as suppressed or `<5`. Tests must cover threshold edges.

#### 3. Admin User Management Helpers

**File**: `src/lib/admin/users.ts`, `src/lib/admin/audit.ts`

**Intent**: Provide safe server-only operations for user list/search/status and block/unblock actions.

**Contract**: List users with email, safe account metadata, block status, last activity bucket or timestamp if chosen by implementation, and safe session counters. Support email search, active/blocked filter, and sort by created or last activity. Block/unblock updates only account-control fields and writes `admin_audit_events` with admin ID, target user ID, action, reason code, and timestamp. It must not delete users, reset trials, read private content, or expose raw auth metadata.

#### 4. Admin API Contracts

**File**: `src/lib/admin/contracts.ts`

**Intent**: Keep admin route responses stable and safe for React/Astro UI.

**Contract**: Define response unions for overview, user list, and block/unblock actions. Include stable failure codes for missing auth, not admin, blocked admin, target not found, invalid filter, write failed, and unavailable admin data. Do not include raw Supabase error fields.

#### 5. Admin API Routes

**File**: `src/pages/api/admin/overview.ts`, `src/pages/api/admin/users/index.ts`, `src/pages/api/admin/users/[userId]/block.ts`

**Intent**: Expose admin-only JSON routes for the UI.

**Contract**: Every route calls `getAdminContext(context)` first. `GET /api/admin/overview` returns safe aggregate response. `GET /api/admin/users` parses email search, status filter, sort, and pagination. `POST /api/admin/users/[userId]/block` or equivalent toggles block state based on explicit action and reason code. Responses never include private content, summary text, raw logs, cookies, tokens, or raw errors.

#### 6. Admin Layout And Navigation

**File**: `src/pages/admin/index.astro`, `src/pages/admin/users.astro`, `src/components/admin/AdminShell.astro` or equivalent

**Intent**: Add two admin views without changing the public/product shell.

**Contract**: `/admin` renders overview stats. `/admin/users` renders search/filter/sort and user management. Both pages are server-rendered under admin guard, use Polish copy, and keep actions explicit. Navigation must not expose admin links to non-admin users unless current admin state is known server-side.

#### 7. Admin UI Components

**File**: `src/components/admin/AdminOverview.tsx`, `src/components/admin/AdminUsersTable.tsx`, `src/components/admin/__tests__/*.test.tsx`

**Intent**: Render overview cards, privacy-suppressed counts, users table, status labels, and block/unblock forms with predictable states.

**Contract**: Components show email and safe metadata only, never private messages or summaries. Block/unblock requires an explicit control and neutral confirmation state. There is no export/download UI.

#### 8. Docs For First Admin And No Exports

**File**: `README.md`, `context/deployment/deploy-plan.md`

**Intent**: Document how the owner provisions the first admin and what S-07 intentionally omits.

**Contract**: Add concise setup notes for first-admin SQL and hosted verification. State that S-07 adds no new runtime secrets, no service-role runtime key, no export feature, and no legal/safety break-glass content access.

### Success Criteria:

#### Automated Verification:

- Unit tests cover overview aggregate shaping, threshold suppression, user list filtering/sorting, block/unblock state transitions, and audit insert intent.
- API route tests cover non-admin rejection, blocked admin rejection, overview success, users list success, invalid filters, block success, unblock success, target not found, and write failure.
- Component tests cover overview cards, suppressed small counts, users search/filter UI, blocked/active states, explicit block/unblock controls, and absence of export controls.
- `npm run test` passes.
- `npx astro sync` passes.
- `npm run lint` passes.
- `npm run build` passes.
- Source search confirms admin aggregates do not select `session_messages.content` or `session_summaries.summary_text`.
- Source search confirms no CSV/JSON export route or download UI was added.
- Source search confirms admin routes call `getAdminContext(context)`.

#### Manual Verification:

- `/admin` shows product-level stats without exposing private text or small segment counts.
- `/admin/users` supports email search, active/blocked filter, sorting, and block/unblock.
- Blocking a user prevents private route/session access, and unblocking restores access without changing private data.
- Admin UI does not expose exports, raw operational logs, raw auth metadata, or conversation details.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Verification, Sweeps And Handoff

### Overview

Close S-07 with the full local quality gate, privacy/security source sweeps, documentation checks, and verification notes.

### Changes Required:

#### 1. Full Automated Gate

**File**: existing scripts and test config

**Intent**: Verify S-07 against the repo's current CI-equivalent checks.

**Contract**: Run `npm run test`, `npx astro sync`, `npm run lint`, `npm run build`, and `git diff --check`. Do not add Playwright or hosted-only requirements to complete this phase.

#### 2. Private Content Sweep

**File**: source tree

**Intent**: Prove admin code did not cross the content boundary.

**Contract**: Search admin migration, admin helpers, admin routes, admin UI, and operational logging calls for `session_messages.content`, `session_summaries.summary_text`, raw `message`, `prompt`, `content`, generated response text, provider payloads, raw database/provider errors, cookies, tokens, and passwords.

#### 3. Service Role And Secret Sweep

**File**: source tree, `.env.example`, `wrangler.jsonc`, `.github/workflows/ci.yml`

**Intent**: Prove admin work did not add a runtime service-role dependency or committed secret.

**Contract**: Search for `SUPABASE_SERVICE_ROLE_KEY`, service-role key patterns, JWT-like secrets, OpenRouter keys, token/cookie/password assignments, client-exposed admin secrets, and new GitHub/Cloudflare secret requirements. Existing migration database secrets remain deployment-owned; no new runtime secret is allowed.

#### 4. Admin Scope Sweep

**File**: source tree

**Intent**: Prove S-07 stayed inside the accepted MVP scope.

**Contract**: Search for export/download routes, CSV/JSON exports, user deletion, password reset, trial reset, payment/billing, raw operational log browser, break-glass content access, new AI calls, streaming, EventSource, WebSocket, or admin-readable content policies.

#### 5. Verification Notes

**File**: `context/changes/private-admin-operations/verification.md`

**Intent**: Preserve exactly what was verified and what remains owner/environment dependent.

**Contract**: Record command results, source sweep results, local browser smoke status, blocked-user smoke status, first-admin/bootstrap limitation, hosted Supabase/Cloudflare limitations, and whether any hosted checks were not run. Do not mark hosted-only checks complete without evidence.

#### 6. Change Status And Handoff

**File**: `context/changes/private-admin-operations/change.md`, `src/lib/session-data/README.md`, `src/lib/operational-visibility/README.md`

**Intent**: Keep lifecycle and future privacy boundaries clear.

**Contract**: Implementation may move `change.md` from `planned` to later states. Update relevant handoff docs to state S-07 implements admin aggregates/user blocking, still without content access or break-glass. Leave future legal/safety exception, exports, user deletion, billing, and E2E as separate work.

### Success Criteria:

#### Automated Verification:

- `npm run test` passes.
- `npx astro sync` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Private content sweep passes with no admin access to message content, summary text, prompts, provider payloads, or raw errors.
- Service-role and secret sweep passes with no runtime service-role key or committed secret.
- Admin scope sweep passes with no exports, user deletion, trial reset, payment, raw log browser, break-glass content access, or admin-readable content policy.
- `context/changes/private-admin-operations/plan.md` and `plan-brief.md` exist.

#### Manual Verification:

- Admin overview smoke confirms stats render with privacy thresholds.
- Admin users smoke confirms search/filter/sort and block/unblock.
- Blocked-user smoke confirms denied private page and session API access.
- Verification note records commands, sweeps, manual checks, limitations, and any hosted checks not run.
- First-admin bootstrap documentation is understandable before starting implementation.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before marking the change implemented.

---

## Testing Strategy

### Unit Tests:

- Admin guard: missing auth, non-admin, inactive admin, blocked admin, active admin.
- Account access: active user, blocked user, unavailable admin/account data, stable error-code mapping.
- Privacy counts: global totals, suppressed segment counts below 5, exact segment counts at or above 5.
- Aggregates: user totals, blocked totals, session lifecycle counts, trial usage, follow-up sessions, approved summary count, no content fields in output shape.
- User management: email search normalization, status filters, sorting, pagination, block/unblock state transitions, audit event payload shape.

### Route-Level Tests:

- `GET /api/admin/overview` rejects missing auth/non-admin/blocked admin and returns safe metrics for admins.
- `GET /api/admin/users` validates filters, returns email and safe metadata only, supports active/blocked status, and never returns private content.
- `POST /api/admin/users/[userId]/block` blocks and unblocks with reason codes, rejects target not found, writes audit intent, and never deletes account data.
- Existing session APIs reject blocked users before private session work.

### Component Tests:

- Overview cards render safe totals and suppressed small segment counts.
- Users table renders email, account status, safe metadata, filters, sort controls, and explicit block/unblock controls.
- Blocked/empty/error/loading states are visible and do not expose private text.
- No export/download control is rendered.

### Manual Testing Steps:

1. Provision or mock an admin user through the documented first-admin path.
2. Sign in as admin and open `/admin`.
3. Confirm overview stats render and small segments are suppressed.
4. Open `/admin/users`, search by email, filter active/blocked, and sort by created/last activity.
5. Block a test user and confirm an audit row/intent is recorded.
6. Sign in or continue as the blocked user and confirm `/dashboard`, `/account`, `/dashboard/session`, and session API actions are denied safely.
7. Unblock the test user and confirm access is restored without changing private session/history data.
8. Search source/diff for content leaks, service-role runtime secrets, exports, user deletion, trial reset, raw logs, and break-glass access.

## Performance Considerations

SafeSpace target scale is medium users, low QPS, and sensitive-small data. Server-side aggregate queries are acceptable for MVP if they use indexed metadata columns and avoid message/summary content tables except safe count-only joins where needed. User listing must be paginated, and email search should be server-side with a conservative limit.

If aggregate queries become slow later, use a separate plan for database views or cached counters. Do not add a warehouse, Logpush, Analytics Engine, or materialized analytics table in S-07 unless implementation discovers a concrete blocker.

## Migration Notes

S-07 requires a forward-only Supabase migration. It may create triggers on `auth.users` to maintain safe public admin profile/status rows. Hosted migration verification remains owner/environment dependent and must be recorded in `verification.md` if performed.

Do not add `SUPABASE_SERVICE_ROLE_KEY` to runtime configuration. The safe path for the first admin is documented owner SQL against Supabase, not an application endpoint.

## References

- Roadmap S-07: `context/foundation/roadmap.md:182`
- Roadmap S-07 blocker: `context/foundation/roadmap.md:189`
- PRD admin requirements: `context/foundation/prd.md:95`
- PRD admin privacy guardrail: `context/foundation/prd.md:47`
- PRD access-control privacy boundary: `context/foundation/prd.md:125`
- F-01 S-07 handoff: `src/lib/session-data/README.md:86`
- F-03 raw-log boundary: `src/lib/operational-visibility/README.md:7`
- Current protected route middleware: `src/middleware.ts:10`
- Current session auth helper: `src/lib/session-data/auth.ts:12`
- Session metadata/content type split: `src/lib/session-data/types.ts:40`
- Owner-only private data RLS baseline: `supabase/migrations/20260606120000_create_private_session_data_boundary.sql:329`
- Current test include pattern: `vitest.config.ts:10`
- Progress format reference: `.agents/skills/10x-plan/references/progress-format.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.agents/skills/10x-plan/references/progress-format.md`.

### Phase 1: Admin Foundation And Access

#### Automated

- [x] 1.1 Admin migration source enables RLS on every new admin table. — 589ee7b
- [x] 1.2 Admin migration source contains no policy, view, grant, or function exposing `session_messages.content` or `session_summaries.summary_text`. — 589ee7b
- [x] 1.3 Source search confirms no `SUPABASE_SERVICE_ROLE_KEY` runtime dependency was added. — 589ee7b
- [x] 1.4 Source search confirms `/admin` is protected and blocked users are denied private pages. — 589ee7b
- [x] 1.5 Source search confirms all private session API routes call the account-block guard or shared equivalent. — 589ee7b
- [x] 1.6 Unit tests cover admin membership checks, blocked-account checks, non-admin rejection, blocked admin rejection, and safe error-code mapping. — 589ee7b
- [x] 1.7 `npm run test` passes for Phase 1 tests. — 589ee7b
- [x] 1.8 `npx astro sync` passes. — 589ee7b
- [x] 1.9 `npm run lint` passes. — 589ee7b
- [x] 1.10 `npm run build` passes. — 589ee7b

#### Manual

- [x] 1.11 Review migration and confirm the first-admin bootstrap path is owner-controlled and not hard-coded to an email secret. — 589ee7b
- [x] 1.12 Confirm a blocked user loses product/session access without deleting or exposing private data. — 589ee7b
- [x] 1.13 Confirm the blocked-account copy is neutral and does not expose admin audit details. — 589ee7b

### Phase 2: Admin Dashboard And User Management

#### Automated

- [x] 2.1 Unit tests cover overview aggregate shaping, threshold suppression, user list filtering/sorting, block/unblock state transitions, and audit insert intent. — 52a478b
- [x] 2.2 API route tests cover non-admin rejection, blocked admin rejection, overview success, users list success, invalid filters, block success, unblock success, target not found, and write failure. — 52a478b
- [x] 2.3 Component tests cover overview cards, suppressed small counts, users search/filter UI, blocked/active states, explicit block/unblock controls, and absence of export controls. — 52a478b
- [x] 2.4 `npm run test` passes. — 52a478b
- [x] 2.5 `npx astro sync` passes. — 52a478b
- [x] 2.6 `npm run lint` passes. — 52a478b
- [x] 2.7 `npm run build` passes. — 52a478b
- [x] 2.8 Source search confirms admin aggregates do not select `session_messages.content` or `session_summaries.summary_text`. — 52a478b
- [x] 2.9 Source search confirms no CSV/JSON export route or download UI was added. — 52a478b
- [x] 2.10 Source search confirms admin routes call `getAdminContext(context)`. — 52a478b

#### Manual

- [x] 2.11 `/admin` shows product-level stats without exposing private text or small segment counts. — 52a478b
- [x] 2.12 `/admin/users` supports email search, active/blocked filter, sorting, and block/unblock. — 52a478b
- [x] 2.13 Blocking a user prevents private route/session access, and unblocking restores access without changing private data. — 52a478b
- [x] 2.14 Admin UI does not expose exports, raw operational logs, raw auth metadata, or conversation details. — 52a478b

### Phase 3: Verification, Sweeps And Handoff

#### Automated

- [ ] 3.1 `npm run test` passes.
- [ ] 3.2 `npx astro sync` passes.
- [ ] 3.3 `npm run lint` passes.
- [ ] 3.4 `npm run build` passes.
- [ ] 3.5 `git diff --check` passes.
- [ ] 3.6 Private content sweep passes with no admin access to message content, summary text, prompts, provider payloads, or raw errors.
- [ ] 3.7 Service-role and secret sweep passes with no runtime service-role key or committed secret.
- [ ] 3.8 Admin scope sweep passes with no exports, user deletion, trial reset, payment, raw log browser, break-glass content access, or admin-readable content policy.
- [ ] 3.9 `context/changes/private-admin-operations/plan.md` and `plan-brief.md` exist.

#### Manual

- [ ] 3.10 Admin overview smoke confirms stats render with privacy thresholds.
- [ ] 3.11 Admin users smoke confirms search/filter/sort and block/unblock.
- [ ] 3.12 Blocked-user smoke confirms denied private page and session API access.
- [ ] 3.13 Verification note records commands, sweeps, manual checks, limitations, and any hosted checks not run.
- [ ] 3.14 First-admin bootstrap documentation is understandable before starting implementation.
