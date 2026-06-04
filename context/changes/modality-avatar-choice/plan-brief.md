# Modality Avatar Choice — Plan Brief

> Full plan: `context/changes/modality-avatar-choice/plan.md`

## What & Why

Implement S-03: a signed-in user can choose an avatar representing a psychotherapy modality, read a short explanation of that modality, and save the choice before the first timed session exists. This removes the roadmap blocker around the MVP modality list and gives S-04 a stable, privacy-safe input contract.

## Starting Point

SafeSpace already has a protected `/dashboard`, Supabase SSR auth, Polish auth/landing surfaces, and Cloudflare SSR deployment. Supabase is still Auth-only, so this change introduces the first application-data table and must add RLS deliberately.

## Desired End State

`/dashboard/avatar` shows five neutral illustrated avatar cards for the approved MVP modality list. A signed-in user can save or change the current choice, then return to `/dashboard`, where the selected avatar is visible and the first session is still clearly marked as future S-04 work.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Modality list | Five PRP-level modality groups | Closes the roadmap blocker with broad, recognizable categories instead of mixing submodalities. |
| Persistence | Supabase table with RLS | S-04 needs a stable server-side choice tied to the authenticated user. |
| Route | `/dashboard/avatar` | Fits the existing protected dashboard namespace and auth redirect safety contract. |
| UI shape | Avatar cards with short explanations | Meets FR-004 and reduces decision paralysis without a diagnostic quiz. |
| Avatar assets | Neutral illustrated portraits | Makes the choice tangible without implying real clinicians. |
| Change policy | User can change choice before first session | Lets the user explore before S-04 snapshots the choice onto a session. |
| Post-save state | Return to `/dashboard` | Keeps S-03 out of fake chat/session routes while showing progress. |
| S-04 contract | Stable IDs plus neutral style hints | Future session code can read the choice without reusing user-facing marketing copy as a prompt. |

## Scope

**In scope:**

- Static catalog for five MVP modalities and avatars.
- Supabase migration for `user_avatar_choices` with owner-only RLS.
- Protected `/dashboard/avatar` page.
- POST endpoint for saving the current choice.
- React card-selection island.
- Five neutral avatar portrait assets.
- Dashboard summary of the saved choice.
- Manual verification of route protection, upsert behavior, responsive UI, and copy safety.

**Out of scope:**

- Chat UI, timer, AI response generation, typing delay, history, summaries, and crisis handling.
- Recommendation quiz, diagnosis, modality matching, or "best for you" language.
- Real therapist profiles, credentials, booking, admin views, or monetization.
- Auth provider changes, deploy target changes, or new runtime secrets.

## Architecture / Approach

S-03 uses a narrow vertical slice: `src/lib/modalities.ts` defines the closed catalog, Supabase stores the signed-in user's current `modality_id`/`avatar_id`, `/dashboard/avatar` renders the protected choice flow, `/api/profile/avatar` validates and upserts the choice, and `/dashboard` reads the saved row to show the current selection.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data Contract And RLS | Catalog plus `user_avatar_choices` table with RLS | First app table could be unsafe if RLS is too broad. |
| 2. Protected Avatar Flow | `/dashboard/avatar` and save endpoint | Invalid IDs or missing auth could write bad state if validation is weak. |
| 3. Avatar Choice UI And Assets | Card UI and five illustrated portraits | Copy or imagery could imply real therapy or diagnosis. |
| 4. Dashboard Integration And Verification | Current-choice dashboard and final checks | Dashboard could accidentally imply S-04 session functionality exists. |

**Prerequisites:** S-02 auth is implemented; owner approves applying the first Supabase application migration.
**Estimated effort:** ~2 implementation sessions across 4 phases, plus owner time to apply/review hosted Supabase migration if production verification is included.

## Open Risks & Assumptions

- Hosted Supabase migration application is owner-controlled and may not happen in the same coding session.
- No test runner exists, so route and DB behavior rely on manual smoke checks after lint/build.
- S-04 must snapshot the current choice onto each future session; S-03 only stores the current preference.
- Avatar assets must be generated or prepared as owned project assets before the UI can pass visual verification.

## Success Criteria (Summary)

- A signed-in user can choose, save, revisit, and change one of five avatar/modalities.
- The saved choice is owner-only in Supabase and visible on `/dashboard`.
- The UI remains educational, non-diagnostic, and does not imply the first session/chat is already implemented.
