# Session History Control Implementation Plan

## Overview

Implement S-05: signed-in users can inspect prior conversations and delete a saved conversation from the existing avatar-selection surface. The history is scoped to the avatar currently selected on `/dashboard/avatar`, paginated at 20 conversations per page, and deletion uses the F-01 private data boundary so private messages and summaries are purged while the session tombstone stays minimal.

## Current State Analysis

SafeSpace already has the F-01 private session data boundary, S-03 avatar choice flow, and S-04 first timed session. The roadmap still lists S-05 as proposed, but the current repo is ready because S-04 now persists successful conversation turns and explicitly left history outside its scope.

The existing `/dashboard/avatar` page reads the saved avatar choice directly from `user_avatar_choices` and renders `AvatarChoiceForm` as a React island. `AvatarChoiceForm` already tracks which avatar card is currently selected, which is the right UI state for a history list that reacts before the user saves a new avatar choice.

The session data layer already has owner-bound session metadata and message helpers plus `deleteOwnedSession()`. What is missing is an S-05-specific history contract: avatar-filtered pagination, read-only detail view models, API routes, and UI behavior that avoids message previews on the list.

## Desired End State

On `/dashboard/avatar`, selecting an avatar card updates the page state and shows the user's prior non-deleted conversations with that avatar. The list is paginated with URL query params, uses a fixed page size of 20, and contains only safe metadata such as dates, status, and duration, without message previews.

Opening a conversation shows the full saved user/assistant messages in read-only mode. Deleting a conversation requires confirmation, calls the server-side deletion helper, removes the conversation from the list, and does not restore the free trial or preserve hidden previews.

### Key Discoveries:

- S-05's roadmap outcome is "użytkownik może wrócić do historii sesji i usunąć zapis rozmowy": `context/foundation/roadmap.md:158`.
- FR-006 requires view and delete control because history is a sensitive store: `context/foundation/prd.md:83`.
- Future S-05 must use owner-bound metadata/message helpers and `deleteOwnedSession()`: `src/lib/session-data/README.md:74`.
- `deleteOwnedSession()` already purges messages and summaries before writing a tombstone: `src/lib/session-data/deletion.ts:24`.
- `listOwnedSessionMetadata()` currently supports only non-deleted listing plus limit; S-05 needs avatar filter and page semantics on top: `src/lib/session-data/repository.ts:235`.
- `/dashboard/avatar` currently renders the avatar choice island and still contains stale copy that says session/timer/chat are future work: `src/pages/dashboard/avatar.astro:117`.
- `AvatarChoiceForm` already owns selected-card state through `selectedModalityId`: `src/components/modality/AvatarChoiceForm.tsx:19`.
- `SessionMessages` already renders saved messages with the selected assistant avatar and markdown parsing: `src/components/session/SessionMessages.tsx:107`.
- S-04 verification confirms there is currently no S-05 history UI and no direct private table writes outside `src/lib/session-data/`: `context/changes/first-safe-timed-session/verification.md:21`.

## What We're NOT Doing

- No standalone `/dashboard/history` page for this slice.
- No S-06 summaries, summary generation, summary editing, or next-session context.
- No message previews, titles, generated snippets, search index, or cached conversation excerpts on the history list.
- No admin history or private conversation access.
- No paid upgrade, second session flow, trial reset, or billing behavior.
- No new Supabase migration; S-05 uses the existing F-01 tables and RLS policies.
- No logging of raw messages, prompts, summaries, avatar IDs, modality IDs, session IDs, Supabase raw errors, provider payloads, or user identifiers.

## Implementation Approach

Build a narrow S-05 layer above F-01. First, add history-specific domain types and owner-bound helper contracts that can return a page of conversations for one avatar and the full messages for one selected conversation. Then add JSON API routes for list, detail, and deletion. Finally, extend the `/dashboard/avatar` React island so selecting a card updates `?avatar=<avatarId>&page=<n>`, loads history for that avatar, shows read-only details, and removes deleted conversations after confirmation.

## Critical Implementation Details

### User Experience Spec

History follows the card currently selected in the UI, not only the user's saved current avatar choice. If a user clicks another avatar, the list resets to page 1, updates the URL to that avatar, and fetches that avatar's conversation page before the user saves the new choice.

### Privacy And Deletion Ordering

The list must not expose message previews. Full content appears only in an explicit read-only detail view and must always be read through owner-bound helpers. Deletion must call `deleteOwnedSession()` and treat success as irreversible content removal; the UI should say the conversation text cannot be restored and that deleting it does not create another free trial.

## Phase 1: History Data Contract

### Overview

Create the server-only history model that turns existing F-01 session tables into a paginated, avatar-scoped history contract for S-05.

### Changes Required:

#### 1. Session History Types

**File**: `src/lib/session-data/types.ts`

**Intent**: Add domain types for history list items, detail payloads, and pagination inputs/outputs so API routes and UI do not pass raw Supabase rows around.

**Contract**: Add types for a 20-item page size, avatar-filtered history input, safe list item metadata, detail payload with messages, and pagination metadata. List items must not include `content`, `summaryText`, title, preview, prompt, provider payload, `modalityId`, or `avatarId`.

#### 2. Owner-Bound History Repository

**File**: `src/lib/session-data/repository.ts`

**Intent**: Extend the F-01 server-only boundary with repository functions that can list conversation history by avatar and load a specific owned conversation's messages for details.

**Contract**: Add helper contracts that accept `SessionDataContext`, `avatarId`, one-based `page`, and fixed `pageSize` 20. The list helper returns only non-deleted sessions for that avatar with at least one saved message, ordered newest first, plus `hasNextPage` / `hasPreviousPage`. The detail helper returns a single owned non-deleted session plus its ordered messages.

#### 3. History View Model Helpers

**File**: `src/lib/session-flow/session-history.ts`

**Intent**: Keep UI/API response shaping outside low-level Supabase repository code while preserving the private-data boundary.

**Contract**: Expose functions that validate avatar/page inputs against the static modality catalog, call repository helpers, and return stable S-05 response shapes for list and detail. The helpers must map invalid avatar/page inputs to stable codes and must not expose raw database errors.

#### 4. History Error Contract

**File**: `src/lib/session-flow/session-history-contract.ts`

**Intent**: Define API response types and stable failure codes for list, detail, and delete routes so React code does not branch on raw F-01 errors.

**Contract**: Define success and failure response unions for list/detail/delete. Failure codes should cover missing auth, invalid avatar, invalid page, session not found, read failure, delete failure, and unavailable private data.

### Success Criteria:

#### Automated Verification:

- Unit tests cover invalid avatar, invalid page normalization/rejection, fixed page size 20, newest-first ordering contract, and safe list item shape.
- Unit tests cover detail payload ordering and confirm list payloads do not include message content or previews.
- `npm run test` passes for the new and existing test suite.

#### Manual Verification:

- Developer review confirms the list contract contains enough metadata for users to recognize a conversation without exposing message snippets.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: History API And Delete Contract

### Overview

Add private session history endpoints that authenticate through F-01, return JSON for the avatar-page UI, and delete conversations only through `deleteOwnedSession()`.

### Changes Required:

#### 1. History List API

**File**: `src/pages/api/session/history/index.ts`

**Intent**: Provide the React avatar page with a paginated history list for the selected avatar.

**Contract**: Export `GET`. It must call `getSessionDataContext(context)` first, parse `avatar` and `page` from `context.url.searchParams`, enforce page size 20 server-side, and return the list response from `session-history` helpers. Missing auth returns 401, invalid input returns 400, and backend read failures return a safe 503/500-style stable response without raw Supabase details.

#### 2. History Detail And Delete API

**File**: `src/pages/api/session/history/[sessionId].ts`

**Intent**: Let the UI open one read-only conversation and delete one owned conversation after confirmation.

**Contract**: Export `GET` for details and `DELETE` for deletion. Both methods must call `getSessionDataContext(context)` first and use owner-bound helpers. `GET` returns full ordered messages for the owned non-deleted session. `DELETE` calls `deleteOwnedSession()` with `deletionReasonCode: "user_request"` and returns a safe success body that does not include content, `modalityId`, or `avatarId`.

#### 3. API Route Tests

**File**: `src/pages/api/session/__tests__/session-history-route.test.ts`

**Intent**: Match the existing route-level mocking pattern used by S-04 and cover the high-risk auth/input/delete paths.

**Contract**: Tests should mock the session data context and history helpers. Cover missing auth, invalid avatar/page, successful list, successful detail, owned session not found, successful delete, already-deleted/delete failure mapping, and safe response shape.

#### 4. No Private Operational Logs

**File**: `src/pages/api/session/history/index.ts`, `src/pages/api/session/history/[sessionId].ts`

**Intent**: Avoid expanding F-03 logs with private-adjacent payloads unless a safe operational event contract is explicitly added.

**Contract**: Do not log request bodies, avatar IDs, session IDs, message counts tied to an identifier, raw database errors, messages, summaries, prompts, or provider payloads. If any logging is added, it must go through F-03 allowlisted fields only and pass the final source sweeps.

### Success Criteria:

#### Automated Verification:

- Route tests pass for list, detail, delete, missing auth, invalid input, not-found, and delete failure paths.
- API responses never include raw Supabase `message`, `details`, `hint`, private message content on list responses, or deleted tombstone avatar/modality fields.
- `npm run test` passes for all route and helper tests.

#### Manual Verification:

- Developer review confirms deletion cannot bypass `deleteOwnedSession()` and cannot be implemented as UI-only hiding.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Avatar Page History UI

### Overview

Integrate S-05 into the existing `/dashboard/avatar` surface. Selecting an avatar card should show that avatar's history, with URL-backed pagination, read-only details, and confirmation-based deletion.

### Changes Required:

#### 1. Avatar Page Initial State

**File**: `src/pages/dashboard/avatar.astro`

**Intent**: Pass validated initial history selection and copy to the React island, and remove stale S-03/S-04 wording that says session/timer/chat are still future work.

**Contract**: Parse `avatar` and `page` query params using the static catalog. If `avatar` is valid, the matching card is initially selected; otherwise use the saved current selection. Pass enough safe initial state to the island to render the selected avatar and page number consistently after refresh.

#### 2. Avatar Choice Form Integration

**File**: `src/components/modality/AvatarChoiceForm.tsx`

**Intent**: Keep avatar selection and history together on the same screen without turning the save form into the history delete surface.

**Contract**: Extend props for initial selected avatar/page and render a separate history component below or beside the avatar cards. On card selection, reset history to page 1, update `?avatar=<avatarId>&page=1`, and fetch the selected avatar's history without requiring the user to save that avatar choice.

#### 3. Session History Panel

**File**: `src/components/modality/AvatarSessionHistory.tsx`

**Intent**: Provide the user-facing list, pagination controls, detail loading state, read-only conversation display, delete confirmation, and post-delete feedback for S-05.

**Contract**: Render at most 20 list items per page. List entries show safe metadata only: date/time, lifecycle status label, duration bucket or elapsed time if available, and an action to open details. Opening details fetches the conversation and reuses `SessionMessages` or a read-only equivalent. Deleting requires a confirmation dialog and removes/refetches the deleted item after success.

#### 4. Read-Only Message Rendering

**File**: `src/components/session/SessionMessages.tsx`

**Intent**: Reuse the established message rendering style for history details without showing composer, pending AI status, or active-session copy.

**Contract**: Either make `isPending` optional/false-safe and customize empty copy, or add a small read-only wrapper that passes stored messages to the existing renderer. The history detail state must never offer message sending, retry, timer restart, or session continuation.

#### 5. Component Tests

**File**: `src/components/modality/__tests__/AvatarSessionHistory.test.tsx`

**Intent**: Verify the new UI contract with server-rendered component tests similar to existing component tests.

**Contract**: Tests should cover rendering 20-or-fewer items, no message preview in the list, read-only detail copy, selected-avatar labels, delete confirmation copy, and disabled/empty/error states.

### Success Criteria:

#### Automated Verification:

- Component tests confirm the list does not render private message content before detail is opened.
- Component tests confirm pagination controls and read-only detail affordances render from safe props.
- `npm run test` passes for component, route, and helper tests.

#### Manual Verification:

- On `/dashboard/avatar`, selecting each avatar changes the history list for that avatar before saving the choice.
- The URL updates to `?avatar=<avatarId>&page=<n>` and refresh preserves the selected avatar/page.
- The list shows a maximum of 20 conversations per page.
- Opening details shows the full read-only conversation and no composer, timer restart, retry, or send action.
- Confirmed deletion removes the conversation from the visible list and shows neutral confirmation.
- Cancelling deletion leaves the conversation visible and unchanged.
- The avatar save flow still works and does not accidentally delete or change history.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Tests And Privacy Sweeps

### Overview

Run the full local quality gate and add source sweeps specific to S-05's private-history risk.

### Changes Required:

#### 1. Full Automated Gate

**File**: `package.json`, existing scripts

**Intent**: Verify S-05 against the same local gate used by S-04.

**Contract**: Run `npm run test`, `npx astro sync`, `npm run lint`, `npm run build`, and `git diff --check`.

#### 2. Private Table Access Sweep

**File**: source tree

**Intent**: Ensure S-05 did not introduce direct private table access outside the F-01 boundary.

**Contract**: Search for direct `.from("therapy_sessions")`, `.from("session_messages")`, `.from("session_summaries")`, and `.from("session_trial_claims")` usage outside `src/lib/session-data/`. The only allowed private table access remains inside the session-data boundary.

#### 3. Private Logging Sweep

**File**: source tree

**Intent**: Ensure history and delete flows do not log private content or identifiers.

**Contract**: Search for new `console.*` calls and operational log payloads in S-05 paths. Confirm no logged field or value contains raw `message`, `prompt`, `content`, `summary`, raw database/provider error, token/cookie/password, `sessionId`, `modalityId`, `avatarId`, or raw `user.id`.

#### 4. Scope Creep Sweep

**File**: source tree

**Intent**: Prove S-05 did not implement S-06, admin private access, payment, or second-session behavior.

**Contract**: Search for new summary generation/context use, admin-readable private content, paid upgrade UI/API, trial reset, second free session logic, streaming, EventSource, WebSocket, or new AI calls in S-05 paths.

#### 5. Verification Note

**File**: `context/changes/session-history-control/verification.md`

**Intent**: Preserve what was actually verified, including any hosted checks that remain pending.

**Contract**: Record local command results, source sweep results, manual browser smoke status, and explicitly mark hosted Supabase/OpenRouter/Cloudflare evidence as pending if it was not run.

### Success Criteria:

#### Automated Verification:

- `npm run test` passes.
- `npx astro sync` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `git diff --check` passes.
- Private table access sweep passes with private queries isolated to `src/lib/session-data/`.
- Private logging sweep passes with no private content or private identifiers in logs.
- Scope creep sweep passes with no S-06 summaries, admin content access, paid flow, trial reset, or new AI/streaming behavior.

#### Manual Verification:

- Verification note accurately distinguishes local evidence from hosted evidence and does not mark unrun hosted checks complete.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Manual Verification And Closeout

### Overview

Perform a focused browser smoke of the S-05 user journey and leave the implementation ready for `/10x-impl-review`.

### Changes Required:

#### 1. Browser Smoke Matrix

**File**: `context/changes/session-history-control/verification.md`

**Intent**: Record human-visible evidence for the page behavior that unit tests cannot fully prove.

**Contract**: Verify `/dashboard/avatar` with an authenticated user and seeded or real session data. Cover selected-avatar list changes, URL persistence, pagination, detail read-only state, delete confirmation, delete success, delete cancel, empty state, and error state.

#### 2. Regression Check Against S-04

**File**: `src/pages/dashboard/session.astro`, `src/pages/api/session/message.ts`

**Intent**: Ensure adding history did not break the active first-session flow.

**Contract**: Verify that `/dashboard/session` can still read active messages, send a normal message, enforce expired/non-active states, and treat a deleted session as unavailable/non-active without leaking deleted content.

#### 3. Closeout Handoff

**File**: `context/changes/session-history-control/verification.md`

**Intent**: Make the final state inspectable for implementation review.

**Contract**: Summarize completed commands, manual checks, known warnings, pending hosted evidence, and any limitations. Do not edit `context/archive/`.

### Success Criteria:

#### Automated Verification:

- Final `npm run test`, `npx astro sync`, `npm run lint`, `npm run build`, and `git diff --check` results are recorded.
- Final source sweeps are recorded in `verification.md`.

#### Manual Verification:

- Authenticated `/dashboard/avatar` smoke confirms selected-avatar history, URL pagination, max 20 conversations, read-only detail, delete confirmation, delete success, and delete cancel.
- S-04 `/dashboard/session` smoke confirms start/message behavior still works for non-deleted sessions.
- Deleted conversation content is no longer visible through list, detail, or refreshed browser state.
- Any hosted checks not run are explicitly marked pending rather than complete.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before marking the change implemented.

---

## Testing Strategy

### Unit Tests:

- History input parsing: invalid avatar, missing avatar, invalid page, page lower than 1, and page size fixed at 20.
- History view model shaping: no message previews on list rows, safe metadata only, newest-first order, has-next/has-previous behavior.
- Detail shaping: full ordered messages only for one owned non-deleted session.
- Delete result shaping: success body does not include private content, avatar ID, modality ID, or raw tombstone internals.

### Integration Tests:

- `GET /api/session/history?avatar=<avatarId>&page=<n>` authenticates first and returns the correct page contract.
- `GET /api/session/history/[sessionId]` returns read-only details for an owned conversation and not-found for missing/unowned/deleted sessions.
- `DELETE /api/session/history/[sessionId]` calls `deleteOwnedSession()` and maps failures to stable codes.
- React history component renders safe list state, loads read-only details, and exposes confirmation before delete.

### Manual Testing Steps:

1. Sign in and open `/dashboard/avatar`.
2. Select each avatar card and confirm the history list switches before saving the choice.
3. Navigate between pages and confirm the URL uses `?avatar=<avatarId>&page=<n>` and refresh keeps the same selection/page.
4. Confirm no page shows more than 20 conversations.
5. Open a history item and confirm the full conversation is read-only.
6. Cancel deletion and confirm the item remains.
7. Confirm deletion and verify the item disappears after refresh.
8. Open `/dashboard/session` and verify the active session flow still works for non-deleted sessions.

## Performance Considerations

Target data volume is sensitive-small and QPS is low, so a server-owned page helper using existing F-01 tables is acceptable for MVP. The API must enforce page size 20 and avoid client-side fetching of unbounded history. If later product usage grows beyond this shape, a separate plan can introduce a database aggregate/RPC for history counts, but S-05 should not add that migration preemptively.

## Migration Notes

No Supabase migration is planned for S-05. The feature uses existing F-01 tables: `therapy_sessions`, `session_messages`, `session_summaries`, and `session_trial_claims`. Hosted verification remains dependent on whether the existing F-01/S-04 migrations are already applied to the target Supabase project.

## References

- Roadmap S-05 outcome: `context/foundation/roadmap.md:158`
- PRD FR-006: `context/foundation/prd.md:83`
- F-01 session data usage rules: `src/lib/session-data/README.md:7`
- F-01 S-05 handoff: `src/lib/session-data/README.md:74`
- Existing session metadata helper: `src/lib/session-data/repository.ts:235`
- Existing deletion helper: `src/lib/session-data/deletion.ts:24`
- Current avatar page: `src/pages/dashboard/avatar.astro:95`
- Current avatar island selected state: `src/components/modality/AvatarChoiceForm.tsx:19`
- Existing message renderer: `src/components/session/SessionMessages.tsx:107`
- S-04 route auth/data pattern: `src/pages/api/session/message.ts:82`
- S-04 verification source sweeps: `context/changes/first-safe-timed-session/verification.md:21`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: History Data Contract

#### Automated

- [x] 1.1 Unit tests cover invalid avatar, invalid page normalization/rejection, fixed page size 20, newest-first ordering contract, and safe list item shape.
- [x] 1.2 Unit tests cover detail payload ordering and confirm list payloads do not include message content or previews.
- [x] 1.3 `npm run test` passes for the new and existing test suite.

#### Manual

- [x] 1.4 Developer review confirms the list contract contains enough metadata for users to recognize a conversation without exposing message snippets.

### Phase 2: History API And Delete Contract

#### Automated

- [ ] 2.1 Route tests pass for list, detail, delete, missing auth, invalid input, not-found, and delete failure paths.
- [ ] 2.2 API responses never include raw Supabase `message`, `details`, `hint`, private message content on list responses, or deleted tombstone avatar/modality fields.
- [ ] 2.3 `npm run test` passes for all route and helper tests.

#### Manual

- [ ] 2.4 Developer review confirms deletion cannot bypass `deleteOwnedSession()` and cannot be implemented as UI-only hiding.

### Phase 3: Avatar Page History UI

#### Automated

- [ ] 3.1 Component tests confirm the list does not render private message content before detail is opened.
- [ ] 3.2 Component tests confirm pagination controls and read-only detail affordances render from safe props.
- [ ] 3.3 `npm run test` passes for component, route, and helper tests.

#### Manual

- [ ] 3.4 On `/dashboard/avatar`, selecting each avatar changes the history list for that avatar before saving the choice.
- [ ] 3.5 The URL updates to `?avatar=<avatarId>&page=<n>` and refresh preserves the selected avatar/page.
- [ ] 3.6 The list shows a maximum of 20 conversations per page.
- [ ] 3.7 Opening details shows the full read-only conversation and no composer, timer restart, retry, or send action.
- [ ] 3.8 Confirmed deletion removes the conversation from the visible list and shows neutral confirmation.
- [ ] 3.9 Cancelling deletion leaves the conversation visible and unchanged.
- [ ] 3.10 The avatar save flow still works and does not accidentally delete or change history.

### Phase 4: Tests And Privacy Sweeps

#### Automated

- [ ] 4.1 `npm run test` passes.
- [ ] 4.2 `npx astro sync` passes.
- [ ] 4.3 `npm run lint` passes.
- [ ] 4.4 `npm run build` passes.
- [ ] 4.5 `git diff --check` passes.
- [ ] 4.6 Private table access sweep passes with private queries isolated to `src/lib/session-data/`.
- [ ] 4.7 Private logging sweep passes with no private content or private identifiers in logs.
- [ ] 4.8 Scope creep sweep passes with no S-06 summaries, admin content access, paid flow, trial reset, or new AI/streaming behavior.

#### Manual

- [ ] 4.9 Verification note accurately distinguishes local evidence from hosted evidence and does not mark unrun hosted checks complete.

### Phase 5: Manual Verification And Closeout

#### Automated

- [ ] 5.1 Final `npm run test`, `npx astro sync`, `npm run lint`, `npm run build`, and `git diff --check` results are recorded.
- [ ] 5.2 Final source sweeps are recorded in `verification.md`.

#### Manual

- [ ] 5.3 Authenticated `/dashboard/avatar` smoke confirms selected-avatar history, URL pagination, max 20 conversations, read-only detail, delete confirmation, delete success, and delete cancel.
- [ ] 5.4 S-04 `/dashboard/session` smoke confirms start/message behavior still works for non-deleted sessions.
- [ ] 5.5 Deleted conversation content is no longer visible through list, detail, or refreshed browser state.
- [ ] 5.6 Any hosted checks not run are explicitly marked pending rather than complete.
