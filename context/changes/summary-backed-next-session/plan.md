# Summary-Backed Next Session Implementation Plan

## Overview

Implement S-06 from `context/foundation/roadmap.md`: a signed-in user can see a user-visible summary of prior conversations, explicitly approve it as context, and start a later browser session that receives bounded summary context instead of raw prior-session messages.

The MVP follow-up session is not a paid/billing flow. It deliberately adds a non-trial follow-up start path so FR-007 can be verified end-to-end now, while keeping FR-008 payment outside this change.

## Current State Analysis

F-01 already created the private session tables, including `session_summaries`, with owner-only RLS, summary statuses, visibility, revisioning, and column-level grants. The repository already exposes `saveVisibleSessionSummary()` and `listOwnedSessionSummaries()`, but there is no S-06 domain layer that defines approval semantics, context selection, retry behavior, or stale handling.

S-04 implemented the first timed session and ordinary OpenRouter response helper. `/api/session/message` currently reads recent messages only from the active session and sends those messages to `generateSessionResponse()`. The session prompt explicitly tells the model to use only the bounded recent-message window and not invent prior sessions, summaries, memories, or facts.

S-05 implemented history and deletion on `/dashboard/avatar`. The history detail endpoint can read a full owned non-deleted conversation, and `deleteOwnedSession()` purges both `session_messages` and `session_summaries` before writing a minimal tombstone. The history list intentionally excludes previews and summary text.

The remaining gap is the continuity contract: generate a safe visible summary from one prior session, let the user approve it, select up to three approved summaries, show that selection before follow-up start, and pass only that bounded summary context into the next ordinary AI reply.

## Desired End State

On `/dashboard/avatar`, an authenticated user opens a saved conversation detail and can generate a user-visible summary for that conversation after it is completed, expired, or interrupted. If generation fails, the user sees a stable retry state and can still choose to start a later session without summary context.

Generated summary text is shown to the user before it can influence a later conversation. Approval is explicit: only `ready + visible` summaries qualify for next-session context. Newer revisions make older visible revisions stale, and deleted sessions or deleted/stale summaries are never used.

On `/dashboard/session`, a user who already consumed the first trial can start a follow-up MVP session with the same timed-session UX and current avatar snapshot. Before start, the page shows the approved summary context that will be used, capped at the three newest summaries. The message endpoint keeps the F-02 safety check before ordinary AI generation and extends ordinary response input with bounded approved summaries, never raw prior-session messages.

### Key Discoveries:

- Roadmap S-06 is "uzytkownik moze zobaczyc podsumowanie poprzednich rozmow i rozpoczac kolejna sesje z tym kontekstem": `context/foundation/roadmap.md:170`.
- PRD FR-007 requires a later session to receive context from user-visible summaries: `context/foundation/prd.md:85`.
- F-01 says S-06 must use `saveVisibleSessionSummary()` and `listOwnedSessionSummaries()` and must not load unlimited raw messages as next-session context: `src/lib/session-data/README.md:80`.
- F-01 also says S-06 must not bypass `draft`, `ready`, `stale`, `deleted`, must not use deleted summaries, and must not hide the summary that feeds the next conversation: `src/lib/session-data/README.md:84`.
- `session_summaries` already has `summary_text`, `status`, `is_visible`, `revision`, and a `(session_id, revision)` unique key: `supabase/migrations/20260606120000_create_private_session_data_boundary.sql:118`.
- `saveVisibleSessionSummary()` and `listOwnedSessionSummaries()` already exist in the F-01 repository: `src/lib/session-data/repository.ts:461`, `src/lib/session-data/repository.ts:491`.
- `deleteOwnedSession()` already purges summaries with messages before writing the tombstone, so S-06 must not rebuild context from deleted sessions: `src/lib/session-data/deletion.ts:45`.
- Current first-session start blocks second starts with `trial_already_claimed`: `src/pages/api/session/start.ts:97`.
- Current ordinary session prompt forbids inventing prior sessions, summaries, memories, or facts: `src/lib/session-ai/session-response-prompt.ts:42`.
- Current message route passes only active-session recent messages into ordinary generation: `src/pages/api/session/message.ts:232`.
- Operational visibility deny-lists private field tokens including `message`, `prompt`, `content`, `session`, `summary`, and `error`: `src/lib/operational-visibility/allowed-fields.ts:23`.

## What We're NOT Doing

- No billing, subscriptions, checkout, paid upgrade, entitlement system, or FR-008 implementation.
- No admin views of messages or summary text.
- No user editing of generated summary text in MVP.
- No summary search, export, tags, analytics, or admin aggregates.
- No raw prior-session messages in next-session prompt context.
- No hidden/invisible summary context.
- No use of `draft`, `stale`, `deleted`, or deleted-session summaries as next-session context.
- No streaming, WebSocket, EventSource, pseudo-streaming, or Playwright infrastructure.
- No direct private table access outside `src/lib/session-data/`.
- No logging of raw messages, prompts, summaries, generated responses, provider payloads, Supabase raw errors, user identifiers, avatar IDs, or modality IDs.

## Implementation Approach

Use the existing private storage shape and add a narrow S-06 layer above it. Phase 1 defines summary status/revision/context semantics and adds a separate server-only summary generator. Phase 2 exposes summary operations through private routes and the existing history UI. Phase 3 adds the follow-up session path and summary-aware ordinary prompt input. Phase 4 verifies the local gate and privacy boundaries.

## Critical Implementation Details

### State Sequencing

Generated summary text must be visible before it becomes context. The safe MVP sequence is: read owned detail messages, generate summary, save a visible draft or pending preview, then mark the selected revision `ready + visible` only after user approval. A newer approved revision marks older visible revisions stale.

### Timer And Trial Boundary

Do not weaken `claimFreeTrialSession()` or reinterpret `trial_already_claimed`. The first-session route remains the only trial claim path. Follow-up sessions are non-trial sessions created through a separate contract and reuse the existing timed-session shell for MVP.

### Debug And Observability

Do not add operational events with summary text or message counts tied to identifiers. If S-06 needs diagnostics, extend F-03 with safe reason codes only; otherwise prefer no new logs over unsafe logs.

## Phase 1: Summary Contract And Generation

### Overview

Define the owner-bound summary domain contract and server-only generation boundary. This phase should make summary status, revision, approval, context selection, and provider failure behavior explicit before any UI depends on it.

### Changes Required:

#### 1. Summary Domain Types

**File**: `src/lib/session-data/types.ts`

**Intent**: Add S-06-specific summary view and context types so API routes and UI do not pass raw summary rows or raw session rows around.

**Contract**: Add types for summary preview, approved summary context, latest-summary state, and a max context size of 3. Public view models may include `summaryText` only on explicit summary surfaces, never in history list items, tombstones, logs, or admin-facing shapes.

#### 2. Owner-Bound Summary Repository Helpers

**File**: `src/lib/session-data/repository.ts`

**Intent**: Extend the F-01 boundary with repository functions that implement summary revisions and context selection without direct table access outside `src/lib/session-data/`.

**Contract**: Add helper contracts to read the latest owned summary for a session, save a generated visible draft/ready revision, mark older revisions `stale`, mark a revision approved as `ready + visible`, and list the newest approved context summaries across owned non-deleted sessions capped at 3. All helpers must filter out `draft` unless explicitly reading preview state, `stale`, `deleted`, invisible summaries, and deleted sessions.

#### 3. Summary Generation Boundary

**File**: `src/lib/session-summary/types.ts`, `src/lib/session-summary/provider.ts`, `src/lib/session-summary/openrouter-summary.ts`, `src/lib/session-summary/summary-prompt.ts`, `src/lib/session-summary/errors.ts`

**Intent**: Keep summary generation separate from ordinary session replies and from F-02 safety classification.

**Contract**: Export a provider interface that accepts one owned conversation's ordered user/assistant messages plus safe modality metadata and returns a concise Polish summary string. The prompt must frame the output as user-visible continuity notes, not diagnosis, advice, risk assessment, treatment plan, or hidden memory. The OpenRouter client reuses `OPENROUTER_API_KEY` and a configurable summary model only if config is added intentionally; otherwise it can reuse the session model through a clearly named resolver.

#### 4. Summary Generation Input Builder

**File**: `src/lib/session-flow/session-summary.ts`

**Intent**: Build the safe generation input from S-05 history detail without leaking deleted or unowned data.

**Contract**: Expose a helper that accepts `SessionDataContext` and `sessionId`, loads an owned non-deleted detail, rejects active/created sessions, orders messages, bounds message count/characters for provider input, and returns stable failure codes for missing auth, session not found, not ready for summary, read failure, and provider failure.

#### 5. Summary Contract Tests

**File**: `src/lib/session-data/__tests__/repository.test.ts`, `src/lib/session-summary/__tests__/*.test.ts`, `src/lib/session-flow/__tests__/session-summary.test.ts`

**Intent**: Lock the privacy and status contract before route/UI work.

**Contract**: Tests cover revision incrementing, stale marking, approved context capped at 3, deleted/stale/draft/invisible exclusion, deleted-session exclusion, provider prompt boundaries, OpenRouter error mapping, and no real network calls.

### Success Criteria:

#### Automated Verification:

- Unit tests cover summary status transitions: generated preview, approved ready summary, stale older revision, deleted summary exclusion.
- Unit tests confirm approved context returns at most 3 newest `ready + visible` summaries and excludes draft/stale/deleted/deleted-session summaries.
- Unit tests confirm summary generation is server-only, mocked in tests, and does not return raw provider payloads or raw provider errors.
- `npm run test` passes for new summary contract tests and existing tests.

#### Manual Verification:

- Developer review confirms a summary cannot become next-session context before the user has seen and approved it.
- Developer review confirms no new Supabase migration is needed for the planned MVP semantics, or records the exact schema blocker if one is discovered.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Summary API And History UI

### Overview

Expose summary generation, retry, approval, and current summary state through authenticated routes and the existing S-05 history detail UI.

### Changes Required:

#### 1. Summary API Contract

**File**: `src/lib/session-flow/session-summary-contract.ts`

**Intent**: Define stable response unions for summary state, generate/retry, approval, and failure cases.

**Contract**: Add response types with stable codes for missing auth, session not found, session not summarizable, summary unavailable, generation failed, approval failed, read failed, and provider unavailable. Response bodies may include `summaryText` only for explicit summary preview/detail responses.

#### 2. Summary Routes

**File**: `src/pages/api/session/summary/[sessionId].ts`

**Intent**: Give the history UI one private route for summary state, generation/retry, and approval for a specific owned session.

**Contract**: Export `GET` for current summary state, `POST` for generate/retry, and `PATCH` or another explicit method for approval. Each method calls `getSessionDataContext(context)` first, uses S-06 summary helpers, never logs request body or summary text, and maps failures to stable JSON codes without raw Supabase/OpenRouter details.

#### 3. History Detail Summary State

**File**: `src/lib/session-flow/session-history.ts`, `src/lib/session-flow/session-history-contract.ts`, `src/pages/api/session/history/[sessionId].ts`

**Intent**: Let history detail surfaces render current summary state without adding another hidden private data read in the component.

**Contract**: Extend the explicit detail response or pair it with the summary route so UI can know whether a session has no summary, a preview waiting for approval, an approved summary, a stale summary, or a retryable failure. Do not add `summaryText` to history list rows.

#### 4. History UI Summary Controls

**File**: `src/components/modality/AvatarSessionHistory.tsx`

**Intent**: Let the user generate, retry, preview, and approve a summary from a read-only history detail.

**Contract**: Add a summary panel inside the detail area. It appears only after opening a conversation and clearly separates full read-only messages from summary preview. It must show that approved summaries can influence later sessions, require a deliberate "use in next session" action, and provide retry for generation failure. It must not offer summary editing in MVP.

#### 5. History UI Tests

**File**: `src/components/modality/__tests__/AvatarSessionHistory.test.tsx`, `src/pages/api/session/__tests__/session-summary-route.test.ts`

**Intent**: Verify the user-visible summary flow and route failure mapping.

**Contract**: Component tests cover no summary, generating, preview, approved, stale, retry failure, and no summary text in list rows. Route tests cover missing auth, not found, non-summarizable session, successful generation, retry, approval, provider failure, and safe response shape.

### Success Criteria:

#### Automated Verification:

- Route tests pass for summary `GET`, generate/retry, approval, missing auth, not-found, non-summarizable, provider failure, and approval failure.
- Component tests confirm summary preview is visible only in detail, not in the history list.
- Component tests confirm "use in next session" is explicit and summary editing is absent.
- `npm run test` passes for summary route, helper, and component tests.

#### Manual Verification:

- On `/dashboard/avatar`, opening a completed/expired/interrupted conversation shows summary controls.
- Generate summary shows a preview that clearly says it may be used as context only after approval.
- Approval changes the state to "will be used in next session" or equivalent clear copy.
- Retry state appears when generation fails and does not approve hidden context.
- Active or empty conversations cannot be summarized.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Summary-Backed Next Session Flow

### Overview

Add the follow-up session path and connect approved summary context to ordinary session generation without weakening the first-trial claim path or F-02 safety ordering.

### Changes Required:

#### 1. Follow-Up Session State

**File**: `src/lib/session-flow/session-state.ts`

**Intent**: Let `/dashboard/session` distinguish first-trial readiness from follow-up readiness after the trial is already claimed.

**Contract**: Extend safe page state so trial-used users can see a follow-up preparation state, approved context summaries capped at 3, and a no-context fallback state. Existing first-trial states remain valid and `trial_already_claimed` should no longer be a dead end when follow-up sessions are allowed by S-06.

#### 2. Follow-Up Start Route

**File**: `src/pages/api/session/start-next.ts`

**Intent**: Start a non-trial MVP follow-up session without changing the one-free-trial contract.

**Contract**: Export `POST`. It authenticates through `getSessionDataContext(context)`, requires a current avatar choice, reads approved summary context state, accepts an explicit no-context flag only when the user chose that fallback, creates a non-trial session through F-01 repository helpers, transitions it to `active`, and returns the same safe `SessionView` shape used by S-04. It must not call `claimFreeTrialSession()` and must not reset or delete trial claims.

#### 3. Summary-Aware Session AI Input

**File**: `src/lib/session-ai/types.ts`, `src/lib/session-ai/session-response-prompt.ts`, `src/lib/session-ai/__tests__/session-response-prompt.test.ts`

**Intent**: Add an explicit prior-summary context input to ordinary AI generation.

**Contract**: Add `approvedSummaries` or equivalent bounded field to `GenerateSessionResponseInput`. Prompt construction must include at most three summaries, label them as user-visible prior-session summaries, tell the model not to treat them as diagnosis or verified facts, and keep current-message/recent-active-session context separate. The existing "do not invent prior sessions" rule should become "use only the approved summaries provided".

#### 4. Message Route Context Loading

**File**: `src/pages/api/session/message.ts`

**Intent**: Pass approved summary context into ordinary generation while preserving the F-02 safety boundary.

**Contract**: After validating active session and before ordinary generation, load approved summary context through S-06 helpers and pass it to `generateSessionResponse()`. `evaluateSessionSafety()` still runs before ordinary generation. Hard-stop/fail-closed and ordinary AI failure still do not persist raw triggering text or fake assistant content.

#### 5. Session Page And Timed Session UI

**File**: `src/pages/dashboard/session.astro`, `src/components/session/TimedSession.tsx`

**Intent**: Show the user exactly whether a follow-up session will use approved summaries and allow explicit start without context when summary generation failed or no approved summary exists.

**Contract**: The preparation state shows up to three approved summaries or a clear "no context" state. The start action uses `/api/session/start` for first trial and `/api/session/start-next` for follow-up. Copy must distinguish "pierwsza darmowa sesja" from "kolejna sesja MVP" and must not mention payment or upgrade.

#### 6. Follow-Up Flow Tests

**File**: `src/pages/api/session/__tests__/session-start-next-route.test.ts`, `src/pages/api/session/__tests__/session-message-route.test.ts`, `src/lib/session-flow/__tests__/session-state.test.ts`, `src/components/session/__tests__/*.test.tsx`

**Intent**: Prove follow-up sessions use approved summaries safely without regressing S-04.

**Contract**: Tests cover first trial still using `claimFreeTrialSession()`, follow-up start not calling claim, missing avatar, no approved summaries, explicit no-context start, approved context capped at 3, message route prompt input, hard-stop behavior, AI retry behavior, and expired follow-up sessions.

### Success Criteria:

#### Automated Verification:

- Route tests confirm `/api/session/start` still blocks duplicate free trial and `/api/session/start-next` starts only non-trial sessions.
- Route tests confirm follow-up start does not call `claimFreeTrialSession()` and does not reset `session_trial_claims`.
- Prompt tests confirm only approved summaries are included, capped at 3, and raw prior messages are not used as prior-session context.
- Message route tests confirm `evaluateSessionSafety()` still runs before ordinary generation.
- `npm run test` passes for session state, start, message, prompt, and UI tests.

#### Manual Verification:

- `/dashboard/session` still lets a new user start the first 15-minute trial by explicit action.
- A user who already used the trial sees a follow-up preparation state instead of only a dead-end trial-used state.
- Approved summaries shown on `/dashboard/session` match what the user approved in history.
- Starting without context is possible only through explicit no-context copy/action.
- Follow-up conversation runs with the same visible timer and response-progress UX as S-04.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Tests, Sweeps, Verification

### Overview

Run the full local quality gate and record evidence that S-06 stayed inside privacy, summary, follow-up session, and no-billing boundaries.

### Changes Required:

#### 1. Full Automated Gate

**File**: `package.json`, existing scripts

**Intent**: Verify S-06 against the repo's current CI-equivalent checks.

**Contract**: Run `npm run test`, `npx astro sync`, `npm run lint`, `npm run build`, and `git diff --check`.

#### 2. Private Table Access Sweep

**File**: source tree

**Intent**: Ensure S-06 did not introduce direct private table access outside the F-01 boundary.

**Contract**: Search for direct `.from("therapy_sessions")`, `.from("session_messages")`, `.from("session_summaries")`, and `.from("session_trial_claims")` outside `src/lib/session-data/`. The only allowed private table access remains inside the session-data boundary.

#### 3. Private Logging Sweep

**File**: source tree

**Intent**: Ensure summary generation and follow-up sessions do not log private content.

**Contract**: Search new S-06 paths and operational log payloads. Confirm no logged field or value contains raw `message`, `prompt`, `content`, `summary`, generated response, provider payload, raw database/provider error, token/cookie/password, `sessionId`, `modalityId`, `avatarId`, or raw `user.id`.

#### 4. Summary Context Sweep

**File**: source tree

**Intent**: Prove next-session context uses approved summaries, not raw prior-session messages.

**Contract**: Search S-06 prompt/message/start paths for raw prior history loading. Confirm previous-session context is sourced only from approved `ready + visible` summary helpers, capped at 3, and excludes current active-session recent messages from this sweep's prior-session category.

#### 5. Scope Creep Sweep

**File**: source tree

**Intent**: Prove S-06 did not implement payment, admin private content access, streaming, or summary editing.

**Contract**: Search for paid upgrade/payment/checkout/subscription/entitlement code, admin-readable private content, summary edit forms/routes, trial reset, second free trial claim, streaming, `EventSource`, `WebSocket`, `ReadableStream`, `text/event-stream`, or new public/private admin surfaces.

#### 6. Verification Note

**File**: `context/changes/summary-backed-next-session/verification.md`

**Intent**: Preserve what was actually verified and what remains owner/environment dependent.

**Contract**: Record local command results, source sweep results, manual browser smoke status, limitations, and hosted Supabase/OpenRouter/Cloudflare checks as pending unless actually run.

### Success Criteria:

#### Automated Verification:

- `npm run test` passes.
- `npx astro sync` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Private table access sweep passes with private queries isolated to `src/lib/session-data/`.
- Private logging sweep passes with no private content or private identifiers in logs.
- Summary context sweep passes with prior-session context sourced only from approved summary helpers and capped at 3.
- Scope creep sweep passes with no billing, admin content access, summary editing, trial reset, second free trial claim, streaming, EventSource, or WebSocket behavior.

#### Manual Verification:

- `/dashboard/avatar` smoke covers generate summary, retry failure state if mockable, preview, approval, stale/new revision behavior, and absence of summary text in history list rows.
- `/dashboard/session` smoke covers first-trial start for a fresh state where available or documents why not available locally.
- `/dashboard/session` smoke covers follow-up preparation, approved summary context display, explicit no-context fallback, follow-up start, visible timer, normal message, and response-progress state.
- Delete regression confirms deleting a session removes its summary from future context.
- Hosted checks not run are explicitly marked pending rather than complete.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before marking the change implemented.

---

## Testing Strategy

### Unit Tests:

- Summary status/revision helpers: generated preview, approval, stale older revision, deleted/stale/draft/invisible exclusion.
- Approved context selection: max 3 newest summaries, stable ordering, deleted-session exclusion, no raw session rows.
- Summary prompt/client: non-diagnostic visible summary prompt, bounded message input, mocked OpenRouter, stable provider error mapping.
- Session prompt: approved summaries included as prior-session summary context, raw prior messages excluded, current active-session recent messages still bounded separately.
- Session state: first-trial ready, active/expired/completed trial, follow-up ready, approved context available, no-context fallback.

### Route-Level Tests:

- `GET/POST/PATCH /api/session/summary/[sessionId]` for summary state, generation/retry, approval, failure mapping, and safe response bodies.
- `POST /api/session/start` remains the first-trial claim route and still rejects duplicate trial claims.
- `POST /api/session/start-next` starts non-trial follow-up sessions and never touches `session_trial_claims`.
- `POST /api/session/message` keeps safety-before-generation and passes only approved summaries into ordinary response generation.

### Component Tests:

- History detail summary panel renders no summary, generating, preview, approved, stale, retry/error, and non-summarizable states.
- History list rows still do not render message previews or summary text.
- Timed session preparation renders approved summary context, no-context fallback, first-trial copy, and follow-up copy.

### Manual Testing Steps:

1. Sign in and open `/dashboard/avatar`.
2. Open a completed or expired conversation detail.
3. Generate a summary and confirm preview appears only in detail.
4. Approve the summary and confirm copy says it can be used in a later session.
5. Generate a newer revision if supported by the implementation and confirm older revision is stale/not used.
6. Open `/dashboard/session` and confirm up to three approved summaries are visible before follow-up start.
7. Start a follow-up session and confirm it is non-trial, timed, and uses normal response-progress UX.
8. Start without context through the explicit fallback when no approved summary exists or generation failed.
9. Send a normal message and verify response works.
10. Delete a summarized conversation and confirm its summary no longer appears in future context.

## Performance Considerations

Target data volume is sensitive-small and QPS is low. Summary generation should read only one owned conversation at a time and bound provider input by message count and character count. Follow-up prompt context is capped at three approved summaries and should not grow with full history. Client UI should fetch summary state on demand with the opened history detail, not prefetch summary text for every list row.

## Migration Notes

No Supabase migration is planned for S-06 unless implementation discovers that `status`, `is_visible`, and `revision` cannot safely represent preview/approval semantics. The default plan uses existing F-01 tables and RLS: `therapy_sessions`, `session_messages`, `session_summaries`, and `session_trial_claims`. Follow-up sessions are non-trial `therapy_sessions` rows and must not create `session_trial_claims`.

Runtime configuration reuses server-only OpenRouter secrets. If a separate summary model env var is added, document it in `.env.example`, `astro.config.mjs`, and hosted secret notes without exposing it to client components.

## References

- Roadmap S-06: `context/foundation/roadmap.md:170`
- PRD FR-007: `context/foundation/prd.md:85`
- F-01 S-06 handoff: `src/lib/session-data/README.md:80`
- F-01 summary status warning: `src/lib/session-data/README.md:84`
- Summary table shape: `supabase/migrations/20260606120000_create_private_session_data_boundary.sql:118`
- Summary helper write/read: `src/lib/session-data/repository.ts:461`, `src/lib/session-data/repository.ts:491`
- Deletion purges summaries: `src/lib/session-data/deletion.ts:45`
- Duplicate first trial behavior: `src/pages/api/session/start.ts:97`
- Current ordinary prompt memory boundary: `src/lib/session-ai/session-response-prompt.ts:42`
- Current ordinary generation input: `src/pages/api/session/message.ts:232`
- Operational denied private field tokens: `src/lib/operational-visibility/allowed-fields.ts:23`
- Existing history detail UI: `src/components/modality/AvatarSessionHistory.tsx:525`
- Existing session page shell: `src/pages/dashboard/session.astro:91`
- Progress format reference: `.agents/skills/10x-plan/references/progress-format.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.agents/skills/10x-plan/references/progress-format.md`.

### Phase 1: Summary Contract And Generation

#### Automated

- [x] 1.1 Unit tests cover summary status transitions: generated preview, approved ready summary, stale older revision, deleted summary exclusion. — edd5713
- [x] 1.2 Unit tests confirm approved context returns at most 3 newest `ready + visible` summaries and excludes draft/stale/deleted/deleted-session summaries. — edd5713
- [x] 1.3 Unit tests confirm summary generation is server-only, mocked in tests, and does not return raw provider payloads or raw provider errors. — edd5713
- [x] 1.4 `npm run test` passes for new summary contract tests and existing tests. — edd5713

#### Manual

- [x] 1.5 Developer review confirms a summary cannot become next-session context before the user has seen and approved it. — edd5713
- [x] 1.6 Developer review confirms no new Supabase migration is needed for the planned MVP semantics, or records the exact schema blocker if one is discovered. — edd5713

### Phase 2: Summary API And History UI

#### Automated

- [x] 2.1 Route tests pass for summary `GET`, generate/retry, approval, missing auth, not-found, non-summarizable, provider failure, and approval failure. — 302e3cb
- [x] 2.2 Component tests confirm summary preview is visible only in detail, not in the history list. — 302e3cb
- [x] 2.3 Component tests confirm "use in next session" is explicit and summary editing is absent. — 302e3cb
- [x] 2.4 `npm run test` passes for summary route, helper, and component tests. — 302e3cb

#### Manual

- [x] 2.5 On `/dashboard/avatar`, opening a completed/expired/interrupted conversation shows summary controls. — 302e3cb
- [x] 2.6 Generate summary shows a preview that clearly says it may be used as context only after approval. — 302e3cb
- [x] 2.7 Approval changes the state to "will be used in next session" or equivalent clear copy. — 302e3cb
- [x] 2.8 Retry state appears when generation fails and does not approve hidden context. — 302e3cb
- [x] 2.9 Active or empty conversations cannot be summarized. — 302e3cb

### Phase 3: Summary-Backed Next Session Flow

#### Automated

- [x] 3.1 Route tests confirm `/api/session/start` still blocks duplicate free trial and `/api/session/start-next` starts only non-trial sessions. — 88efd54
- [x] 3.2 Route tests confirm follow-up start does not call `claimFreeTrialSession()` and does not reset `session_trial_claims`. — 88efd54
- [x] 3.3 Prompt tests confirm only approved summaries are included, capped at 3, and raw prior messages are not used as prior-session context. — 88efd54
- [x] 3.4 Message route tests confirm `evaluateSessionSafety()` still runs before ordinary generation. — 88efd54
- [x] 3.5 `npm run test` passes for session state, start, message, prompt, and UI tests. — 88efd54

#### Manual

- [x] 3.6 `/dashboard/session` still lets a new user start the first 15-minute trial by explicit action. — 88efd54
- [x] 3.7 A user who already used the trial sees a follow-up preparation state instead of only a dead-end trial-used state. — 88efd54
- [x] 3.8 Approved summaries shown on `/dashboard/session` match what the user approved in history. — 88efd54
- [x] 3.9 Starting without context is possible only through explicit no-context copy/action. — 88efd54
- [x] 3.10 Follow-up conversation runs with the same visible timer and response-progress UX as S-04. — 88efd54

### Phase 4: Tests, Sweeps, Verification

#### Automated

- [x] 4.1 `npm run test` passes.
- [x] 4.2 `npx astro sync` passes.
- [x] 4.3 `npm run lint` passes.
- [x] 4.4 `npm run build` passes.
- [x] 4.5 `git diff --check` passes.
- [x] 4.6 Private table access sweep passes with private queries isolated to `src/lib/session-data/`.
- [x] 4.7 Private logging sweep passes with no private content or private identifiers in logs.
- [x] 4.8 Summary context sweep passes with prior-session context sourced only from approved summary helpers and capped at 3.
- [x] 4.9 Scope creep sweep passes with no billing, admin content access, summary editing, trial reset, second free trial claim, streaming, EventSource, or WebSocket behavior.

#### Manual

- [x] 4.10 `/dashboard/avatar` smoke covers generate summary, retry failure state if mockable, preview, approval, stale/new revision behavior, and absence of summary text in history list rows.
- [x] 4.11 `/dashboard/session` smoke covers first-trial start for a fresh state where available or documents why not available locally.
- [x] 4.12 `/dashboard/session` smoke covers follow-up preparation, approved summary context display, explicit no-context fallback, follow-up start, visible timer, normal message, and response-progress state.
- [x] 4.13 Delete regression confirms deleting a session removes its summary from future context.
- [x] 4.14 Hosted checks not run are explicitly marked pending rather than complete.
