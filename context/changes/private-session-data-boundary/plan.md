# Private Session Data Boundary Implementation Plan

## Overview

Implement F-01 from `context/foundation/roadmap.md`: a private session data boundary for session memory, user-visible summaries, deletion control, and the one-free-session limit. This plan creates the database and server-only helper contracts that future S-04/S-05/S-06/S-07 work must use, without implementing chat UI, timer UI, history UI, AI generation, or admin dashboards.

## Current State Analysis

SafeSpace is already an Astro SSR app with Supabase SSR auth, protected private routes, and one application table for avatar choices. There are no session, message, summary, history, quota, chat, or admin-content endpoints yet.

The current Supabase app-data pattern is `public.user_avatar_choices`: owner-only RLS, `auth.uid() = user_id`, and a later hardening migration that revoked broad table write grants and granted only writable business columns. That review outcome is load-bearing for F-01 because private conversation data is more sensitive than avatar choice metadata.

CI already runs `npx supabase db push` on pushes to `main` before Cloudflare Workers deploy. A new F-01 migration is therefore not a disposable local sketch; it becomes the production schema contract when merged.

## Desired End State

The repo has a forward-only Supabase migration defining private session data tables, RLS policies, column-level grants, lifecycle constraints, database-owned metadata, deletion semantics, and a database-backed one-free-session claim. The repo also has a server-only `src/lib/session-data/` boundary with typed domain contracts, safe error codes, authenticated helper entry points, repository operations for sessions/messages/summaries, deletion helpers, quota helpers, minimal tests, and handoff docs for future slices.

Future S-04 can start a free trial session by calling the F-01 quota/session boundary; future S-05 can delete a session through the F-01 deletion boundary; future S-06 can store and show user-visible summaries without reusing raw message history; future S-07 can build aggregate admin operations without any default access to private conversation content.

### Key Discoveries:

- F-01 is the roadmap foundation for private session memory, summaries, deletion, and one free session: `context/foundation/roadmap.md:32`.
- Roadmap says session/history/AI/admin endpoints are not present yet, so F-01 should not invent a user-facing session flow: `context/foundation/roadmap.md:59`.
- PRD requires one limited free 15-minute session: `context/foundation/prd.md:74`.
- PRD requires view/delete session history and user-visible summaries for later sessions: `context/foundation/prd.md:83`.
- PRD requires admin user management without private conversation contents except narrow legal/safety exceptions: `context/foundation/prd.md:97`.
- Existing Supabase client is SSR/cookie based and returns `null` if Supabase env is missing: `src/lib/supabase.ts:5`.
- Middleware protects `/dashboard` and `/account`, but future API handlers must still authenticate per handler: `src/middleware.ts:5`.
- Existing avatar API checks Supabase config and `context.locals.user` before writing user-owned data: `src/pages/api/profile/avatar.ts:12`.
- Existing avatar table enables owner-only RLS: `supabase/migrations/20260531223000_create_user_avatar_choices.sql:37`.
- Avatar timestamp hardening uses column-level grants and database-owned timestamps: `supabase/migrations/20260604202000_harden_user_avatar_choice_timestamps.sql:1`.
- CI pushes Supabase migrations before deploy on `main`: `.github/workflows/ci.yml:29`.

## What We're NOT Doing

- No chat UI, message composer, timer, streaming response, typing indicator, or session page.
- No `/api/chat`, `/api/session`, `/api/history`, or public session route.
- No AI provider integration, OpenRouter calls, safety classifier calls, prompt construction, or summary generation.
- No history page, summary UI, paid upgrade, billing gate, or admin dashboard.
- No break-glass legal/safety content access implementation.
- No service-role key in Astro/Worker runtime.
- No anonymous RLS policy or broad admin access to private message/summary content.
- No full local Supabase integration test suite or browser E2E setup in this change.

## Implementation Approach

Build a narrow foundation in five phases. First create the Supabase schema and RLS boundary. Then add server-only TypeScript contracts so future routes use one safe data API instead of ad hoc `.from(...)` calls. Next add deletion and quota helpers that encode the privacy decisions made during planning. Then add minimal tests, source sweeps, and handoff docs. Finally close the plan with explicit evidence discipline so environment-dependent checks are not marked complete without proof.

## Critical Implementation Details

### Trial claim ordering

The free-session claim must be database-backed and race-resistant. Future S-04 should not check quota in UI and then insert a session separately; it should call the F-01 claim/session boundary so two concurrent requests cannot create two free sessions.

### Deletion semantics

Deleting a session means private message and summary content is removed, while the session row becomes a minimal tombstone. The tombstone may preserve only non-content fields needed for trial enforcement and safe aggregate usage: IDs, owner, lifecycle/deleted status, safe deletion reason code, timestamps, trial marker, and duration bucket. It must not preserve message text, summary text, title, preview, prompt, provider payload, or modality/avatar details after deletion.

### API authentication

`PROTECTED_ROUTES` protects pages, not future API endpoints. Any future session route must authenticate per handler through the F-01 helper boundary before it touches private session tables.

## Phase 1: Private Session Schema And RLS

### Overview

Create the forward-only Supabase migration that defines private session tables, lifecycle constraints, owner-only RLS, narrow grants, and database-owned metadata.

### Changes Required:

#### 1. Private Session Migration

**File**: `supabase/migrations/20260606120000_create_private_session_data_boundary.sql`

**Intent**: Add the first private conversation data schema for future sessions without adding a user-facing session feature.

**Contract**: Create `public.therapy_sessions`, `public.session_messages`, `public.session_summaries`, and `public.session_trial_claims` or equivalent names. Every table must have `user_id uuid not null references auth.users(id) on delete cascade`, `created_at`, and database-owned metadata. Use explicit check constraints for lifecycle/status fields rather than free-form text.

#### 2. Session Lifecycle Table Contract

**File**: `supabase/migrations/20260606120000_create_private_session_data_boundary.sql`

**Intent**: Give future S-04/S-05/S-06 code one stable lifecycle vocabulary.

**Contract**: `therapy_sessions` stores session identity, owner, optional pre-deletion avatar/modality snapshot, lifecycle status, started/ended/expires/deleted timestamps, safe deletion reason code, trial marker/claim reference, and duration bucket. Allowed lifecycle statuses are `created`, `active`, `completed`, `expired`, `interrupted`, and `deleted`. Deletion must be representable without deleting the session row.

#### 3. Message Table Contract

**File**: `supabase/migrations/20260606120000_create_private_session_data_boundary.sql`

**Intent**: Store future user and assistant conversation content as private owner-bound data.

**Contract**: `session_messages` stores session reference, owner, role, sequence/order, text content, and created timestamp. Roles are constrained to the MVP message roles needed by S-04, such as `user`, `assistant`, and a narrow system/boundary role if required. No prompts, provider raw payloads, embeddings, or admin notes are part of this table.

#### 4. Summary Table Contract

**File**: `supabase/migrations/20260606120000_create_private_session_data_boundary.sql`

**Intent**: Keep user-visible summaries separate from raw messages so S-06 can use summaries as continuity context without loading unrestricted chat history.

**Contract**: `session_summaries` stores session reference, owner, summary text, status, visibility flag, version or revision metadata, and timestamps. Summary statuses are constrained, for example `draft`, `ready`, `stale`, and `deleted`. Summary rows are private content and are purged when a session is deleted.

#### 5. Trial Claim Contract

**File**: `supabase/migrations/20260606120000_create_private_session_data_boundary.sql`

**Intent**: Enforce one free 15-minute session at the database boundary rather than relying on UI state.

**Contract**: Add a database-backed trial claim using `session_trial_claims` and/or a unique partial index that guarantees one free-trial claim per user. The claim is linked to a session and cannot be recreated by deleting private message content. If implemented as an RPC, it must use `auth.uid()`, a fixed `search_path`, and safe return fields only.

#### 6. RLS Policies

**File**: `supabase/migrations/20260606120000_create_private_session_data_boundary.sql`

**Intent**: Make every private data table owner-only by default.

**Contract**: Enable RLS on every new table before policies are created. Add authenticated owner-only policies using `(select auth.uid()) = user_id` for the operations future server helpers need. Do not add anonymous policies, public policies, broad admin policies, or service-role assumptions.

#### 7. Column Grants And Database-Owned Metadata

**File**: `supabase/migrations/20260606120000_create_private_session_data_boundary.sql`

**Intent**: Prevent authenticated clients from spoofing metadata, timestamps, lifecycle fields, or ownership fields.

**Contract**: Use column-level grants for write operations wherever metadata fields exist. `created_at`, `updated_at`, lifecycle mutation fields, deletion timestamps, and trial claim metadata are database-owned or helper-owned. Follow the hardening precedent from `supabase/migrations/20260604202000_harden_user_avatar_choice_timestamps.sql`.

#### 8. No Content Admin Access

**File**: `supabase/migrations/20260606120000_create_private_session_data_boundary.sql`

**Intent**: Preserve the PRD admin boundary before private content exists.

**Contract**: Do not create admin-readable views, admin policies, or grants exposing message/summary content. If any safe aggregate helper/view is added, it must exclude message text, summary text, prompts, provider payloads, emails, and exact user-facing content.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully after the migration is added.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search confirms RLS is enabled for every new private table.
- Source search confirms no `anon` policy or grant exists for private session tables.
- Source search confirms no `SUPABASE_SERVICE_ROLE_KEY` or service-role runtime dependency was added.
- Source search confirms private table write grants are column-level where metadata exists.
- Source search confirms no `/api/session`, `/api/chat`, session UI, history UI, or timer UI route was added.

#### Manual Verification:

- Review the migration and confirm every private table is owner-only before applying it to hosted Supabase.
- Confirm deletion tombstone fields do not include message text, summary text, title, preview, prompt, provider payload, or modality/avatar details.
- If hosted migration is applied during implementation, record the environment, command, and result in the change folder; otherwise leave hosted migration evidence pending.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding `- [ ]` checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Server-Only Session Data Contract

### Overview

Add the TypeScript boundary future session routes must use: domain types, safe errors, auth guard, and repository helpers. Do not add public route handlers.

### Changes Required:

#### 1. Domain Types

**File**: `src/lib/session-data/types.ts`

**Intent**: Give future session code a stable TypeScript contract that mirrors the database without exposing raw Supabase rows everywhere.

**Contract**: Export domain types for session lifecycle, message role, summary status, session IDs, message records, summary records, trial claim state, tombstone shape, and deletion reason codes. The public domain types should distinguish private content records from safe metadata/tombstone records.

#### 2. Safe Error Codes

**File**: `src/lib/session-data/errors.ts`

**Intent**: Keep private data failures safe and stable, following the existing auth/avatar error-code pattern.

**Contract**: Export stable reason/error codes such as `session_data_unavailable`, `missing_auth`, `session_not_found`, `not_session_owner`, `trial_already_claimed`, `invalid_lifecycle_transition`, `delete_failed`, and `write_failed`. Do not expose raw Supabase error messages as user-facing or loggable values.

#### 3. Auth Guard

**File**: `src/lib/session-data/auth.ts`

**Intent**: Provide a per-handler authentication contract for future private session routes.

**Contract**: Export a helper that receives an Astro route context or the existing request/cookie inputs, verifies Supabase config and `context.locals.user`, and returns a safe authenticated session-data context with `user.id` and a Supabase client. This helper is the required entry point for future `/api/session` or `/api/chat` work.

#### 4. Session Repository

**File**: `src/lib/session-data/repository.ts`

**Intent**: Centralize owner-bound reads/writes for sessions, messages, and summaries.

**Contract**: Export functions for creating a pending session record, reading a user's session metadata, transitioning lifecycle status, appending a message, listing messages for an owned session, creating/updating a visible summary, listing summaries for an owned session, and reading safe tombstone metadata. Functions accept an authenticated session-data context and return domain results with safe error codes.

#### 5. Typegen Handoff

**File**: `src/lib/session-data/README.md`

**Intent**: Document how to add generated Supabase `Database` types later without blocking F-01.

**Contract**: Explain that F-01 uses domain types now. Include the expected future typegen command/path once local or hosted Supabase is available, and state that generated DB types should reinforce, not replace, the privacy boundary.

#### 6. Boundary README

**File**: `src/lib/session-data/README.md`

**Intent**: Make the F-01 boundary hard to bypass during S-04/S-05/S-06/S-07.

**Contract**: Document that future code must call the auth guard before touching private tables, must call the quota helper before starting a free trial, must append messages through repository helpers, must create user-visible summaries through summary helpers, must delete through the deletion helper, and must never log raw message/summary content.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search confirms `src/lib/session-data/` is the only new session-data TypeScript module family.
- Source search confirms no public route handler imports the new repository yet.
- Source search confirms no `console.log`, `console.error`, `console.warn`, or `console.info` was added for private message/summary content.
- Source search confirms helper error returns use stable codes, not raw Supabase messages.

#### Manual Verification:

- Review `src/lib/session-data/README.md` and confirm future S-04/S-05/S-06/S-07 usage rules are explicit.
- Confirm the helper contract does not require `user.email`, cookies, provider tokens, or service-role secrets.
- Confirm domain types separate private content from safe tombstone/metadata shapes.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Deletion And Trial Enforcement

### Overview

Implement the highest-risk behavior in the helper layer: deletion that removes private content while keeping only a minimal tombstone, and one-free-session claiming that is database-backed and race-resistant.

### Changes Required:

#### 1. Deletion Helper

**File**: `src/lib/session-data/deletion.ts`

**Intent**: Encode the agreed deletion model in one place so future history UI cannot leave private content behind by accident.

**Contract**: Export a helper that marks an owned session as `deleted`, deletes or purges associated `session_messages` and `session_summaries`, clears any session fields that could reveal content or modality/avatar details after deletion, and returns only a safe tombstone shape. It must reject missing auth, missing session, non-owner access, and already-deleted sessions with stable codes.

#### 2. Deletion Repository Operations

**File**: `src/lib/session-data/repository.ts`

**Intent**: Support deletion through the same owner-bound repository boundary.

**Contract**: Add repository operations needed by `deletion.ts` to purge messages, purge summaries, and update session tombstone fields. These operations must not expose raw deleted content to callers.

#### 3. Trial Quota Helper

**File**: `src/lib/session-data/quota.ts`

**Intent**: Provide the single future entry point for claiming the one free 15-minute session.

**Contract**: Export helpers for reading trial availability and claiming a free trial session. Claiming must use the DB-backed claim/unique constraint/RPC contract from Phase 1 and must return `trial_already_claimed` on conflict rather than relying on UI checks.

#### 4. Session Start Handoff

**File**: `src/lib/session-data/README.md`

**Intent**: Specify how future S-04 starts a free session without building S-04 now.

**Contract**: Document the required future order: authenticate per handler, load current avatar choice if needed, claim free trial/create session through F-01, evaluate F-02 safety before ordinary AI generation, and use F-03 logging helpers if present without logging private content.

#### 5. Legal/Safety Exception Non-Goal

**File**: `src/lib/session-data/README.md`

**Intent**: Prevent "narrow legal or safety exceptions" from becoming implicit admin access in F-01.

**Contract**: State that F-01 implements no break-glass content access. Any future legal/safety exception mechanism requires a separate plan with explicit authorization, audit trail, minimization, and owner approval.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search confirms deletion helper removes message and summary content rather than only setting UI-visible flags.
- Source search confirms deleted-session tombstone code does not include message text, summary text, title, preview, prompt, provider payload, or modality/avatar detail.
- Source search confirms quota claim code handles duplicate/free-trial conflict through a stable code.
- Source search confirms no public session/chat/history endpoint was added.

#### Manual Verification:

- Review deletion helper intent and confirm it matches "soft-delete session plus hard-delete private content."
- Review quota helper and confirm the one-free-session limit is enforced by the database contract, not by UI state.
- Confirm the README explicitly defers break-glass/legal/safety content access to a future audited change.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Tests, Source Sweeps, And Docs

### Overview

Add minimal tests for pure helper logic, update CI only if a test command is introduced, and run privacy-focused source sweeps.

### Changes Required:

#### 1. Minimal Test Runner

**File**: `package.json`, `package-lock.json`, `vitest.config.ts`

**Intent**: Test the high-risk helper logic without requiring Supabase, Docker, browser E2E, OpenRouter, or network calls.

**Contract**: If F-02 or F-03 has already added Vitest by implementation time, reuse the existing setup. Otherwise add minimal Vitest and a script such as `test` or `test:session-data`. Keep tests isolated to pure helper logic and test doubles.

#### 2. Session Data Tests

**File**: `src/lib/session-data/__tests__/*.test.ts`

**Intent**: Cover deletion, quota, lifecycle, and error-code behavior.

**Contract**: Add tests for valid lifecycle transitions, invalid lifecycle transitions, trial availability, duplicate trial claim mapping, deletion tombstone shape, purge operation ordering through test doubles, and safe error-code mapping. Tests must not read real Supabase env, call a real database, call a network, or include real private conversation text.

#### 3. CI Test Command

**File**: `.github/workflows/ci.yml`

**Intent**: Run the minimal unit tests in CI if F-01 introduces the first test runner.

**Contract**: Add the selected test command after install and before lint/build. CI must not require hosted Supabase, OpenRouter, Cloudflare, service-role secrets, or local Docker for these tests.

#### 4. Deployment And Migration Notes

**File**: `context/deployment/deploy-plan.md`, `README.md`

**Intent**: Keep deployment docs aligned with the new private-data migration and evidence expectations.

**Contract**: Document that F-01 adds pending Supabase migrations pushed through the existing Session Pooler CI job. Do not add new runtime secrets. State that hosted migration evidence must be recorded when the migration is actually applied.

#### 5. Privacy Source Sweeps

**File**: `context/changes/private-session-data-boundary/plan.md`

**Intent**: Make final verification explicit for future implementers and reviewers.

**Contract**: Keep final verification checks in the `## Progress` section. Sweeps must cover service-role keys, anonymous policies, broad grants, console logging of private content, public session/chat routes, admin content access, and route/UI scope creep.

### Success Criteria:

#### Automated Verification:

- `npm run test` or the selected session-data test command completes successfully if a test runner exists after implementation.
- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search confirms tests do not require real Supabase credentials or network calls.
- Source search confirms no service-role runtime secret was added.
- Source search confirms no new public session/chat/history route was added.
- Source search confirms no raw private content logging was added.
- Source search confirms no admin-readable content policy, view, or helper was added.
- Source search confirms migration docs mention hosted evidence when hosted migration is applied.

#### Manual Verification:

- Review the test setup and confirm it stays unit-level, not E2E or local-Supabase integration.
- Review README/deploy updates and confirm no new runtime secret is requested.
- Record hosted migration evidence in the change folder if hosted migration verification happens; otherwise keep the relevant manual evidence item pending.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Evidence And Closeout

### Overview

Close the plan with scope discipline, evidence discipline, and a clear handoff for future roadmap slices.

### Changes Required:

#### 1. Scope Sweep

**File**: `context/changes/private-session-data-boundary/plan.md`

**Intent**: Ensure F-01 remains a foundation and does not become S-04/S-05/S-06/S-07 implementation.

**Contract**: Final verification checks confirm no session UI, chat UI, timer UI, history UI, summary UI, AI provider call, paid flow, or admin dashboard was introduced.

#### 2. Evidence Notes

**File**: `context/changes/private-session-data-boundary/verification.md`

**Intent**: Avoid marking environment-dependent checks as complete without proof.

**Contract**: If implementation applies or tests hosted Supabase migrations, add a short verification note with date, environment, command, result, and limitations. If hosted checks are not run, the note must say that explicitly and the relevant Progress item remains pending.

#### 3. Future Slice Handoff

**File**: `src/lib/session-data/README.md`

**Intent**: Make the next roadmap work clear and narrow.

**Contract**: Add handoff sections for S-04 first timed session, S-05 session history deletion, S-06 summary-backed next session, and S-07 private admin operations. Each section states which F-01 helper or table contract it must use and which private-data behaviors it must not bypass.

#### 4. Change Status

**File**: `context/changes/private-session-data-boundary/change.md`

**Intent**: Keep the change artifact lifecycle accurate.

**Contract**: `/10x-implement` may move status from `planned` to later states as implementation proceeds. The plan itself starts with `status: planned` and `updated: 2026-06-06`.

### Success Criteria:

#### Automated Verification:

- `git diff --check` passes.
- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Final scope sweep confirms no S-04/S-05/S-06/S-07 UI or route was introduced.
- Final privacy sweep confirms no service-role runtime secret, anonymous private-table policy, broad content admin access, or private content logging was introduced.
- `context/changes/private-session-data-boundary/plan.md` and `plan-brief.md` exist.

#### Manual Verification:

- Review `verification.md` if present and confirm manual hosted/environment claims are evidence-backed.
- Confirm any manual hosted migration item without evidence remains pending.
- Confirm the future slice handoff is understandable before starting `/10x-implement private-session-data-boundary phase 1`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before considering the change implemented.

---

## Testing Strategy

### Unit Tests:

- Test domain lifecycle validation and invalid transition handling.
- Test safe error-code mapping for quota, deletion, missing auth, missing session, and write failures.
- Test quota helper behavior with mocked claim success and duplicate-claim conflict.
- Test deletion helper behavior with mocked repository calls, including purge ordering and tombstone output.
- Test that tombstone output does not include content-like fields.

### Integration Tests:

- No browser E2E or local Supabase integration test is required in F-01.
- SQL/RLS behavior is verified through source sweeps and manual migration review in this phase.
- Future S-04 should add endpoint-level integration tests once session endpoints exist.

### Manual Testing Steps:

1. Review the migration before applying it to any hosted Supabase project.
2. Confirm every private table has RLS enabled and owner-only authenticated policies.
3. Confirm column grants do not allow client writes to database-owned metadata.
4. Confirm deletion semantics remove private message and summary content while retaining only the minimal tombstone.
5. Confirm trial claim enforcement is database-backed and race-resistant by design.
6. Confirm no UI, public route, admin route, AI provider integration, or service-role runtime secret entered the scope.
7. If hosted migration is applied, record the command, environment, result, and limitations in `verification.md`.

## Performance Considerations

Private session reads should be scoped by `user_id` and `session_id`, with predictable ordering for messages by sequence/created time. Add indexes for owner/session lookup, message ordering, summary lookup, lifecycle/status filtering, and trial claim uniqueness. Avoid heavy JSON payloads, embeddings, or raw provider blobs in F-01. Future S-04 should stream/generate AI separately and only append final private messages through this boundary.

## Migration Notes

This is a forward-only Supabase migration. The safe rollback for F-01 before user-facing session features exist is to avoid using the helper layer in future routes until review passes, not to drop private-data tables after they may contain sensitive records. Hosted migration verification is owner/environment dependent; if it is not run during implementation, keep that limitation explicit.

Do not add `SUPABASE_SERVICE_ROLE_KEY` to `.env.example`, `.dev.vars`, Wrangler secrets, GitHub Actions, or runtime code. Existing Supabase Session Pooler migration secrets remain the deployment mechanism.

## References

- F-01 roadmap item: `context/foundation/roadmap.md:32`
- F-01 details: `context/foundation/roadmap.md:67`
- Roadmap baseline for missing session/history/AI/admin endpoints: `context/foundation/roadmap.md:59`
- PRD free-session requirement: `context/foundation/prd.md:74`
- PRD history and summaries requirement: `context/foundation/prd.md:83`
- PRD admin privacy requirement: `context/foundation/prd.md:97`
- Existing Supabase SSR client: `src/lib/supabase.ts:5`
- Existing protected route middleware: `src/middleware.ts:5`
- Existing avatar write handler auth pattern: `src/pages/api/profile/avatar.ts:12`
- Existing owner-only RLS pattern: `supabase/migrations/20260531223000_create_user_avatar_choices.sql:37`
- Existing column-grant hardening pattern: `supabase/migrations/20260604202000_harden_user_avatar_choice_timestamps.sql:1`
- Current CI migration push path: `.github/workflows/ci.yml:29`
- Current deploy migration notes: `context/deployment/deploy-plan.md:7`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` - <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Private Session Schema And RLS

#### Automated

- [x] 1.1 `npx astro sync` completes successfully after the migration is added. — 46e7dcf
- [x] 1.2 `npm run lint` completes successfully. — 46e7dcf
- [x] 1.3 `npm run build` completes successfully. — 46e7dcf
- [x] 1.4 Source search confirms RLS is enabled for every new private table. — 46e7dcf
- [x] 1.5 Source search confirms no `anon` policy or grant exists for private session tables. — 46e7dcf
- [x] 1.6 Source search confirms no `SUPABASE_SERVICE_ROLE_KEY` or service-role runtime dependency was added. — 46e7dcf
- [x] 1.7 Source search confirms private table write grants are column-level where metadata exists. — 46e7dcf
- [x] 1.8 Source search confirms no `/api/session`, `/api/chat`, session UI, history UI, or timer UI route was added. — 46e7dcf

#### Manual

- [x] 1.9 Review the migration and confirm every private table is owner-only before applying it to hosted Supabase. — 46e7dcf
- [x] 1.10 Confirm deletion tombstone fields do not include message text, summary text, title, preview, prompt, provider payload, or modality/avatar details. — 46e7dcf
- [ ] 1.11 If hosted migration is applied during implementation, record the environment, command, and result in the change folder; otherwise leave hosted migration evidence pending.

### Phase 2: Server-Only Session Data Contract

#### Automated

- [x] 2.1 `npx astro sync` completes successfully. — 2adfd3a
- [x] 2.2 `npm run lint` completes successfully. — 2adfd3a
- [x] 2.3 `npm run build` completes successfully. — 2adfd3a
- [x] 2.4 Source search confirms `src/lib/session-data/` is the only new session-data TypeScript module family. — 2adfd3a
- [x] 2.5 Source search confirms no public route handler imports the new repository yet. — 2adfd3a
- [x] 2.6 Source search confirms no `console.log`, `console.error`, `console.warn`, or `console.info` was added for private message/summary content. — 2adfd3a
- [x] 2.7 Source search confirms helper error returns use stable codes, not raw Supabase messages. — 2adfd3a

#### Manual

- [x] 2.8 Review `src/lib/session-data/README.md` and confirm future S-04/S-05/S-06/S-07 usage rules are explicit. — 2adfd3a
- [x] 2.9 Confirm the helper contract does not require `user.email`, cookies, provider tokens, or service-role secrets. — 2adfd3a
- [x] 2.10 Confirm domain types separate private content from safe tombstone/metadata shapes. — 2adfd3a

### Phase 3: Deletion And Trial Enforcement

#### Automated

- [x] 3.1 `npx astro sync` completes successfully. — 695199b
- [x] 3.2 `npm run lint` completes successfully. — 695199b
- [x] 3.3 `npm run build` completes successfully. — 695199b
- [x] 3.4 Source search confirms deletion helper removes message and summary content rather than only setting UI-visible flags. — 695199b
- [x] 3.5 Source search confirms deleted-session tombstone code does not include message text, summary text, title, preview, prompt, provider payload, or modality/avatar detail. — 695199b
- [x] 3.6 Source search confirms quota claim code handles duplicate/free-trial conflict through a stable code. — 695199b
- [x] 3.7 Source search confirms no public session/chat/history endpoint was added. — 695199b

#### Manual

- [x] 3.8 Review deletion helper intent and confirm it matches "soft-delete session plus hard-delete private content." — 695199b
- [x] 3.9 Review quota helper and confirm the one-free-session limit is enforced by the database contract, not by UI state. — 695199b
- [x] 3.10 Confirm the README explicitly defers break-glass/legal/safety content access to a future audited change. — 695199b

### Phase 4: Tests, Source Sweeps, And Docs

#### Automated

- [x] 4.1 `npm run test` or the selected session-data test command completes successfully if a test runner exists after implementation.
- [x] 4.2 `npx astro sync` completes successfully.
- [x] 4.3 `npm run lint` completes successfully.
- [x] 4.4 `npm run build` completes successfully.
- [x] 4.5 Source search confirms tests do not require real Supabase credentials or network calls.
- [x] 4.6 Source search confirms no service-role runtime secret was added.
- [x] 4.7 Source search confirms no new public session/chat/history route was added.
- [x] 4.8 Source search confirms no raw private content logging was added.
- [x] 4.9 Source search confirms no admin-readable content policy, view, or helper was added.
- [x] 4.10 Source search confirms migration docs mention hosted evidence when hosted migration is applied.

#### Manual

- [x] 4.11 Review the test setup and confirm it stays unit-level, not E2E or local-Supabase integration.
- [x] 4.12 Review README/deploy updates and confirm no new runtime secret is requested.
- [ ] 4.13 Record hosted migration evidence in the change folder if hosted migration verification happens; otherwise keep the relevant manual evidence item pending.

### Phase 5: Evidence And Closeout

#### Automated

- [ ] 5.1 `git diff --check` passes.
- [ ] 5.2 `npx astro sync` completes successfully.
- [ ] 5.3 `npm run lint` completes successfully.
- [ ] 5.4 `npm run build` completes successfully.
- [ ] 5.5 Final scope sweep confirms no S-04/S-05/S-06/S-07 UI or route was introduced.
- [ ] 5.6 Final privacy sweep confirms no service-role runtime secret, anonymous private-table policy, broad content admin access, or private content logging was introduced.
- [ ] 5.7 `context/changes/private-session-data-boundary/plan.md` and `plan-brief.md` exist.

#### Manual

- [ ] 5.8 Review `verification.md` if present and confirm manual hosted/environment claims are evidence-backed.
- [ ] 5.9 Confirm any manual hosted migration item without evidence remains pending.
- [ ] 5.10 Confirm the future slice handoff is understandable before starting `/10x-implement private-session-data-boundary phase 1`.
