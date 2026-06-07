# Session History Control - Plan Brief

> Full plan: `context/changes/session-history-control/plan.md`

## What & Why

S-05 lets a signed-in user return to saved conversation history and delete a saved conversation. This matters because SafeSpace stores highly sensitive session content; the user needs visible control over that history before S-06 can use summaries for continuity.

## Starting Point

F-01 and S-04 are already present: successful session turns are saved through `src/lib/session-data/`, and `deleteOwnedSession()` already purges private messages/summaries before writing a minimal tombstone. `/dashboard/avatar` already has a React island with selected-card state, but it does not show history yet.

## Desired End State

On `/dashboard/avatar`, selecting an avatar shows that avatar's prior conversations in a paginated list of at most 20 conversations per page. Opening an item shows the full conversation read-only. Deleting requires confirmation, removes private content through the F-01 helper, and makes the conversation disappear from history.

## Key Decisions Made

| Decision           | Choice                                     | Why                                                                                 | Source          |
| ------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------- | --------------- |
| Surface            | `/dashboard/avatar`                        | User asked for history on the avatar-selection view, scoped to the selected avatar. | Plan            |
| Selection behavior | Reacts to selected card before save        | Matches "po jego zaznaczeniu" and lets users inspect history per avatar.            | Plan            |
| List page size     | 20 conversations                           | User specified max 20 conversations per page.                                       | Plan            |
| URL state          | `?avatar=<avatarId>&page=<n>`              | Refreshable, debuggable, and shareable state for selected avatar/page.              | Plan            |
| Detail behavior    | Full conversation read-only                | Satisfies "return to history" without adding editing or continuation.               | Plan            |
| List privacy       | No previews or snippets                    | Avoids creating another private content surface outside explicit detail view.       | Research / Plan |
| Delete behavior    | `deleteOwnedSession()` then hide from list | F-01 already defines hard-delete content plus minimal tombstone.                    | Research        |
| Verification       | Tests plus source sweeps                   | History touches private content, so functional tests alone are too weak.            | Research / Plan |

## Scope

**In scope:**

- Avatar-filtered session history on `/dashboard/avatar`.
- URL-backed pagination with a fixed page size of 20.
- Safe list metadata, full read-only detail view, and delete confirmation.
- API routes for list, detail, and delete.
- Unit, route, component tests, and privacy/source sweeps.
- Verification note distinguishing local and hosted evidence.

**Out of scope:**

- Standalone `/dashboard/history`.
- S-06 summaries, next-session context, summary generation, or summary UI.
- Message previews, titles, search, cached snippets, or exports.
- Admin private content access, paid upgrade, trial reset, second free session, streaming, or new AI calls.
- New Supabase migration.

## Architecture / Approach

S-05 adds a server-only history contract above F-01, then exposes it through private JSON routes. The existing avatar React island becomes the parent surface: selecting a card updates URL state, fetches that avatar's page of conversations, opens read-only details on demand, and deletes through the server route that calls `deleteOwnedSession()`.

## Phases at a Glance

| Phase                               | What it delivers                                       | Key risk                                             |
| ----------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| 1. History Data Contract            | Typed avatar-filtered history list/detail helpers      | Accidentally exposing previews or raw rows.          |
| 2. History API And Delete Contract  | Authenticated list/detail/delete routes                | Delete could bypass F-01 or leak raw errors.         |
| 3. Avatar Page History UI           | History list, pagination, details, confirmation delete | UI could expose too much content on the list.        |
| 4. Tests And Privacy Sweeps         | Full local gate and privacy/source checks              | Passing UI tests while missing a privacy regression. |
| 5. Manual Verification And Closeout | Browser smoke evidence and handoff                     | Marking hosted evidence done when it was not run.    |

**Prerequisites:** F-01 private session data boundary and S-04 first timed session are present; existing Supabase migrations must be applied for runtime smoke checks.
**Estimated effort:** ~2-3 implementation sessions across 5 phases.

## Open Risks & Assumptions

- Exact "sessions with messages" pagination can be implemented against existing tables because data volume is sensitive-small and QPS is low.
- Hosted Supabase/Cloudflare evidence may remain pending if secrets or deployed data are unavailable during implementation.
- Deleting an active saved conversation should remove its content and not restore the free trial.

## Success Criteria (Summary)

- `/dashboard/avatar` shows max 20 conversations for the currently selected avatar and preserves avatar/page in the URL.
- Conversation details are full read-only history, while list rows contain no private message previews.
- Confirmed deletion removes private content through `deleteOwnedSession()` and the deleted conversation is no longer visible after refresh.
