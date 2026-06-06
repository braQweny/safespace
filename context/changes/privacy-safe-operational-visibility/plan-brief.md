# Privacy-safe Operational Visibility — Plan Brief

> Full plan: `context/changes/privacy-safe-operational-visibility/plan.md`

## What & Why

Build F-03 from the roadmap: SafeSpace needs to diagnose critical flow errors and state without logging private conversation content. This matters before S-04, because the first real session will involve sensitive user text, AI provider failures, safety decisions, timing, and future admin/statistics boundaries.

## Starting Point

Cloudflare Worker observability is already enabled, and the app has safe auth/avatar error-code helpers. What is missing is app-level request correlation, a safe structured event contract, a logger that cannot accept private fields, and future S-04 lifecycle event names.

## Desired End State

Server code can emit safe JSON operational events to Cloudflare Workers Logs with `requestId`, route/method/outcome metadata, safe reason codes, optional salted `userHash`, and duration/status fields. No event stores user messages, prompts, AI output, summaries, emails, tokens, cookies, raw provider payloads, raw database errors, or selected modality details.

## Key Decisions Made

| Decision            | Choice                                  | Why                                                                                                    |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| First scope         | Auth + avatar + future session contract | Covers current critical flows and the S-04 north-star dependency without building session/admin scope. |
| Event destination   | Structured Cloudflare Worker logs       | Matches existing `wrangler.jsonc` observability and avoids a new sensitive event table.                |
| User correlation    | Salted hashed user ID                   | Gives debug correlation without logging raw Supabase UUIDs or emails.                                  |
| Redaction model     | Field allowlist                         | Safer for mental-health-adjacent data than relying on blocklists or developer convention.              |
| Request correlation | Middleware `requestId`                  | Lets middleware, redirects, API routes, and future session handlers share one safe debug key.          |
| Logger failure mode | Best-effort, never blocks flow          | Observability cannot break sign-in, avatar choice, or future session start.                            |
| Future S-04 events  | Lifecycle without content               | Provides session/safety/provider/timer visibility while excluding private messages and prompts.        |
| Verification        | Minimal unit tests + source sweeps      | Protects the privacy boundary before S-04 depends on it.                                               |

## Scope

**In scope:**

- Operational event types and allowlisted fields.
- Sanitizer/redaction guard for denied private field names.
- Optional `OPERATIONAL_LOG_HASH_SECRET` and pseudonymous `userHash`.
- Middleware-generated `requestId` and safe response header.
- Best-effort structured logger using Workers Logs.
- Instrumentation for auth, OAuth, sign-out/password, protected redirects, and avatar choice.
- Future S-04/F-02 lifecycle event helpers and README handoff.
- Minimal unit tests, CI test command, source sweeps, and docs.

**Out of scope:**

- Supabase operational event table, log warehouse, APM, alerts, Tail Worker, Logpush, Analytics Engine.
- Admin dashboard/statistics UI.
- Chat/session/timer/history/summary implementation.
- Logging private conversation content, prompts, AI output, emails, tokens, cookies, raw errors, or modality IDs.

## Architecture / Approach

F-03 adds `src/lib/operational-visibility/` as the only approved server-side operational logging layer. Middleware creates `requestId`; route handlers pass safe outcome/reason metadata into helper functions; the sanitizer enforces an allowlist; the logger emits structured JSON through `console.log()` for Cloudflare Workers Logs. Future S-04 uses exported session event helpers instead of inventing its own logs.

## Phases at a Glance

| Phase                                      | What it delivers                                                      | Key risk                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1. Safe Event Contract And Redaction       | Event names, field allowlist, sanitizer, user hash contract           | Allowlist could be too loose and permit sensitive metadata.               |
| 2. Request Context And Logger Runtime      | Middleware `requestId`, best-effort JSON logger, Worker config review | Logger failure or request context could accidentally affect product flow. |
| 3. Instrument Existing Critical Flows      | Safe auth/avatar/protected-route events                               | Raw form/provider/database details could slip into events.                |
| 4. Future S-04/F-02 Observability Contract | Session lifecycle helpers and handoff README                          | Future session code could bypass the safe event API.                      |
| 5. Tests, Sweeps, And Docs                 | Unit tests, CI command, source sweeps, README/deploy updates          | Test setup could grow beyond the narrow privacy boundary.                 |

**Prerequisites:** Existing Cloudflare Workers deployment config, Supabase auth/avatar code, and owner approval to add optional `OPERATIONAL_LOG_HASH_SECRET` for hosted correlation.
**Estimated effort:** ~2 implementation sessions across 5 phases.

## Open Risks & Assumptions

- Cloudflare Workers Logs are still readable by people with Cloudflare access; S-07 must use aggregates, not raw private-adjacent logs.
- If `OPERATIONAL_LOG_HASH_SECRET` is missing, user-level correlation is omitted by design.
- Source sweeps must be reviewed carefully because terms like `message` and `email` legitimately exist in auth UI code outside operational event payloads.
- F-02/F-03 ordering may vary; F-03 should link to F-02 README only if F-02 has landed by implementation time.

## Success Criteria (Summary)

- Existing auth/avatar flows emit safe structured events with request correlation and no private data.
- Future S-04 has a clear lifecycle event contract before chat/session code exists.
- Tests and source sweeps prove the logger is allowlist-driven, best-effort, and unable to emit raw user text, prompts, emails, tokens, cookies, or raw provider/database errors.
