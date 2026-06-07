# First Safe Timed Session Implementation Plan

## Overview

Implement S-04 from `context/foundation/roadmap.md`: a signed-in user with a saved avatar choice can consciously start one free 15-minute browser session, send messages, see a non-intrusive timer and response-in-progress state, receive non-streaming AI responses, and have the completed conversation saved through the private session-data boundary.

The slice connects the existing foundations instead of creating parallel paths. It uses F-01 for authenticated session data, trial claiming, lifecycle transitions, and message persistence; F-02 before ordinary AI generation; F-03 for privacy-safe session events; and S-03 for the current avatar/modality choice that is snapshotted onto the session.

## Current State Analysis

SafeSpace already has the account and avatar prerequisites for a first session. `/dashboard` is protected and currently shows the selected avatar when present, but still says the first session is a future roadmap slice. `src/lib/modalities.ts` contains the five approved MVP modality/avatar IDs and `sessionStyleHint` values. `public.user_avatar_choices` stores the user's current choice with owner-only RLS.

The private-data foundation exists under `src/lib/session-data/`. Its README requires future session handlers to call `getSessionDataContext()`, use `claimFreeTrialSession()` as the only free-session start path, append messages through repository helpers, and avoid direct inserts or raw content logs. `claimFreeTrialSession()` creates a trial session and claim with the 900-second duration bucket, while `appendSessionMessage()` and lifecycle helpers already provide the owner-bound persistence surface.

The safety foundation exists under `src/lib/session-safety/`. `evaluateSessionSafety()` returns `allow`, `allow_with_constraints`, or `hard_stop` decisions and fails closed for missing config, provider/network failures, malformed JSON, or invalid provider output. The operational visibility foundation exposes session event builders such as `session.start_attempted`, `session.safety_evaluated`, `session.ai_provider_failed`, `session.time_limit_reached`, and `session.completed`, with safe metadata only.

There is still no session page, no session start endpoint, no message endpoint, no ordinary AI response helper, no chat UI, no timer UI, and no route-level tests around the future session flow. Vitest already exists for library-level tests, so S-04 can add focused unit and route-level tests without introducing Playwright yet.

## Desired End State

A signed-in user who has selected an avatar sees a real session entry point on `/dashboard` and `/dashboard/session`. Opening the session page does not consume the free trial. Only clicking the explicit start action calls the start endpoint, loads the current avatar choice, claims the one free trial, sets server-owned `startedAt` and `expiresAt`, transitions the session to `active`, and returns the session state to the browser.

During the active session, the user sees remaining time, prior messages for that session, a message composer, and a clear non-streaming "response in progress" state while the server evaluates safety and calls the ordinary AI provider. New messages are accepted only while the server considers the session active and not expired. Once the 15-minute limit is reached, the UI blocks the composer and the server rejects later messages, records `expired`, and emits the safe time-limit event.

Each user turn is evaluated by F-02 before ordinary generation. For `allow` and `allow_with_constraints`, the server generates a constrained ordinary response and persists the successful turn as a `user` + `assistant` message pair. For `hard_stop` or fail-closed safety, the server returns the safe copy/resources without persisting raw user text. For ordinary AI provider failure, the user sees retry/unavailable state, no fake assistant message is saved, and no private prompt, user text, provider payload, or generated answer is logged.

### Key Discoveries:

- The roadmap identifies S-04 as the north-star slice and requires a real account/avatar/time-limited session with saved history: `context/foundation/roadmap.md:24`.
- The roadmap S-04 outcome is a safe 15-minute browser session with visible time and response-progress signal: `context/foundation/roadmap.md:145`.
- The roadmap still marks S-04 blocked by the modality list, but S-03 is implemented and the current catalog has five approved modality IDs and style hints: `src/lib/modalities.ts:1`.
- The PRD says the first session starts after sign-in and avatar choice, displays duration, and stores session history: `context/foundation/prd.md:51`.
- The PRD requires the free session only after sign-in and requires avatar choice before session start: `context/foundation/prd.md:60`.
- The PRD requires one limited free 15-minute session: `context/foundation/prd.md:74`.
- The PRD requires non-intrusive visible session duration and a signal that the answer is in progress: `context/foundation/prd.md:81`, `context/foundation/prd.md:104`.
- The PRD requires crisis situations to interrupt ordinary simulation and show urgent contact guidance: `context/foundation/prd.md:105`.
- F-01 requires future handlers to use `getSessionDataContext()`, `claimFreeTrialSession()`, repository helpers, and no raw content logs: `src/lib/session-data/README.md:7`.
- F-01 defines the required first-session order and says quota must not be enforced only in UI: `src/lib/session-data/README.md:46`.
- F-01 specifically says S-04 must use `claimFreeTrialSession()` as the only free-session start path and must not add direct inserts or service-role runtime secrets: `src/lib/session-data/README.md:66`.
- `claimFreeTrialSession()` uses the 900-second duration bucket and maps duplicate claims to `trial_already_claimed`: `src/lib/session-data/quota.ts:16`.
- `appendSessionMessage()` is the owner-bound message persistence helper S-04 should use for successful turns: `src/lib/session-data/repository.ts:321`.
- F-02 requires every future message handler to call `evaluateSessionSafety()` before ordinary AI generation and fail closed on provider/config failure: `src/lib/session-safety/README.md:5`.
- `evaluateSessionSafety()` maps provider failures to hard-stop unavailable decisions: `src/lib/session-safety/evaluate-session-safety.ts:47`.
- F-03 says S-04 must emit only safe session lifecycle events and must not log message, prompt, content, summary, raw provider payloads, modality IDs, avatar IDs, or raw user IDs: `src/lib/operational-visibility/README.md:27`.
- The session event helpers already expose safe safety/provider/time-limit/completed events: `src/lib/operational-visibility/session-events.ts:192`.
- OpenRouter Chat Completions supports non-streaming requests by default and accepts the standard `/api/v1/chat/completions` shape: `https://openrouter.ai/docs/api-reference/chat-completion`.
- OpenRouter's `openai/gpt-4o-mini` page lists a low-cost model with chat response-format support and current provider availability; the implementation should keep the ordinary session model configurable: `https://openrouter.ai/openai/gpt-4o-mini?tab=parameters`.

## What We're NOT Doing

- No S-05 session-history list, delete UI, or full session archive page.
- No S-06 session summary generation, user-visible summary page, or next-session context.
- No paid account upgrade, billing gate, or post-session monetization flow.
- No streaming token-by-token response in S-04.
- No pseudo-streaming that pretends a completed response is still generating.
- No therapist booking, real clinician profile, diagnosis, treatment plan, or "best modality for you" logic.
- No admin view of private session content or operational logs.
- No persistence of raw user text for safety hard-stop or fail-closed decisions.
- No logging of user messages, prompts, AI output, classifier input/output, summaries, raw Supabase errors, raw OpenRouter payloads, emails, tokens, cookies, modality IDs, or avatar IDs.
- No Playwright E2E setup in this slice; leave a clear handoff for future E2E coverage.

## Implementation Approach

Implement S-04 as a five-phase vertical slice. First add a separate server-only ordinary AI response boundary so S-04 does not reuse or overload the F-02 classifier. Next add the session page shell and start endpoint that perform avatar lookup and trial claiming only after an explicit user action. Then add the message endpoint that enforces time, safety, persistence, ordinary generation, retry, and safe events. Then build the timed chat React island and dashboard integration. Finally add tests, privacy sweeps, docs, and manual local browser verification while leaving hosted verification owner-dependent.

## Critical Implementation Details

### State Sequencing

A message turn is persisted only after safety allows or constrains continuation and the ordinary AI response succeeds. The endpoint should persist the turn as an ordered `user` message followed by an `assistant` message. Safety `hard_stop`, fail-closed safety, and ordinary AI provider failure must not store raw user text or fake assistant content.

### Timer Authority

The server owns session start and expiry through `startedAt` and `expiresAt`. The browser timer is display-only. The message endpoint rejects requests received at or after `expiresAt`, transitions the session to `expired`, and emits `session.time_limit_reached`. If an ordinary provider request would overrun the remaining time, the endpoint should abort or fail the turn safely rather than appending a response after the time budget is exhausted.

### User Experience Spec

Opening `/dashboard/session` is a preparation state, not a claim. The page must make the user press a clear start control before the one free session is consumed. The visible timer should be non-intrusive, but the time-limit state must be unambiguous and must block the composer both in UI and server code.

### Debug And Observability

Use F-03 session event helpers for lifecycle events. Do not build custom log payloads for session flow and do not pass any private text, generated response, prompt, selected modality/avatar ID, raw provider response, or raw database error into operational logs.

## Phase 1: Session AI Response Boundary

### Overview

Add a separate server-only OpenRouter response helper for ordinary session replies, distinct from the F-02 safety classifier and mockable in tests.

### Changes Required:

#### 1. Session AI Types

**File**: `src/lib/session-ai/types.ts`

**Intent**: Define the minimal contract for ordinary session response generation without exposing provider payloads to route handlers or UI.

**Contract**: Export input/output types for a session response request. The input includes the current user message, selected modality display/style hint, optional F-02 caution constraints, and a bounded recent-message context for the active session. The output includes only assistant text and safe provider metadata needed for control flow, not raw OpenRouter payloads.

#### 2. Session Response Prompt

**File**: `src/lib/session-ai/session-response-prompt.ts`

**Intent**: Keep ordinary session prompt construction narrow, non-clinical, and modality-aware.

**Contract**: Build a system/user message set that frames SafeSpace as educational simulation, not therapy or diagnosis. It incorporates the selected `sessionStyleHint` and any F-02 caution constraints, tells the model not to diagnose, prescribe, replace a specialist, or provide risk-increasing instructions, and avoids adding raw session summaries because S-06 is out of scope.

#### 3. OpenRouter Session Response Client

**File**: `src/lib/session-ai/openrouter-session-response.ts`

**Intent**: Call OpenRouter for ordinary non-streaming session responses through Worker-compatible `fetch`.

**Contract**: Export a function that posts to `https://openrouter.ai/api/v1/chat/completions` with `stream: false`, `Authorization: Bearer <OPENROUTER_API_KEY>`, a configurable model, conservative token/temperature settings, and an explicit timeout. It parses only `choices[0].message.content` into the domain output and maps missing configuration, timeout, rate limit, unavailable provider, and invalid response into stable internal categories without returning raw provider text.

#### 4. Provider Interface

**File**: `src/lib/session-ai/provider.ts`

**Intent**: Make ordinary response generation testable and replaceable without real OpenRouter calls.

**Contract**: Export a small provider interface such as `generateSessionResponse(input): Promise<SessionAiResponse>`. Production wiring uses OpenRouter; route-level tests inject a mocked provider.

#### 5. Session AI Error And Copy Contract

**File**: `src/lib/session-ai/errors.ts`, `src/lib/session-ai/session-response-copy.ts`

**Intent**: Keep AI generation failures stable and user-safe.

**Contract**: Expose safe error categories such as `missing_configuration`, `provider_timeout`, `provider_rate_limited`, `provider_unavailable`, and `invalid_provider_response`, plus Polish user-facing retry/unavailable copy. Do not include raw OpenRouter messages, request IDs, provider response bodies, prompts, or generated partial text.

#### 6. Session AI Environment

**File**: `astro.config.mjs`, `.env.example`, `README.md`, `context/deployment/deploy-plan.md`

**Intent**: Document ordinary session AI configuration without adding a second required secret.

**Contract**: Reuse `OPENROUTER_API_KEY`. Add optional `OPENROUTER_SESSION_MODEL` with a code default such as `openai/gpt-4o-mini`. Build must not require the optional model variable. Secrets remain server-only and are not exposed to client islands.

### Success Criteria:

#### Automated Verification:

- `npm run test` completes successfully for session AI tests.
- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search confirms ordinary OpenRouter response generation lives only under `src/lib/session-ai/`.
- Source search confirms no OpenRouter API key, prompt text, provider payload, or generated response is referenced from client components.
- Source search confirms session AI tests mock the provider/fetch and do not make real network calls.

#### Manual Verification:

- The ordinary response prompt is educational, modality-aware, non-diagnostic, and does not claim to replace a specialist.
- `OPENROUTER_API_KEY` remains the only required OpenRouter secret; `OPENROUTER_SESSION_MODEL` is optional/configuration only.
- The helper is clearly separate from `src/lib/session-safety/` and does not weaken the F-02 classifier contract.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding `- [ ]` checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Session Start And Page Shell

### Overview

Add the protected session preparation page and the explicit start endpoint. Entering the page must not consume the free trial.

### Changes Required:

#### 1. Current Avatar Read Helper

**File**: `src/lib/session-flow/avatar-choice.ts`

**Intent**: Give S-04 a server-side way to load and validate the current S-03 avatar choice without duplicating page-only dashboard code.

**Contract**: Export a helper that reads `user_avatar_choices` for the authenticated user through the existing Supabase client, validates the pair against `getValidAvatarChoice()`, and returns either the selected catalog item or a stable missing/fetch error. It must not log `modalityId`, `avatarId`, row contents, or raw Supabase errors.

#### 2. Session State Helper

**File**: `src/lib/session-flow/session-state.ts`

**Intent**: Centralize the rules for locating the user's current trial session state for the page and endpoints.

**Contract**: Export helpers for reading the latest owned trial session metadata, detecting active/expired/completed/interrupted states, computing remaining seconds from server timestamps, and choosing the start-page state. These helpers use `src/lib/session-data/` and return safe view models without message content unless explicitly requested for the active owned session.

#### 3. Protected Session Page

**File**: `src/pages/dashboard/session.astro`

**Intent**: Provide the SSR shell for preparation, active session, and end states under the existing protected dashboard namespace.

**Contract**: The page uses `Layout` with `lang="pl"`, `getSessionDataContext()`, the avatar read helper, trial availability/session state helpers, and safe operational context. If no avatar exists, it redirects to `/dashboard/avatar` before any claim is attempted. If a trial is already used, it renders the saved end state without a full S-05 history list. If no trial exists, it renders the preparation/start state. If an active session exists, it loads its owned messages and renders the chat island.

#### 4. Start Endpoint

**File**: `src/pages/api/session/start.ts`

**Intent**: Start the free trial only after a deliberate user action.

**Contract**: Export `POST`. The route authenticates with `getSessionDataContext()`, loads the current avatar choice, reads trial availability, calls `claimFreeTrialSession()` with `startedAt`, `expiresAt`, `modalityId`, and `avatarId`, transitions the created session to `active`, logs `session.start_attempted` through F-03, and returns a safe JSON state or redirects based on the chosen UI pattern. Missing avatar returns a safe response that points to `/dashboard/avatar` without claiming the trial. Duplicate claim returns a safe `trial_already_claimed` state.

#### 5. Dashboard Entry Point

**File**: `src/pages/dashboard.astro`

**Intent**: Replace "first session is future work" copy with the real S-04 entry point when the user has a saved avatar.

**Contract**: When `currentSelection` exists, show a primary action to `/dashboard/session` and copy that the user can start the first 15-minute session. When no avatar exists, keep the existing avatar-choice next step. Do not add history, summary, or paid-upgrade UI.

### Success Criteria:

#### Automated Verification:

- Route/helper tests cover missing auth, missing avatar, no trial yet, active trial, expired trial, and duplicate-trial states with mocks.
- `npm run test` completes successfully.
- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search confirms `/dashboard/session` page GET does not call `claimFreeTrialSession()`.
- Source search confirms only `src/pages/api/session/start.ts` starts the free trial through `claimFreeTrialSession()`.
- Source search confirms missing-avatar start does not create or claim a session.

#### Manual Verification:

- Visiting `/dashboard/session` without a saved avatar redirects to `/dashboard/avatar` or shows the avatar prerequisite before any trial is consumed.
- Visiting `/dashboard/session` with a saved avatar shows a preparation screen and does not consume the trial.
- Clicking start creates one active trial session with a 15-minute expiry and snapshots the current modality/avatar.
- A user who already claimed the free trial cannot start a second trial through refresh, repeat click, or direct POST.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Message Flow With Safety And Persistence

### Overview

Add the server endpoint that accepts one message turn at a time, enforces time, evaluates safety, generates a non-streaming response, persists successful turns, and returns safe retry/hard-stop states.

### Changes Required:

#### 1. Message Request Contract

**File**: `src/lib/session-flow/message-contract.ts`

**Intent**: Keep the session message API narrow and predictable.

**Contract**: Define request/response types for sending a message. Request fields include the active session ID and trimmed message text. Response variants include success with user/assistant messages, caution with visible safety copy plus assistant response, hard-stop with F-02 copy/resources, expired, retryable AI failure, validation failure, and missing/unauthorized session. No raw provider/database errors are part of the response.

#### 2. Message Endpoint

**File**: `src/pages/api/session/message.ts`

**Intent**: Process active session turns through the required F-01/F-02/F-03 sequence.

**Contract**: Export `POST`. The route authenticates with `getSessionDataContext()`, validates message length and active session ownership, checks the server-side timer before safety, calls `evaluateSessionSafety()` before ordinary generation, logs the decision via `buildSessionSafetyEvaluatedEventFromDecision()`, and branches on `decision.action`. It only calls ordinary AI generation for `allow` and `allow_with_constraints`.

#### 3. Safety Hard-stop Handling

**File**: `src/pages/api/session/message.ts`

**Intent**: Stop ordinary simulation without storing raw hard-stop text.

**Contract**: For `hard_stop` and fail-closed safety decisions, return `decision.copy` and `decision.crisisResources`, optionally transition the session to `interrupted` when the decision represents actual crisis or fail-closed unavailability, and do not append the raw user message or an assistant message to `session_messages`.

#### 4. Caution Handling

**File**: `src/pages/api/session/message.ts`, `src/lib/session-ai/session-response-prompt.ts`

**Intent**: Continue safe, constrained conversation when F-02 returns `allow_with_constraints`.

**Contract**: Pass `decision.constraints` into the ordinary response helper, return a short visible caution notice to the UI, persist the successful turn only after ordinary response success, and keep the copy non-alarming. Do not treat `caution` as a hard stop.

#### 5. Ordinary AI Failure Handling

**File**: `src/pages/api/session/message.ts`

**Intent**: Let the user retry provider failures without corrupting conversation history.

**Contract**: If ordinary AI generation fails after an allowed/constrained safety decision, return a safe retryable state, emit `session.ai_provider_failed`, and do not append a fake assistant message. To avoid duplicate user messages on retry, do not persist the user message unless the assistant response is also ready to persist as the same turn.

#### 6. Message Persistence Ordering

**File**: `src/lib/session-flow/message-persistence.ts`

**Intent**: Keep successful message order stable and owner-bound.

**Contract**: Export a helper that reads owned active session messages, computes the next sequence indices, appends the user message and assistant message through `appendSessionMessage()`, and returns safe message view models. The helper must handle sequence conflicts as a safe retry/failure state and must not bypass the F-01 repository helpers.

#### 7. Time-limit Enforcement

**File**: `src/lib/session-flow/time-limit.ts`, `src/pages/api/session/message.ts`

**Intent**: Make the 15-minute limit authoritative on the server.

**Contract**: Compute expiration from session metadata. If the server receives a message at or after `expiresAt`, transition the session to `expired`, emit `session.time_limit_reached`, and return an expired state without evaluating safety or calling ordinary AI. Provider calls should use a timeout that respects the remaining time budget.

### Success Criteria:

#### Automated Verification:

- Route-level tests cover `allow`, `allow_with_constraints`, `hard_stop`, fail-closed safety, ordinary AI failure, expired session, invalid message, missing auth, missing session, and duplicate sequence behavior with mocked providers/repositories.
- `npm run test` completes successfully.
- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search confirms `evaluateSessionSafety()` is called before ordinary session AI generation.
- Source search confirms hard-stop/fail-closed branches do not call `appendSessionMessage()` with raw user text.
- Source search confirms no route logs `message`, `prompt`, `content`, AI output, raw provider payload, raw Supabase error, `modalityId`, or `avatarId`.

#### Manual Verification:

- A normal message returns a visible assistant response and persists the user/assistant turn.
- A caution decision shows a short visible boundary message and still returns an assistant response.
- A hard-stop or fail-closed safety decision shows safe copy/resources and does not save the raw triggering text.
- An ordinary AI provider failure shows retry/unavailable UI and does not save a fake assistant response.
- A message submitted after the timer expires is rejected and marks the session expired.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Timed Chat UI And End States

### Overview

Build the interactive browser session surface: start state, message list, composer, remaining-time display, response-progress state, caution/hard-stop/fail-closed messages, and time-limit end state.

### Changes Required:

#### 1. Session Chat Island

**File**: `src/components/session/TimedSession.tsx`

**Intent**: Provide the first real browser conversation UI without adding full history or summaries.

**Contract**: The component receives initial session state from `/dashboard/session`, including session ID, server timestamps, selected avatar view data, existing active-session messages, and trial state. It renders the message list, composer, start/retry/end states, and safe notices. It uses client-side state only for the active session UI and posts to `/api/session/start` and `/api/session/message`.

#### 2. Timer Display

**File**: `src/components/session/SessionTimer.tsx`, `src/lib/session-flow/time-limit.ts`

**Intent**: Show non-intrusive remaining time while still making expiry unambiguous.

**Contract**: The timer derives remaining time from server-provided `expiresAt`, updates in the browser, and triggers composer disable when it reaches zero. It should use stable dimensions to avoid layout shifts. The client timer is display-only; server endpoint decisions remain authoritative.

#### 3. Message List And Composer

**File**: `src/components/session/SessionMessages.tsx`, `src/components/session/SessionComposer.tsx`

**Intent**: Let the user conduct a simple typed conversation in the active session.

**Contract**: The message list distinguishes user, assistant, and safe system/boundary notices without exposing technical reason codes as primary UI. The composer trims empty input, disables while an answer is pending, disables after expiry/hard-stop, and keeps button labels concise Polish. It does not attempt token streaming.

#### 4. Response Progress State

**File**: `src/components/session/TimedSession.tsx`

**Intent**: Meet the PRD requirement that the user sees a response or a signal that the response is in progress.

**Contract**: While `/api/session/message` is pending, show a visible but calm "odpowiedz trwa" style indicator. Do not reveal prompt details, provider names, raw errors, or internal safety categories in normal UI.

#### 5. Caution, Hard-stop, Fail-closed, And Retry UI

**File**: `src/components/session/SessionSafetyNotice.tsx`, `src/components/session/TimedSession.tsx`

**Intent**: Render safety outcomes in user-safe Polish copy.

**Contract**: `caution` shows a short continuation boundary and keeps the composer enabled unless the timer expires. `hard_stop` and fail-closed states show F-02 copy/resources and disable ordinary simulation. Ordinary AI failure shows retry/unavailable copy and allows retry only while the session is still active and not expired.

#### 6. Dashboard Integration

**File**: `src/pages/dashboard.astro`

**Intent**: Make the dashboard lead into the real S-04 session once the avatar exists.

**Contract**: Replace "session will be added later" copy with a start/continue action to `/dashboard/session`. If no avatar exists, keep the avatar-choice action. Do not add session history, summaries, or paid upgrade.

### Success Criteria:

#### Automated Verification:

- `npm run test` completes successfully for pure timer/message-state tests where applicable.
- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search confirms no streaming API, EventSource, WebSocket, or pseudo-streaming timer reveal was added.
- Source search confirms no S-05 history list, S-06 summary UI, or paid upgrade UI was added.

#### Manual Verification:

- Local browser smoke verifies: sign in, choose/avatar already selected, open `/dashboard/session`, start session, see timer, send a normal message, see response-progress state, receive non-streaming answer, and see messages stay visible.
- Local browser smoke verifies a mocked or forced caution state shows visible safe-boundary copy and allows continuation.
- Local browser smoke verifies a mocked or forced hard-stop/fail-closed state disables ordinary continuation and shows safe resources/copy.
- Local browser smoke verifies the composer is blocked after the timer reaches zero and a direct message POST after expiry is rejected.
- The temporary dev server used for browser smoke is stopped, and the port/process check confirms it is no longer listening.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Tests, Sweeps, Docs, And Handoff

### Overview

Complete S-04 with focused automated coverage, privacy/source sweeps, local verification notes, and a clear handoff for future Playwright E2E without adding E2E now.

### Changes Required:

#### 1. Vitest Route Test Coverage

**File**: `vitest.config.ts`

**Intent**: Ensure route-level session tests are actually executed by the existing test command.

**Contract**: Extend the current Vitest include pattern beyond `src/lib/**/__tests__/**/*.test.ts` so tests under `src/pages/api/session/__tests__/` run in CI. Keep the environment non-browser and keep route tests fully mocked.

#### 2. Session Flow Tests

**File**: `src/lib/session-flow/__tests__/*.test.ts`, `src/pages/api/session/__tests__/*.test.ts`

**Intent**: Cover the high-risk session decisions with mocks before any future browser E2E exists.

**Contract**: Add unit and route-level tests for timer computation, start-state logic, avatar prerequisite, trial claim conflict, message validation, safety branching, AI retry behavior, no raw persistence on hard-stop/fail-closed, successful turn persistence ordering, and privacy-safe event calls. Tests must not require real Supabase, OpenRouter, Cloudflare, browser, or network calls.

#### 3. Documentation Updates

**File**: `README.md`, `.env.example`, `context/deployment/deploy-plan.md`, `src/lib/session-data/README.md`, `src/lib/session-safety/README.md`, `src/lib/operational-visibility/README.md`

**Intent**: Keep setup and handoff docs aligned now that S-04 is a real user-facing flow.

**Contract**: Document optional `OPENROUTER_SESSION_MODEL`, confirm `OPENROUTER_API_KEY` is required for runtime ordinary and safety AI behavior, document that missing OpenRouter config fails closed/unavailable rather than allowing ordinary simulation, and update handoff docs to say S-04 now implements the first session but S-05/S-06 remain separate.

#### 4. Future E2E Handoff

**File**: `context/changes/first-safe-timed-session/e2e-handoff.md`

**Intent**: Record the user's decision to add Playwright-style E2E later without expanding S-04.

**Contract**: Describe the future E2E scenarios: auth/session setup, avatar prerequisite, conscious start, timer visible, normal message, caution state, hard-stop/fail-closed state, expiry rejection, and no private logs. State that S-04 uses route-level mocks now and does not add Playwright infrastructure.

#### 5. Privacy And Scope Source Sweeps

**File**: `context/changes/first-safe-timed-session/plan.md`

**Intent**: Make final closure checks explicit for implementation and review.

**Contract**: Source sweeps cover direct private table inserts outside `src/lib/session-data/`, raw content logging, prompt/provider payload logging, service-role runtime secrets, client-side OpenRouter key exposure, hard-stop persistence of raw text, S-05/S-06/S-07 scope creep, and streaming/pseudo-streaming scope creep.

#### 6. Verification Notes

**File**: `context/changes/first-safe-timed-session/verification.md`

**Intent**: Record what was actually verified locally or hosted without overstating environment-dependent evidence.

**Contract**: Add the local commands, local browser smoke outcome, mocked/fake provider limitations, hosted Supabase/OpenRouter/Cloudflare limitations if any, and the dev-server shutdown/port check. Hosted verification can remain pending if owner-owned secrets or deployment are not available.

#### 7. Change Status

**File**: `context/changes/first-safe-timed-session/change.md`

**Intent**: Keep the change lifecycle accurate for `/10x-implement` and later review.

**Contract**: The plan starts with `status: planned`. Implementation may move it to later states as phases land. Do not mark the change implemented until the code, automated checks, manual local smoke, privacy sweeps, and evidence notes are complete or explicitly pending where environment-owned.

### Success Criteria:

#### Automated Verification:

- `npm run test` completes successfully.
- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- `git diff --check` reports no whitespace errors.
- Source search confirms `vitest.config.ts` includes route-level session endpoint tests.
- Source search confirms no committed OpenRouter key, Supabase secret, service-role key, token, cookie, or password value exists.
- Source search confirms no `console.log` or operational event includes `message`, `prompt`, `content`, generated answer text, summary, raw provider payload, raw Supabase error, `modalityId`, or `avatarId`.
- Source search confirms no direct `.from("therapy_sessions")`, `.from("session_messages")`, or `.from("session_trial_claims")` writes exist outside `src/lib/session-data/`.
- Source search confirms no S-05 history list, S-06 summary generation/UI, S-07 admin content access, payment flow, streaming endpoint, EventSource, or WebSocket was added.
- `context/changes/first-safe-timed-session/plan.md`, `plan-brief.md`, and `e2e-handoff.md` exist.

#### Manual Verification:

- Local browser smoke covers conscious start, visible timer, normal message, response-progress state, non-streaming answer, and expiry behavior.
- Local browser smoke covers or documents mocked/forced caution and hard-stop/fail-closed states.
- `verification.md` records local commands, browser smoke result, limitations, and dev-server shutdown evidence.
- Hosted Supabase/OpenRouter/Cloudflare checks are recorded if performed; if not performed, the limitation remains explicit and no hosted-only evidence item is marked complete.
- The plan handoff makes clear that future Playwright E2E is wanted but out of S-04 implementation scope.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before considering the change implemented.

---

## Testing Strategy

### Unit Tests:

- Test ordinary session AI prompt construction with modality hints and caution constraints.
- Test OpenRouter ordinary response parsing and safe error mapping with mocked fetch.
- Test session state helpers for no avatar, no trial, active trial, expired trial, completed/interrupted trial, and duplicate trial claim.
- Test timer helpers for remaining time, expiry, and provider timeout budget.
- Test message-state reducers/view models for normal, caution, hard-stop, fail-closed, provider failure, and expired states.

### Route-Level Tests:

- Test `/api/session/start` with mocked session-data/avatar helpers for missing auth, missing avatar, successful start, and trial already claimed.
- Test `/api/session/message` with mocked safety provider, ordinary AI provider, session repository, and operational logger for all selected branches.
- Verify hard-stop/fail-closed branches do not call message append with raw user text.
- Verify ordinary AI failure does not append a fake assistant response and allows retry while active.
- Verify expired sessions reject new messages before safety or ordinary AI generation.

### Future E2E Tests:

- Do not add Playwright in S-04.
- Record the future Playwright scenarios in `context/changes/first-safe-timed-session/e2e-handoff.md`.
- Future E2E should use test-controlled auth/session setup and mocked provider behavior before attempting real hosted OpenRouter checks.

### Manual Testing Steps:

1. Run `npm run test`, `npx astro sync`, `npm run lint`, and `npm run build`.
2. Start the app locally with Supabase and OpenRouter configuration or documented mocks/fallbacks.
3. Sign in and confirm `/dashboard` links to avatar choice when no avatar exists.
4. Save or use an existing avatar choice and open `/dashboard/session`.
5. Confirm opening `/dashboard/session` does not consume the free trial until the start action is clicked.
6. Click start and confirm a 15-minute timer appears with the selected avatar context.
7. Send a normal message and confirm response-progress state appears before a non-streaming answer.
8. Confirm the successful turn stays visible and is stored through the active session.
9. Force/mock a caution decision and confirm the boundary notice appears while continuation remains possible.
10. Force/mock a hard-stop or fail-closed decision and confirm ordinary continuation is disabled and safe copy/resources are shown.
11. Force expiry or wait until timer reaches zero and confirm the composer blocks new messages.
12. Attempt direct message POST after expiry and confirm the server rejects it.
13. Search source/diff for private logging and scope creep terms listed in Phase 5.
14. Stop the temporary dev server and verify no process is listening on the dev port.
15. Record commands, browser smoke result, limitations, and shutdown evidence in `verification.md`.

## Performance Considerations

S-04 uses non-streaming AI responses for MVP simplicity. Keep the ordinary response prompt bounded to the current user message plus a small recent-message window from the active session, not the full raw history. Use explicit provider timeouts and respect the remaining session time budget. Disable the composer while a request is pending so the single-user MVP avoids concurrent turn races; the database sequence unique constraint remains the backstop for duplicate submissions.

The timer should be client-rendered from server timestamps and should not poll the server every second. Session messages are sensitive but expected to be small for a 15-minute session; route handlers should fetch only the active owned session messages needed for the current page/turn.

## Migration Notes

No new Supabase migration is planned for S-04. The slice depends on the F-01 private session tables and S-03 avatar table already present under `supabase/migrations/`. If hosted Supabase has not applied those migrations, S-04 hosted verification remains pending.

Runtime configuration reuses `OPENROUTER_API_KEY` and adds optional `OPENROUTER_SESSION_MODEL`. Do not add `SUPABASE_SERVICE_ROLE_KEY`, OpenRouter management keys, or client-exposed AI secrets.

## References

- Roadmap north-star S-04: `context/foundation/roadmap.md:24`
- Roadmap S-04 details: `context/foundation/roadmap.md:145`
- PRD first session story: `context/foundation/prd.md:51`
- PRD free session and avatar prerequisite: `context/foundation/prd.md:60`
- PRD one free 15-minute session: `context/foundation/prd.md:74`
- PRD visible duration and response-progress requirements: `context/foundation/prd.md:81`, `context/foundation/prd.md:104`
- PRD crisis interruption requirement: `context/foundation/prd.md:105`
- Modality catalog and style hints: `src/lib/modalities.ts:1`
- Current dashboard avatar integration: `src/pages/dashboard.astro:16`
- F-01 session data usage rules: `src/lib/session-data/README.md:7`
- F-01 first free session handoff: `src/lib/session-data/README.md:46`
- F-01 S-04 handoff: `src/lib/session-data/README.md:66`
- Trial claim helper: `src/lib/session-data/quota.ts:41`
- Message append helper: `src/lib/session-data/repository.ts:321`
- Lifecycle transition helper: `src/lib/session-data/repository.ts:280`
- F-02 S-04 rules: `src/lib/session-safety/README.md:5`
- Safety evaluator: `src/lib/session-safety/evaluate-session-safety.ts:47`
- F-03 S-04 handoff: `src/lib/operational-visibility/README.md:27`
- Session operational event helpers: `src/lib/operational-visibility/session-events.ts:192`
- Operational request context helper: `src/lib/operational-visibility/request-context.ts:66`
- OpenRouter chat completions: `https://openrouter.ai/docs/api-reference/chat-completion`
- OpenRouter GPT-4o-mini model parameters: `https://openrouter.ai/openai/gpt-4o-mini?tab=parameters`
- Progress format reference: `.agents/skills/10x-plan/references/progress-format.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.agents/skills/10x-plan/references/progress-format.md`.

### Phase 1: Session AI Response Boundary

#### Automated

- [x] 1.1 `npm run test` completes successfully for session AI tests. — dd065dd
- [x] 1.2 `npx astro sync` completes successfully. — dd065dd
- [x] 1.3 `npm run lint` completes successfully. — dd065dd
- [x] 1.4 `npm run build` completes successfully. — dd065dd
- [x] 1.5 Source search confirms ordinary OpenRouter response generation lives only under `src/lib/session-ai/`. — dd065dd
- [x] 1.6 Source search confirms no OpenRouter API key, prompt text, provider payload, or generated response is referenced from client components. — dd065dd
- [x] 1.7 Source search confirms session AI tests mock the provider/fetch and do not make real network calls. — dd065dd

#### Manual

- [x] 1.8 The ordinary response prompt is educational, modality-aware, non-diagnostic, and does not claim to replace a specialist. — dd065dd
- [x] 1.9 `OPENROUTER_API_KEY` remains the only required OpenRouter secret; `OPENROUTER_SESSION_MODEL` is optional/configuration only. — dd065dd
- [x] 1.10 The helper is clearly separate from `src/lib/session-safety/` and does not weaken the F-02 classifier contract. — dd065dd

### Phase 2: Session Start And Page Shell

#### Automated

- [x] 2.1 Route/helper tests cover missing auth, missing avatar, no trial yet, active trial, expired trial, and duplicate-trial states with mocks. — 43e3012
- [x] 2.2 `npm run test` completes successfully. — 43e3012
- [x] 2.3 `npx astro sync` completes successfully. — 43e3012
- [x] 2.4 `npm run lint` completes successfully. — 43e3012
- [x] 2.5 `npm run build` completes successfully. — 43e3012
- [x] 2.6 Source search confirms `/dashboard/session` page GET does not call `claimFreeTrialSession()`. — 43e3012
- [x] 2.7 Source search confirms only `src/pages/api/session/start.ts` starts the free trial through `claimFreeTrialSession()`. — 43e3012
- [x] 2.8 Source search confirms missing-avatar start does not create or claim a session. — 43e3012

#### Manual

- [x] 2.9 Visiting `/dashboard/session` without a saved avatar redirects to `/dashboard/avatar` or shows the avatar prerequisite before any trial is consumed. — 43e3012
- [x] 2.10 Visiting `/dashboard/session` with a saved avatar shows a preparation screen and does not consume the trial. — 43e3012
- [x] 2.11 Clicking start creates one active trial session with a 15-minute expiry and snapshots the current modality/avatar. — 43e3012
- [x] 2.12 A user who already claimed the free trial cannot start a second trial through refresh, repeat click, or direct POST. — 43e3012

### Phase 3: Message Flow With Safety And Persistence

#### Automated

- [x] 3.1 Route-level tests cover `allow`, `allow_with_constraints`, `hard_stop`, fail-closed safety, ordinary AI failure, expired session, invalid message, missing auth, missing session, and duplicate sequence behavior with mocked providers/repositories. — cee6b2a
- [x] 3.2 `npm run test` completes successfully. — cee6b2a
- [x] 3.3 `npx astro sync` completes successfully. — cee6b2a
- [x] 3.4 `npm run lint` completes successfully. — cee6b2a
- [x] 3.5 `npm run build` completes successfully. — cee6b2a
- [x] 3.6 Source search confirms `evaluateSessionSafety()` is called before ordinary session AI generation. — cee6b2a
- [x] 3.7 Source search confirms hard-stop/fail-closed branches do not call `appendSessionMessage()` with raw user text. — cee6b2a
- [x] 3.8 Source search confirms no route logs `message`, `prompt`, `content`, AI output, raw provider payload, raw Supabase error, `modalityId`, or `avatarId`. — cee6b2a

#### Manual

- [x] 3.9 A normal message returns a visible assistant response and persists the user/assistant turn. — cee6b2a
- [x] 3.10 A caution decision shows a short visible boundary message and still returns an assistant response. — cee6b2a
- [x] 3.11 A hard-stop or fail-closed safety decision shows safe copy/resources and does not save the raw triggering text. — cee6b2a
- [x] 3.12 An ordinary AI provider failure shows retry/unavailable UI and does not save a fake assistant response. — cee6b2a
- [x] 3.13 A message submitted after the timer expires is rejected and marks the session expired. — cee6b2a

### Phase 4: Timed Chat UI And End States

#### Automated

- [x] 4.1 `npm run test` completes successfully for pure timer/message-state tests where applicable. — aa104b8
- [x] 4.2 `npx astro sync` completes successfully. — aa104b8
- [x] 4.3 `npm run lint` completes successfully. — aa104b8
- [x] 4.4 `npm run build` completes successfully. — aa104b8
- [x] 4.5 Source search confirms no streaming API, EventSource, WebSocket, or pseudo-streaming timer reveal was added. — aa104b8
- [x] 4.6 Source search confirms no S-05 history list, S-06 summary UI, or paid upgrade UI was added. — aa104b8

#### Manual

- [x] 4.7 Local browser smoke verifies: sign in, choose/avatar already selected, open `/dashboard/session`, start session, see timer, send a normal message, see response-progress state, receive non-streaming answer, and see messages stay visible. — aa104b8
- [x] 4.8 Local browser smoke verifies a mocked or forced caution state shows visible safe-boundary copy and allows continuation. — aa104b8
- [x] 4.9 Local browser smoke verifies a mocked or forced hard-stop/fail-closed state disables ordinary continuation and shows safe resources/copy. — aa104b8
- [x] 4.10 Local browser smoke verifies the composer is blocked after the timer reaches zero and a direct message POST after expiry is rejected. — aa104b8
- [x] 4.11 The temporary dev server used for browser smoke is stopped, and the port/process check confirms it is no longer listening. — aa104b8

### Phase 5: Tests, Sweeps, Docs, And Handoff

#### Automated

- [x] 5.1 `npm run test` completes successfully.
- [x] 5.2 `npx astro sync` completes successfully.
- [x] 5.3 `npm run lint` completes successfully.
- [x] 5.4 `npm run build` completes successfully.
- [x] 5.5 `git diff --check` reports no whitespace errors.
- [x] 5.6 Source search confirms `vitest.config.ts` includes route-level session endpoint tests.
- [x] 5.7 Source search confirms no committed OpenRouter key, Supabase secret, service-role key, token, cookie, or password value exists.
- [x] 5.8 Source search confirms no `console.log` or operational event includes `message`, `prompt`, `content`, generated answer text, summary, raw provider payload, raw Supabase error, `modalityId`, or `avatarId`.
- [x] 5.9 Source search confirms no direct `.from("therapy_sessions")`, `.from("session_messages")`, or `.from("session_trial_claims")` writes exist outside `src/lib/session-data/`.
- [x] 5.10 Source search confirms no S-05 history list, S-06 summary generation/UI, S-07 admin content access, payment flow, streaming endpoint, EventSource, or WebSocket was added.
- [x] 5.11 `context/changes/first-safe-timed-session/plan.md`, `plan-brief.md`, and `e2e-handoff.md` exist.

#### Manual

- [x] 5.12 Local browser smoke covers conscious start, visible timer, normal message, response-progress state, non-streaming answer, and expiry behavior.
- [x] 5.13 Local browser smoke covers or documents mocked/forced caution and hard-stop/fail-closed states.
- [x] 5.14 `verification.md` records local commands, browser smoke result, limitations, and dev-server shutdown evidence.
- [x] 5.15 Hosted Supabase/OpenRouter/Cloudflare checks are recorded if performed; if not performed, the limitation remains explicit and no hosted-only evidence item is marked complete.
- [x] 5.16 The plan handoff makes clear that future Playwright E2E is wanted but out of S-04 implementation scope.
