# Private Session Data Boundary - Plan Brief

> Full plan: `context/changes/private-session-data-boundary/plan.md`

## What & Why

Implement F-01 from the roadmap: SafeSpace needs a private data boundary for session memory, summaries, deletion control, and one free timed session before the first real chat flow exists. This matters because later S-04/S-05/S-06/S-07 work will store sensitive conversation data, and the privacy/admin boundary must be fixed before user messages are persisted.

## Starting Point

SafeSpace already has Supabase SSR auth, protected `/dashboard` and `/account` routes, and one owner-only app table for avatar choice. There are no session, message, history, summary, trial quota, or admin content tables/endpoints yet.

## Desired End State

The repo has a forward-only Supabase migration for private session data with owner-only RLS, column-level grants, lifecycle statuses, user-visible summaries, deletion semantics, and a database-backed one-free-session claim. Server-only TypeScript helpers expose the safe contract for future S-04/S-05/S-06/S-07 code without adding chat UI, session API routes, history UI, AI calls, or admin content access.

## Key Decisions Made

| Decision             | Choice                                                                | Why                                                                                    | Source         |
| -------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------- |
| F-01 scope           | DB contract plus server-only helper layer, no UI/endpoints            | Covers the roadmap foundation without implementing S-04/S-05 prematurely.              | Roadmap / Plan |
| Data model           | Sessions, messages, summaries, and trial claim/quota                  | F-01 must cover private memory, summaries, deletion, and one free session.             | Roadmap / Plan |
| Deletion             | Soft-delete session tombstone, hard-delete private content            | Preserves trial/stat counters while removing messages and summaries.                   | Plan           |
| Session lifecycle    | `created`, `active`, `completed`, `expired`, `interrupted`, `deleted` | Supports timer, crisis interruption, and history without a full workflow engine.       | Plan           |
| Trial enforcement    | Database-backed claim plus unique constraint/RPC contract             | Prevents UI bypass and race conditions around the one free session.                    | PRD / Plan     |
| Messages             | Table plus typed append/list helper contracts                         | Future S-04 gets a safe server-side pattern instead of inventing direct queries.       | Plan           |
| Summaries            | Separate summary table with status and visibility                     | Separates raw content from user-visible summaries and supports S-06.                   | PRD / Plan     |
| Admin content access | No break-glass implementation in F-01                                 | Exceptions require a separate audited plan, not broad default access.                  | PRD / Plan     |
| Tests                | Minimal Vitest for helpers plus SQL/source sweeps                     | Protects quota/deletion logic without requiring Supabase E2E yet.                      | Plan           |
| DB types             | Domain types now, optional typegen handoff                            | Keeps implementation unblocked when local/hosted Supabase is unavailable.              | Plan           |
| Rollback             | Forward-only migration plus hold/disable handoff                      | Fits current Supabase CI and is safe because F-01 exposes no user-facing session flow. | Deploy / Plan  |

## Scope

**In scope:**

- Supabase migration for `therapy_sessions`, `session_messages`, `session_summaries`, and free trial claim/quota.
- Owner-only RLS, no anonymous policies, no broad admin content access, no service-role runtime dependency.
- Column-level grants and database-owned timestamps/status fields.
- Server-only `src/lib/session-data/` domain types, auth guard, safe error codes, repository helpers, quota helpers, deletion helpers, and README handoff.
- Minimal tests for pure helper logic and final SQL/source sweeps.

**Out of scope:**

- Chat UI, timer UI, streaming, AI generation, OpenRouter calls, crisis classifier integration, history page, summary generation UI, paid flow, or admin dashboard.
- Break-glass legal/safety content access.
- Generated Supabase `Database` types as a blocking requirement.
- Full local Supabase integration/E2E test suite.

## Architecture / Approach

F-01 adds a database-first privacy boundary, then wraps it in server-only TypeScript helpers. Future session endpoints must authenticate per handler, create sessions through the quota-aware boundary, append private messages through repository helpers, create user-visible summaries through summary helpers, and delete sessions through the deletion helper that purges private content while retaining only a minimal tombstone.

## Phases at a Glance

| Phase                                | What it delivers                                                                  | Key risk                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1. Private Session Schema And RLS    | Tables, lifecycle statuses, owner-only policies, column grants, DB-owned metadata | A policy/grant could expose or allow mutation of sensitive fields.            |
| 2. Server-Only Session Data Contract | Domain types, auth guard, safe errors, repository helpers, typegen handoff        | Future code could bypass helpers and query private tables directly.           |
| 3. Deletion And Trial Enforcement    | Soft-delete/hard-purge helper and one-free-session claim contract                 | Deletion could keep too much data or trial claim could race.                  |
| 4. Tests, Sweeps, And Docs           | Minimal Vitest, SQL/source sweeps, README/deploy handoff                          | Tests could avoid the highest-risk helper paths or require external services. |
| 5. Evidence And Closeout             | Manual evidence discipline and final plan handoff                                 | Hosted migration checks could be marked done without proof.                   |

**Prerequisites:** Existing Supabase auth/dashboard/S-03 avatar table, current CI migration path, and owner approval to apply a new private-data migration.
**Estimated effort:** ~2-3 implementation sessions across 5 phases, plus owner time if hosted Supabase migration evidence is required.

## Open Risks & Assumptions

- F-02/F-03 may land before or after F-01; F-01 should not depend on their implementation, but must not conflict with their safety/logging contracts.
- Current CI pushes migrations on `main`, so hosted migration evidence depends on GitHub/Supabase secrets owned by the user.
- Exact legal/safety exception handling is intentionally deferred; adding it later must be a separate audited change.
- Generated Supabase DB types are useful but not required to complete F-01.

## Success Criteria (Summary)

- Future S-04 can create exactly one free trial session and append/list private messages only through owner-bound server helpers.
- Future S-05 can delete a session so private messages and summaries are removed while only a minimal tombstone remains.
- Source sweeps show no chat/session UI, no public session endpoint, no private content logging, no service-role runtime secret, and no admin content access.
