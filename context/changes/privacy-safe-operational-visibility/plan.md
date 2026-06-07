# Privacy-safe Operational Visibility Implementation Plan

## Overview

Implement F-03: privacy-safe operational visibility for SafeSpace. The change adds a small server-side observability layer that can diagnose auth, avatar-choice, and future session flow health through structured Cloudflare Worker logs without writing private conversation content, prompts, emails, tokens, cookies, raw provider payloads, or raw Supabase errors.

## Current State Analysis

SafeSpace already runs as Astro SSR on Cloudflare Workers, with `observability.enabled` set in Wrangler and CI/deploy handled by GitHub Actions. The app has Supabase SSR auth, protected dashboard middleware, stable auth/avatar error code helpers, and one application table for avatar choice. It does not yet have app-level privacy-safe logging, request correlation, session/chat endpoints, admin observability, or a durable operational event store.

Cloudflare Workers Logs can ingest custom `console.log()` output and Cloudflare recommends structured JSON logging for searchable fields. That fits the user's selected first implementation: emit safe structured Worker logs rather than creating a Supabase `operational_events` table.

## Desired End State

The repo exposes a single operational visibility contract for server-side code. Each critical route can emit an allowlisted structured event with a `requestId`, route/method/outcome metadata, safe reason codes, duration fields where useful, and an optional salted hash of the authenticated Supabase user ID. The logger is best-effort: it catches its own failures and never blocks auth, avatar, or future session flows.

Future S-04 code has a named event vocabulary for session lifecycle and F-02 safety decisions, but F-03 does not implement chat, timer, AI streaming, history, summaries, or admin dashboards. No event stores user message text, prompt text, generated answer text, email address, auth token, cookie, raw provider body, raw database error, or selected modality/avatar details.

### Key Discoveries:

- Roadmap F-03 requires diagnosing critical flow errors and state without logging conversation content: `context/foundation/roadmap.md:34`.
- Roadmap says app-level privacy-safe logging and flow health are not yet present, while platform observability is partial: `context/foundation/roadmap.md:63`.
- F-03 unlocks S-04 and S-07 through a named verification path for auth/session/admin flows without private conversation logs: `context/foundation/roadmap.md:93`.
- PRD guardrails prohibit admin access to private conversation contents except narrow legal or safety exceptions: `context/foundation/prd.md:47`.
- PRD FR-010 repeats that admin user management must not expose private conversation contents: `context/foundation/prd.md:97`.
- PRD Non-Functional Requirements say private conversation content is not available to admins and crisis handling interrupts ordinary simulation: `context/foundation/prd.md:102`.
- Infrastructure research names prompt/request/AI-response logging as a privacy incident risk: `context/foundation/infrastructure.md:67`.
- Infrastructure mitigation says to log request IDs, statuses, and timings, never conversation content, prompts, or tokens: `context/foundation/infrastructure.md:96`.
- `wrangler.jsonc` already enables Workers observability: `wrangler.jsonc:15`.
- `App.Locals` currently carries only `user`, so F-03 must add request context explicitly: `src/env.d.ts:1`.
- Middleware is the central place where Supabase auth is resolved for protected routes: `src/middleware.ts:11`.
- Existing auth errors already map raw provider failures to stable user-safe codes: `src/lib/auth-errors.ts:1`.
- Avatar-choice errors already use stable safe codes instead of raw database messages: `src/lib/avatar-choice-errors.ts:1`.
- `package.json` has no test script today, so F-03 must either reuse a test runner added by F-02 or introduce a minimal Vitest setup: `package.json:5`.
- Cloudflare Workers Logs documentation says Workers Logs ingest custom logs from `console.log()` and recommends logging structured JSON objects for queryable fields: `https://developers.cloudflare.com/workers/observability/logs/workers-logs/`.
- Cloudflare real-time logs can be viewed with `npx wrangler tail`, whose output is structured JSON: `https://developers.cloudflare.com/workers/observability/logs/real-time-logs/`.
- Cloudflare Workers expose Web Crypto through `crypto.subtle`, which supports Worker-compatible hashing/HMAC implementation without Node-only crypto dependencies: `https://developers.cloudflare.com/workers/runtime-apis/web-crypto/`.

## What We're NOT Doing

- No Supabase `operational_events` table, RLS policies for logs, log retention database, or analytics warehouse.
- No admin dashboard, admin statistics UI, alerting system, APM integration, Tail Worker, Logpush, Analytics Engine, or third-party observability provider.
- No chat UI, session route, message API, timer, streaming response, history, summary, or paid-account instrumentation beyond future event contracts.
- No logging of private conversation content, user messages, prompts, classifier input/output text, generated AI responses, session summaries, emails, tokens, cookies, authorization headers, raw Supabase errors, or raw OpenRouter/provider payloads.
- No logging of selected modality/avatar IDs as operational metadata; avatar flow events use coarse outcome/reason codes only.
- No behavior that blocks product flows if the logger, hashing secret, or Workers Logs collection is unavailable.
- No broad admin access to operational logs through application code; S-07 must define any admin-facing aggregate view separately.

## Implementation Approach

Build a narrow server-only observability layer under `src/lib/operational-visibility/`. First define the event names, allowlisted payload fields, denied private field names, and user hash contract. Then add request context in middleware and a best-effort structured logger that writes safe JSON objects to Worker logs. Next instrument existing auth and avatar routes with safe lifecycle events. Then define future S-04/F-02 session lifecycle event helpers without implementing the session. Finish with minimal unit tests, source sweeps, and documentation that explain how to use Workers Logs and `wrangler tail` without leaking private data.

## Critical Implementation Details

### Debug & observability

Cloudflare Workers Logs index structured JSON object fields, so F-03 should log objects through one wrapper instead of scattering string-based `console.log()` calls. The wrapper must be the only approved application log emitter for operational events.

### State sequencing

Middleware should create `requestId` before auth resolution and attach it to `Astro.locals` so protected-route redirects, auth route handlers, avatar handlers, and future session handlers can all emit events under the same request. Logger failures are swallowed after a safe internal fallback, never rethrown into product flow.

### Security model

User correlation uses a salted one-way hash of Supabase `user.id`; the logger must never fall back to raw user ID when the hash secret is missing. If the hash secret is unavailable, omit `userHash` and emit only non-user-specific operational metadata.

## Phase 1: Safe Event Contract And Redaction

### Overview

Define the canonical event vocabulary, allowlisted fields, denied private field names, and pseudonymous user hash contract.

### Changes Required:

#### 1. Operational Event Types

**File**: `src/lib/operational-visibility/types.ts`

**Intent**: Create the single TypeScript contract for operational events so future code cannot invent unsafe fields or raw string payloads.

**Contract**: Export event names for current flows (`auth.signin`, `auth.signup`, `auth.oauth_start`, `auth.oauth_callback`, `auth.signout`, `auth.password_update`, `avatar.fetch`, `avatar.save`, `route.protected_redirect`) and future session flows (`session.start_attempted`, `session.safety_evaluated`, `session.ai_provider_failed`, `session.time_limit_reached`, `session.completed`). Export event levels, outcomes, safe reason-code types, and a base payload type limited to safe metadata.

#### 2. Allowlist And Denylist Contract

**File**: `src/lib/operational-visibility/allowed-fields.ts`

**Intent**: Make the logger allowlist-driven, matching the user's selected redaction policy.

**Contract**: Export the only event field names accepted by the logger: `event`, `level`, `requestId`, `route`, `method`, `status`, `outcome`, `reasonCode`, `durationMs`, `provider`, `riskState`, `action`, `userHash`, `deploymentTarget`, and `schemaVersion`. Export a denied-name check for sensitive keys including `message`, `prompt`, `content`, `email`, `token`, `cookie`, `authorization`, `password`, `secret`, `session`, `summary`, and raw `error`. The denied-name check guards both exact keys and obvious case-insensitive variants.

#### 3. Event Sanitizer

**File**: `src/lib/operational-visibility/sanitize-event.ts`

**Intent**: Drop or reject fields outside the allowlist before anything reaches `console.log()`.

**Contract**: Export `sanitizeOperationalEvent(input)` that returns a new object containing only approved keys and safe primitive values. Unknown keys are omitted. Denied private keys cause the sanitizer to mark the event as unsafe and return a safe diagnostic category instead of preserving the original value. No nested arbitrary objects are accepted.

#### 4. User Hash Helper

**File**: `src/lib/operational-visibility/user-hash.ts`

**Intent**: Support user-level correlation without logging raw Supabase UUIDs or emails.

**Contract**: Export an async helper that takes a Supabase user ID plus `OPERATIONAL_LOG_HASH_SECRET` and returns a stable one-way hash suitable for logs. Use Worker-compatible Web Crypto rather than Node-only crypto. If the secret is missing or the input is invalid, return `null`; never return the raw ID.

#### 5. Runtime Secret Schema

**File**: `astro.config.mjs`

**Intent**: Declare the optional server-only hash secret used by the user hash helper.

**Contract**: Add `OPERATIONAL_LOG_HASH_SECRET` as a server-only optional secret. Build must not require it. Production docs must state that setting it enables stable user correlation; missing secret omits `userHash`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search finds exactly one `OperationalEventName` definition.
- Source search confirms the operational event allowlist does not include `message`, `prompt`, `content`, `email`, `token`, `cookie`, `authorization`, `password`, `secret`, or raw `error`.
- Source search confirms user hashing never returns raw Supabase user IDs.

#### Manual Verification:

- Event names cover auth, avatar, protected-route, and future session lifecycle without implementing session features.
- The allowlist is strict enough that a caller cannot accidentally log form data, cookies, provider payloads, or private conversation text.
- Missing `OPERATIONAL_LOG_HASH_SECRET` omits user correlation rather than blocking the request or logging raw user IDs.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding `- [ ]` checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Request Context And Logger Runtime

### Overview

Add request correlation to Astro middleware and implement the best-effort Worker-log emitter.

### Changes Required:

#### 1. Locals Request Context

**File**: `src/env.d.ts`

**Intent**: Make request correlation available to pages and API routes through `Astro.locals`.

**Contract**: Extend `App.Locals` with `requestId: string` and a small operational context or logger function if the implementation chooses to attach one. Keep the existing `user` type unchanged.

#### 2. Request ID Middleware

**File**: `src/middleware.ts`

**Intent**: Assign one request ID per incoming request before auth resolution and route protection.

**Contract**: Generate a new ID with `crypto.randomUUID()` or another Worker-compatible random source, store it on `context.locals.requestId`, and attach a safe response header such as `X-SafeSpace-Request-Id` to normal responses and middleware redirects. Do not log headers, cookies, URLs with query strings containing private data, or request bodies.

#### 3. Best-effort Logger

**File**: `src/lib/operational-visibility/logger.ts`

**Intent**: Provide the only application-approved function that writes operational events to Worker logs.

**Contract**: Export `logOperationalEvent(event, context?)` or equivalent. It sanitizes the event, adds `schemaVersion`, emits a structured object through `console.log()`, and catches all internal failures. The logger must never throw to callers and must never call `console.log()` with raw strings or unsanitized objects.

#### 4. Request-scoped Helpers

**File**: `src/lib/operational-visibility/request-context.ts`

**Intent**: Keep route handlers small and consistent when adding request IDs, routes, methods, durations, and user hashes.

**Contract**: Export helpers for building safe context from an Astro API/page context. The helper may read `context.locals.user?.id` only to produce `userHash`; it must not read or pass through `user.email`, cookies, request body, query strings, or provider tokens.

#### 5. Workers Observability Config Review

**File**: `wrangler.jsonc`

**Intent**: Confirm the existing Worker observability setting is sufficient for F-03's first version.

**Contract**: Leave `observability.enabled` in place. Do not add Tail Workers, Logpush, or Analytics Engine. If the implementation adds `head_sampling_rate`, document why; default plan is to keep the current config unchanged.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search finds `requestId` typed in `src/env.d.ts` and assigned in `src/middleware.ts`.
- Source search finds exactly one application logger wrapper that calls `console.log`.
- Source search confirms no new logger code reads request body text, cookies, authorization headers, or query string payloads.

#### Manual Verification:

- Requests receive a safe request ID that can be used for support/debug correlation.
- Middleware redirects and normal responses both preserve request ID context.
- Logger failures cannot block sign-in, sign-up, sign-out, avatar choice, or future session flow.
- Worker observability remains Cloudflare-first and does not add an external log destination.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Instrument Existing Critical Flows

### Overview

Emit privacy-safe events from current auth and avatar flows using stable reason codes only.

### Changes Required:

#### 1. Auth Sign-in And Sign-up Events

**File**: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`

**Intent**: Make email/password auth failures and successes diagnosable without logging submitted emails, passwords, or raw Supabase messages.

**Contract**: Emit events for validation failure, Supabase unavailable, Supabase auth failure, and success. Event payloads use route, method, outcome, status, and existing safe auth error codes from `mapSignInError()` / `mapSignUpError()`. Do not log `email`, `password`, `confirmPassword`, raw `error.message`, or raw form data.

#### 2. OAuth Callback Events

**File**: `src/pages/api/auth/google.ts`, `src/pages/auth/callback.ts`

**Intent**: Diagnose Google OAuth start/callback failures without exposing provider query parameters or tokens.

**Contract**: Emit events for OAuth start success/failure, provider callback missing code, provider returned error, Supabase exchange failure, missing Supabase config, and callback success. Use safe reason codes such as `oauth_start_failed`, `oauth_callback_failed`, and `auth_not_configured`; do not log provider `error_description`, callback `code`, full URL, query string, or provider URL.

#### 3. Sign-out And Password Update Events

**File**: `src/pages/api/auth/signout.ts`, `src/pages/api/auth/password.ts`

**Intent**: Track account-security route health without exposing credentials or provider internals.

**Contract**: Emit success/failure events for sign-out and password update. Password update validation logs only safe reason codes such as `missing_password`, `password_too_short`, or `passwords_do_not_match`; it never logs password values or raw Supabase errors.

#### 4. Protected Route Redirect Event

**File**: `src/middleware.ts`

**Intent**: Make unauthorized attempts to protected product areas visible without logging identity or private URLs.

**Contract**: When an unauthenticated user is redirected from a protected route, emit `route.protected_redirect` with route bucket such as `/dashboard` or `/account`, method, outcome, and request ID. Do not log full URL, query params, cookies, referrer, IP address, or user agent.

#### 5. Avatar Choice Events

**File**: `src/pages/api/profile/avatar.ts`, `src/pages/dashboard/avatar.astro`, `src/pages/dashboard.astro`

**Intent**: Track avatar-choice fetch/save health without exposing the selected therapeutic modality or raw database errors.

**Contract**: Emit events for avatar fetch failure, invalid choice, missing auth, missing Supabase config, save failure, and save success. Payloads use coarse reason codes from `avatar-choice-errors.ts`. Do not log `modalityId`, `avatarId`, `avatarName`, SQL details, Supabase row contents, or raw `error` objects.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search confirms auth instrumentation does not pass `email`, `password`, `confirmPassword`, callback `code`, provider URL, or raw `error.message` into `logOperationalEvent`.
- Source search confirms avatar instrumentation does not pass `modalityId`, `avatarId`, selected row data, SQL details, or raw `error` objects into `logOperationalEvent`.
- Source search confirms no new `console.log` calls were added outside the operational visibility logger and approved tests.

#### Manual Verification:

- Sign-in/sign-up/OAuth/password/sign-out failures are diagnosable by safe event names and reason codes.
- Avatar fetch/save failures are diagnosable by safe event names and reason codes.
- A developer reading Worker logs cannot infer a user's email, selected modality, conversation content, cookies, or provider tokens from F-03 events.
- Existing auth and avatar user-facing behavior remains unchanged.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Future S-04/F-02 Observability Contract

### Overview

Define the privacy-safe session lifecycle vocabulary that S-04 and F-02 integration must use later, without implementing a session flow now.

### Changes Required:

#### 1. Session Event Helpers

**File**: `src/lib/operational-visibility/session-events.ts`

**Intent**: Give future S-04 implementation a ready-to-use safe event API rather than letting chat/session code invent log payloads.

**Contract**: Export helper builders for `session.start_attempted`, `session.safety_evaluated`, `session.ai_provider_failed`, `session.time_limit_reached`, and `session.completed`. Helpers accept only safe lifecycle metadata: request ID, outcome, duration, coarse action, safe F-02 reason code, provider name, and optional user hash. They do not accept message text, prompts, model output, summaries, modality IDs, or raw provider responses.

#### 2. F-02 Safety Mapping

**File**: `src/lib/operational-visibility/session-events.ts`

**Intent**: Map the future F-02 safety boundary result into operational metadata without leaking classifier input/output.

**Contract**: Define allowed safety metadata such as `riskState: "normal" | "caution" | "crisis"`, `action: "allow" | "allow_with_constraints" | "hard_stop" | "fail_closed"`, and approved F-02 reason codes. The mapping must not include user text, classifier prompt, provider response body, crisis-triggering phrase, or generated copy.

#### 3. Session Handoff README

**File**: `src/lib/operational-visibility/README.md`

**Intent**: Make the future S-04 contract clear before chat/session code exists.

**Contract**: Document that S-04 must call F-02 safety evaluation before ordinary AI generation and may emit only lifecycle events from `session-events.ts`. The README lists prohibited fields, gives safe examples, and states that admin-facing aggregates belong to S-07 rather than raw logs.

#### 4. Optional F-02 README Link

**File**: `src/lib/session-safety/README.md`

**Intent**: If F-02 has already created a session-safety README by implementation time, link it to the F-03 operational event contract.

**Contract**: Add only a short handoff note if the file exists. Do not create or change F-02 safety behavior as part of F-03. If F-02 has not landed yet, keep this note only in `src/lib/operational-visibility/README.md`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search confirms no new `/api/session`, `/api/chat`, timer, history, summary, or AI response route was added.
- Source search confirms session event helpers reject or omit `message`, `prompt`, `content`, `summary`, `email`, `token`, `cookie`, `authorization`, raw provider payloads, and raw errors.
- Source search confirms no helper accepts `modalityId` or `avatarId` as log metadata.

#### Manual Verification:

- Future S-04 implementers have clear event names for start, safety, provider failure, time-limit, and completion states.
- `safety_evaluated` exposes only coarse safe state/action/reason metadata, not private text.
- F-03 still does not implement a visible chat/session feature.
- S-07 remains responsible for any admin-facing aggregate view; raw operational logs are not exposed through the app.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Tests, Sweeps, And Docs

### Overview

Add minimal tests for the privacy-safe contract, run final source sweeps, and document how to use the new logging layer safely.

### Changes Required:

#### 1. Minimal Test Runner

**File**: `package.json`, `package-lock.json`, `vitest.config.ts`

**Intent**: Ensure the allowlist, sanitizer, user hashing, and request ID behavior are regression-tested.

**Contract**: If F-02 has already added Vitest, reuse its setup and add F-03 tests. If no test runner exists, add minimal Vitest with a script such as `test` or `test:operational-visibility`. Tests must run without Supabase, OpenRouter, Cloudflare secrets, or network calls.

#### 2. Operational Visibility Tests

**File**: `src/lib/operational-visibility/__tests__/*.test.ts`

**Intent**: Lock down the private-data boundary.

**Contract**: Test that the sanitizer keeps only allowlisted fields, denies sensitive field names, omits nested arbitrary objects, never serializes private values, and does not throw on malformed input. Test that user hashing is stable with a secret, changes with a different secret, and returns `null` without a secret. Test that logger failures are caught and that test doubles never emit raw sensitive fields.

#### 3. Request ID Tests Or Source Verification

**File**: `src/lib/operational-visibility/__tests__/request-context.test.ts`, `src/middleware.ts`

**Intent**: Verify request ID and context helpers stay safe.

**Contract**: Prefer unit tests for context helper behavior. If direct middleware testing is impractical in Astro without E2E setup, use source verification plus a manual local smoke check. Do not introduce Playwright/E2E in F-03.

#### 4. CI And Verification Commands

**File**: `.github/workflows/ci.yml`

**Intent**: Run the minimal test command in CI once the test runner exists.

**Contract**: Add the selected test command after install and before build. CI must not require `OPERATIONAL_LOG_HASH_SECRET`, Supabase runtime values beyond existing build needs, OpenRouter keys, or real Workers Logs access.

#### 5. Documentation Updates

**File**: `README.md`, `.env.example`, `context/deployment/deploy-plan.md`

**Intent**: Explain the operational visibility contract and local/hosted verification path.

**Contract**: Document `OPERATIONAL_LOG_HASH_SECRET` as an optional server-only secret for pseudonymous user correlation. Document that F-03 uses Cloudflare Workers Logs through structured JSON events, that logs are inspected through Workers dashboard or `npx wrangler tail`, and that private conversation content, prompts, emails, tokens, cookies, raw provider payloads, and raw database errors must never be logged.

#### 6. Final Source Sweep

**File**: `context/changes/privacy-safe-operational-visibility/plan.md`

**Intent**: Keep closure tied to the plan and prove F-03 stayed inside its privacy boundary.

**Contract**: `/10x-implement` updates only the `## Progress` section. Final verification includes source searches for rogue `console.log`, disallowed event fields, raw auth/provider/database error logging, S-04 route creep, committed secrets, and private-content terms in operational event payloads.

### Success Criteria:

#### Automated Verification:

- `npm run test` or the selected operational visibility test command completes successfully.
- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- `git diff --check` reports no whitespace errors.
- Source search confirms no committed `OPERATIONAL_LOG_HASH_SECRET` value or other secret value exists.
- Source search confirms no new S-04 chat/timer/session/history/summary route was added.
- Source search confirms no `console.log` calls exist outside the operational visibility logger and approved tests.
- Source search confirms operational visibility calls do not include private field names or raw error/provider/form payloads.

#### Manual Verification:

- Running locally with missing `OPERATIONAL_LOG_HASH_SECRET` still allows auth/avatar flows and omits `userHash`.
- Running locally with a test hash secret emits stable pseudonymous user hashes without raw user IDs or emails.
- `npx wrangler tail` or Cloudflare Workers Logs can show structured JSON events with `requestId`, event name, outcome, and safe reason code.
- README, `.env.example`, deploy plan, and operational visibility README agree on the privacy-safe logging contract.
- The final diff is reviewed for private data leakage before implementation is considered complete.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before considering the change implemented.

---

## Testing Strategy

### Unit Tests:

- Test allowlist and denied-name behavior for operational event payloads.
- Test sanitizer behavior for unknown fields, nested objects, malformed inputs, and private field names.
- Test user hash behavior with and without `OPERATIONAL_LOG_HASH_SECRET`.
- Test logger best-effort behavior with mocked `console.log` failures.
- Test session event helpers reject or omit private fields and only expose approved lifecycle metadata.

### Integration Tests:

- No browser E2E, Playwright, Tail Worker, Logpush, or live Cloudflare Workers Logs integration in F-03.
- Current CI should run the minimal unit tests, `npx astro sync`, lint, and build.
- Future S-04 should add endpoint-level checks that session handlers use the F-03 session event helpers without logging private content.

### Manual Testing Steps:

1. Run the selected test command without `OPERATIONAL_LOG_HASH_SECRET` and confirm it passes.
2. Run `npx astro sync`, `npm run lint`, and `npm run build`.
3. Start the app locally, sign in/sign out or exercise auth failure paths, and confirm product behavior is unchanged.
4. With a local hash secret set, verify emitted test/local events contain `requestId` and pseudonymous `userHash`, not raw user IDs or emails.
5. Exercise `/dashboard/avatar` fetch/save failure paths where possible and verify logs use safe avatar reason codes only.
6. Search the diff for `message`, `prompt`, `content`, `summary`, `email`, `token`, `cookie`, `authorization`, `password`, raw `error`, and `console.log`.
7. Confirm no `/api/session`, `/api/chat`, timer, history, summary, or AI response route was introduced.
8. If a deployed Worker is available, use `npx wrangler tail` read-only to confirm structured JSON events are queryable by event name and request ID.

## Performance Considerations

F-03 should add negligible latency. Request ID generation is constant-time, user hashing happens only when an authenticated user is available and a hash secret exists, and logging is best-effort. Do not add remote log exporters, database writes, or blocking observability calls. Avoid high-volume events inside loops or per-token AI streaming; future S-04 should emit lifecycle events, not every streamed token or message fragment.

## Migration Notes

No Supabase migration is required. This plan intentionally avoids a database event table. Runtime configuration adds only optional `OPERATIONAL_LOG_HASH_SECRET`; if absent, event emission continues without user correlation and never logs raw user IDs.

## References

- Roadmap F-03: `context/foundation/roadmap.md:34`
- Roadmap observability baseline: `context/foundation/roadmap.md:63`
- Roadmap F-03 details: `context/foundation/roadmap.md:93`
- PRD privacy/admin guardrail: `context/foundation/prd.md:47`
- PRD FR-010: `context/foundation/prd.md:97`
- PRD Non-Functional Requirements: `context/foundation/prd.md:102`
- Infrastructure privacy logging risk: `context/foundation/infrastructure.md:67`
- Infrastructure logging mitigation: `context/foundation/infrastructure.md:96`
- Current Worker observability config: `wrangler.jsonc:15`
- Current locals shape: `src/env.d.ts:1`
- Current middleware auth/protection point: `src/middleware.ts:11`
- Current safe auth error vocabulary: `src/lib/auth-errors.ts:1`
- Current safe avatar error vocabulary: `src/lib/avatar-choice-errors.ts:1`
- Current package scripts without tests: `package.json:5`
- Cloudflare Workers Logs: `https://developers.cloudflare.com/workers/observability/logs/workers-logs/`
- Cloudflare real-time logs and `wrangler tail`: `https://developers.cloudflare.com/workers/observability/logs/real-time-logs/`
- Cloudflare Workers Web Crypto: `https://developers.cloudflare.com/workers/runtime-apis/web-crypto/`
- Progress format reference: `.agents/skills/10x-plan/references/progress-format.md:1`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.agents/skills/10x-plan/references/progress-format.md`.

### Phase 1: Safe Event Contract And Redaction

#### Automated

- [x] 1.1 `npx astro sync` completes successfully.
- [x] 1.2 `npm run lint` completes successfully.
- [x] 1.3 `npm run build` completes successfully.
- [x] 1.4 Source search finds exactly one `OperationalEventName` definition.
- [x] 1.5 Source search confirms the operational event allowlist does not include `message`, `prompt`, `content`, `email`, `token`, `cookie`, `authorization`, `password`, `secret`, or raw `error`.
- [x] 1.6 Source search confirms user hashing never returns raw Supabase user IDs.

#### Manual

- [x] 1.7 Event names cover auth, avatar, protected-route, and future session lifecycle without implementing session features.
- [x] 1.8 The allowlist is strict enough that a caller cannot accidentally log form data, cookies, provider payloads, or private conversation text.
- [x] 1.9 Missing `OPERATIONAL_LOG_HASH_SECRET` omits user correlation rather than blocking the request or logging raw user IDs.

### Phase 2: Request Context And Logger Runtime

#### Automated

- [ ] 2.1 `npx astro sync` completes successfully.
- [ ] 2.2 `npm run lint` completes successfully.
- [ ] 2.3 `npm run build` completes successfully.
- [ ] 2.4 Source search finds `requestId` typed in `src/env.d.ts` and assigned in `src/middleware.ts`.
- [ ] 2.5 Source search finds exactly one application logger wrapper that calls `console.log`.
- [ ] 2.6 Source search confirms no new logger code reads request body text, cookies, authorization headers, or query string payloads.

#### Manual

- [ ] 2.7 Requests receive a safe request ID that can be used for support/debug correlation.
- [ ] 2.8 Middleware redirects and normal responses both preserve request ID context.
- [ ] 2.9 Logger failures cannot block sign-in, sign-up, sign-out, avatar choice, or future session flow.
- [ ] 2.10 Worker observability remains Cloudflare-first and does not add an external log destination.

### Phase 3: Instrument Existing Critical Flows

#### Automated

- [ ] 3.1 `npx astro sync` completes successfully.
- [ ] 3.2 `npm run lint` completes successfully.
- [ ] 3.3 `npm run build` completes successfully.
- [ ] 3.4 Source search confirms auth instrumentation does not pass `email`, `password`, `confirmPassword`, callback `code`, provider URL, or raw `error.message` into `logOperationalEvent`.
- [ ] 3.5 Source search confirms avatar instrumentation does not pass `modalityId`, `avatarId`, selected row data, SQL details, or raw `error` objects into `logOperationalEvent`.
- [ ] 3.6 Source search confirms no new `console.log` calls were added outside the operational visibility logger and approved tests.

#### Manual

- [ ] 3.7 Sign-in/sign-up/OAuth/password/sign-out failures are diagnosable by safe event names and reason codes.
- [ ] 3.8 Avatar fetch/save failures are diagnosable by safe event names and reason codes.
- [ ] 3.9 A developer reading Worker logs cannot infer a user's email, selected modality, conversation content, cookies, or provider tokens from F-03 events.
- [ ] 3.10 Existing auth and avatar user-facing behavior remains unchanged.

### Phase 4: Future S-04/F-02 Observability Contract

#### Automated

- [ ] 4.1 `npx astro sync` completes successfully.
- [ ] 4.2 `npm run lint` completes successfully.
- [ ] 4.3 `npm run build` completes successfully.
- [ ] 4.4 Source search confirms no new `/api/session`, `/api/chat`, timer, history, summary, or AI response route was added.
- [ ] 4.5 Source search confirms session event helpers reject or omit `message`, `prompt`, `content`, `summary`, `email`, `token`, `cookie`, `authorization`, raw provider payloads, and raw errors.
- [ ] 4.6 Source search confirms no helper accepts `modalityId` or `avatarId` as log metadata.

#### Manual

- [ ] 4.7 Future S-04 implementers have clear event names for start, safety, provider failure, time-limit, and completion states.
- [ ] 4.8 `safety_evaluated` exposes only coarse safe state/action/reason metadata, not private text.
- [ ] 4.9 F-03 still does not implement a visible chat/session feature.
- [ ] 4.10 S-07 remains responsible for any admin-facing aggregate view; raw operational logs are not exposed through the app.

### Phase 5: Tests, Sweeps, And Docs

#### Automated

- [ ] 5.1 `npm run test` or the selected operational visibility test command completes successfully.
- [ ] 5.2 `npx astro sync` completes successfully.
- [ ] 5.3 `npm run lint` completes successfully.
- [ ] 5.4 `npm run build` completes successfully.
- [ ] 5.5 `git diff --check` reports no whitespace errors.
- [ ] 5.6 Source search confirms no committed `OPERATIONAL_LOG_HASH_SECRET` value or other secret value exists.
- [ ] 5.7 Source search confirms no new S-04 chat/timer/session/history/summary route was added.
- [ ] 5.8 Source search confirms no `console.log` calls exist outside the operational visibility logger and approved tests.
- [ ] 5.9 Source search confirms operational visibility calls do not include private field names or raw error/provider/form payloads.

#### Manual

- [ ] 5.10 Running locally with missing `OPERATIONAL_LOG_HASH_SECRET` still allows auth/avatar flows and omits `userHash`.
- [ ] 5.11 Running locally with a test hash secret emits stable pseudonymous user hashes without raw user IDs or emails.
- [ ] 5.12 `npx wrangler tail` or Cloudflare Workers Logs can show structured JSON events with `requestId`, event name, outcome, and safe reason code.
- [ ] 5.13 README, `.env.example`, deploy plan, and operational visibility README agree on the privacy-safe logging contract.
- [ ] 5.14 The final diff is reviewed for private data leakage before implementation is considered complete.
