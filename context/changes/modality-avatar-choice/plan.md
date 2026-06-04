# Modality Avatar Choice Implementation Plan

## Overview

Implement S-03: a signed-in user can choose a neutral illustrated avatar representing one MVP psychotherapy modality, read a short educational explanation of the modality, and save that choice as the stable input contract for the future first timed session. The change turns `/dashboard` from a generic private gateway into a gateway with a real next step, while staying out of S-04 chat, timer, AI, history, and crisis-handling implementation.

## Current State Analysis

SafeSpace currently has a protected `/dashboard`, Supabase SSR auth, email/password plus Google OAuth routes, and Polish auth/landing surfaces. Supabase usage is still Auth-only; there are no application migrations under `supabase/migrations/`, so this change is the first application-data slice and must introduce RLS deliberately. The roadmap marks S-03 as blocked by the modality list decision, and that decision is now closed for this plan: the MVP list uses the five broad psychotherapy approach groups named by the Polish Psychotherapy Council (PRP): psychoanalytic/psychodynamic, cognitive-behavioral, humanistic-experiential, systemic, and integrative.

## Desired End State

A signed-in user can open `/dashboard/avatar`, review five avatar cards, choose one, save it, and return to `/dashboard` with the selected avatar visible. The selection is stored in Supabase with owner-only RLS as `user_id`, `modality_id`, and `avatar_id`, plus timestamps. The static modality catalog exposes user-facing display copy and short, neutral future-session style hints so S-04 can read a stable ID contract without turning S-03 into an AI prompt implementation.

### Key Discoveries:

- S-03 outcome is avatar/modality choice with a short explanation: `context/foundation/roadmap.md:132`.
- S-03 was blocked by the missing MVP modality list: `context/foundation/roadmap.md:139`.
- PRD requires the user to choose a psychotherapy avatar before the first session starts: `context/foundation/prd.md:54`.
- FR-004 requires a short explanation because modality choice can otherwise create decision paralysis: `context/foundation/prd.md:79`.
- PRD business logic says each avatar represents a modality and has a character that can influence the conversation style: `context/foundation/prd.md:109`.
- Existing middleware protects `/dashboard` and nested `/dashboard/...` paths through the current route-matching pattern: `src/middleware.ts:5`.
- Auth redirect safety currently allows dashboard-scoped paths, which makes `/dashboard/avatar` compatible with the existing auth contract: `src/lib/auth-redirect.ts:27`.
- `/dashboard` already tells the user avatar choice and the first session are future steps: `src/pages/dashboard.astro:20`.
- Supabase SSR client is available for server routes and Astro pages, but returns `null` when runtime secrets are missing: `src/lib/supabase.ts:5`.
- There are currently no application migrations under `supabase/migrations/`, so S-03 must add the first RLS-backed app table.
- PRP defines five broad psychotherapy approach groups that fit the MVP list decision: psychoanalytic/psychodynamic, cognitive-behavioral, humanistic-experiential, systemic, and integrative: `https://prp.org.pl/wazne-definicje/`.
- NIMH notes that psychotherapy approaches are tailored to the person and situation, so SafeSpace copy must be educational rather than prescriptive: `https://www.nimh.nih.gov/health/topics/psychotherapies`.

## What We're NOT Doing

- No chat UI, AI response generation, timer, typing delay, first-session route, history, summaries, or crisis-detection logic.
- No recommendation quiz, diagnosis, modality matching algorithm, or claim that one modality is best for a user's problem.
- No therapist directory, therapist credentials, booking, real specialist profile, or clinical qualification surface.
- No admin surface and no admin access to private user choices beyond future aggregate analytics work.
- No paid upgrade or monetization flow.
- No new auth provider, auth redirect redesign, or broader account settings work.
- No custom domain, Worker deploy change, or new runtime secret.

## Implementation Approach

Use a small, explicit vertical slice. First add a versioned static modality/avatar catalog in code and a Supabase table for the user's current choice with RLS. Then add a protected dashboard-scoped choice route and POST endpoint that validate all IDs against the catalog before upserting the authenticated user's choice. Build the choice UI as a React island because card selection is interactive, but keep the page shell and dashboard integration Astro-first. Add neutral illustrated portrait assets that make the avatar choice tangible without implying real clinicians. Finish by showing the current choice on `/dashboard` and verifying the new DB, route, UI, and safety-copy contracts.

## Critical Implementation Details

### User experience spec

The cards must frame modalities as educational lenses, not as treatment recommendations. The UI should say that SafeSpace is a simulation/education product and that a real therapy decision should be made with a qualified professional.

### State sequencing

S-03 stores the user's current avatar choice, but S-04 must snapshot that choice onto each future session when a session starts. Until S-04 exists, changing the choice remains allowed from `/dashboard/avatar`.

### Security model

The first application table must be owner-only from day one. RLS policies should allow an authenticated user to select, insert, and update only their own row, and no public or anonymous policy should exist.

## Phase 1: Data Contract And RLS

### Overview

Create the stable modality/avatar catalog and the first Supabase application-data table that stores a user's current choice with RLS.

### Changes Required:

#### 1. Modality Catalog

**File**: `src/lib/modalities.ts`

**Intent**: Define the closed MVP list of modalities and avatars in one importable module so UI, API validation, and future S-04 session setup use the same IDs and copy.

**Contract**: Export a readonly `MVP_MODALITIES` collection and helper functions such as `getModalityById()` / `isValidAvatarChoice()` using these stable IDs: `psychodynamic`, `cbt`, `humanistic_experiential`, `systemic`, `integrative`. Each item includes `modalityId`, `avatarId`, Polish display name, neutral avatar display name, short user-facing explanation, "what this avatar focuses on" copy, `sessionStyleHint`, asset path, and alt text. The hints stay non-clinical and do not instruct AI to diagnose, treat, or replace a professional.

#### 2. Choice Types

**File**: `src/lib/modalities.ts`

**Intent**: Make the selected choice shape explicit for later S-04 consumption.

**Contract**: Export TypeScript types for `ModalityId`, `AvatarId`, `ModalityAvatar`, and a small selected-choice view model. IDs are inferred from the catalog rather than hand-maintained in multiple places.

#### 3. User Choice Migration

**File**: `supabase/migrations/20260531223000_create_user_avatar_choices.sql`

**Intent**: Add the first application-data table for a user's current avatar/modality choice.

**Contract**: Create `public.user_avatar_choices` with `user_id uuid primary key references auth.users(id) on delete cascade`, `modality_id text not null`, `avatar_id text not null`, `created_at timestamptz not null default now()`, and `updated_at timestamptz not null default now()`. Add check constraints for the approved modality IDs and avatar IDs. Enable RLS before adding policies.

#### 4. RLS Policies And Updated Timestamp

**File**: `supabase/migrations/20260531223000_create_user_avatar_choices.sql`

**Intent**: Ensure users can only read and mutate their own avatar choice.

**Contract**: Add owner-only policies for authenticated `select`, `insert`, and `update` using `auth.uid() = user_id`. Add an `updated_at` trigger for updates, scoped to this table. Do not add anonymous access, broad admin access, or service-role assumptions.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search finds exactly one static MVP modality catalog.
- Migration source enables RLS on `public.user_avatar_choices`.

#### Manual Verification:

- The catalog contains exactly five MVP modalities matching the approved list.
- User-facing modality copy is educational and does not diagnose, prescribe, or claim therapeutic effectiveness for a specific user.
- The migration is reviewed for owner-only RLS before it is applied to any hosted Supabase project.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Protected Avatar Flow

### Overview

Add the protected route and server endpoint that let a signed-in user view, save, and revise the current avatar choice.

### Changes Required:

#### 1. Protected Choice Page

**File**: `src/pages/dashboard/avatar.astro`

**Intent**: Provide the signed-in avatar selection page under the already protected dashboard namespace.

**Contract**: The route passes `lang="pl"`, uses `Layout`, reads `Astro.locals.user`, creates a Supabase SSR client, fetches the user's existing row from `user_avatar_choices` when available, and renders the choice island with `MVP_MODALITIES` plus the current selection. If Supabase config is missing or the choice fetch fails, it renders a safe Polish error state without exposing SQL or Supabase internals.

#### 2. Choice Save Endpoint

**File**: `src/pages/api/profile/avatar.ts`

**Intent**: Persist a signed-in user's selected modality/avatar pair.

**Contract**: Export `POST`. The route uses `createClient()`, requires a middleware-visible authenticated user, reads `modalityId` and `avatarId` from `FormData`, validates the pair against `isValidAvatarChoice()`, then upserts into `user_avatar_choices` on `user_id`. Success redirects to `/dashboard?avatar=updated`; validation or persistence failures redirect to `/dashboard/avatar` with a safe stable error message.

#### 3. Choice Error Mapping

**File**: `src/lib/avatar-choice-errors.ts`

**Intent**: Keep user-visible avatar-choice errors stable and Polish, without leaking database or provider errors into URLs.

**Contract**: Expose a small set of error codes/messages for missing auth, invalid choice, config unavailable, fetch failure, and save failure. The endpoint and page use this helper instead of raw error strings.

#### 4. Dashboard Route Contract

**File**: `src/middleware.ts`

**Intent**: Preserve the current protected dashboard contract while confirming `/dashboard/avatar` stays private.

**Contract**: No new auth model is introduced. If the existing `/dashboard` prefix protection already covers `/dashboard/avatar`, leave middleware unchanged and document the verification in the phase. Only edit middleware if the implementation discovers a real protection gap.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search shows the save endpoint validates choices through the catalog helper before writing to Supabase.
- Source search shows no raw Supabase/database error message is written directly into avatar-choice query strings.

#### Manual Verification:

- Anonymous access to `/dashboard/avatar` redirects to `/auth/signin`.
- A signed-in user can open `/dashboard/avatar`.
- Submitting an invalid `modalityId`/`avatarId` pair does not write a row and shows a safe Polish error.
- A valid choice creates or updates exactly the signed-in user's row.
- Reopening `/dashboard/avatar` preselects the saved choice.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Avatar Choice UI And Assets

### Overview

Build the interactive card-based choice experience and add neutral illustrated avatar portraits for all five MVP modalities.

### Changes Required:

#### 1. Avatar Choice Island

**File**: `src/components/modality/AvatarChoiceForm.tsx`

**Intent**: Let a signed-in user compare avatar cards, choose one, and submit the selected pair to the server endpoint.

**Contract**: The component accepts the catalog and optional current selection as props, uses a controlled selected ID state, posts `modalityId` and `avatarId` to `/api/profile/avatar`, and keeps the submit button disabled until a valid card is selected. It follows existing React island patterns, uses `lucide-react` icons where helpful, and does not introduce global state.

#### 2. Card UI And Safety Copy

**File**: `src/components/modality/AvatarChoiceForm.tsx`

**Intent**: Present modality choice as an understandable educational selection, not as diagnosis or therapy matching.

**Contract**: Each card shows the illustrated avatar, avatar name, modality name, short explanation, and what the avatar focuses on. The page-level copy makes clear that the user can change the choice before the first session and that SafeSpace does not replace a specialist. Avoid "recommended for you", "best for anxiety/depression", "treatment", or other prescriptive wording.

#### 3. Avatar Portrait Assets

**File**: `public/avatars/*.png`

**Intent**: Add one neutral, non-photorealistic portrait per avatar so the choice feels concrete without implying a real therapist.

**Contract**: Add five checked-in PNG assets named from the stable avatar IDs, for example `public/avatars/cbt-guide.png`. Each asset has a stable aspect ratio, is referenced by the catalog, and should stay under 250 KB unless the implementer records why a larger file was accepted. Portraits must avoid real-person likeness, medical uniforms, clinic branding, or authoritative credential signals.

#### 4. Choice Page Composition

**File**: `src/pages/dashboard/avatar.astro`

**Intent**: Compose the protected page into a focused choice screen with a route back to `/dashboard`.

**Contract**: The page renders one primary heading, short safety/education copy, the React island, and a secondary link back to `/dashboard`. It should use stable responsive dimensions so card hover/selection states do not shift layout on mobile or desktop.

### Success Criteria:

#### Automated Verification:

- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- All five avatar asset paths referenced by the catalog exist under `public/avatars/`.
- Source search finds no prescriptive copy such as `recommended for you`, `best for`, or `diagnose` in the avatar-choice UI.

#### Manual Verification:

- `/dashboard/avatar` shows five coherent avatar cards on desktop and mobile.
- Selecting a card visibly changes state without resizing or overlapping UI.
- The save button is disabled before selection and enabled after a valid selection.
- Avatar portraits render with meaningful alt text and do not look like real clinicians.
- The page copy explains that the choice is educational and can be changed before the first session.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Dashboard Integration And Verification

### Overview

Show the saved avatar choice on the private dashboard, keep S-04 clearly out of scope, and run final source, build, database, and browser verification.

### Changes Required:

#### 1. Dashboard Current Choice

**File**: `src/pages/dashboard.astro`

**Intent**: Make `/dashboard` reflect whether the signed-in user has chosen an avatar.

**Contract**: The route fetches the current user's `user_avatar_choices` row when Supabase is configured. If a valid selection exists, it shows the avatar/modality summary, an action to change the choice at `/dashboard/avatar`, and copy that the first 15-minute session is the next roadmap slice. If no selection exists, it shows a primary action to choose an avatar. The dashboard must not render a fake chat or enabled session start.

#### 2. Post-Save Feedback

**File**: `src/pages/dashboard.astro`

**Intent**: Confirm successful avatar updates without adding client-side toast infrastructure.

**Contract**: When `avatar=updated` is present in the query string, render a short safe Polish success message and keep the URL behavior server-rendered. Missing or unknown query params are ignored.

#### 3. Topbar And Auth Flow Consistency

**File**: `src/components/Topbar.astro`, `src/lib/auth-redirect.ts`, `src/pages/auth/callback.ts`

**Intent**: Keep navigation and post-auth routing consistent with S-03 without forcing all auth callbacks directly to avatar choice.

**Contract**: Topbar may add or adjust a dashboard-scoped link only if it stays compact. Auth success can continue to land on `/dashboard`; the dashboard then provides the avatar-choice next step. Do not redirect all OAuth/email auth callbacks directly to `/dashboard/avatar` in S-03, because users with an existing choice should still be able to land on the dashboard.

#### 4. Final Verification Sweep

**File**: `context/changes/modality-avatar-choice/plan.md`

**Intent**: Keep execution state mechanical and verify the completed S-03 surface before implementation closure.

**Contract**: `/10x-implement` updates only the `## Progress` section. Any hosted Supabase limitation, such as migrations not yet applied to production, is recorded in implementation notes or PR text without changing phase titles.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- `git diff --check` reports no whitespace errors.
- Source search confirms no S-04 chat/timer/session route was added.
- Migration source contains no service-role key, broad admin policy, or anonymous access policy.

#### Manual Verification:

- `/dashboard` as a signed-in user without a choice shows a clear action to choose an avatar.
- `/dashboard` as a signed-in user with a choice shows the selected avatar/modality and a change action.
- Saving a different choice updates the existing row instead of creating duplicates.
- `/dashboard` still does not imply that the first session/chat is implemented.
- Full visitor/signed-in smoke flow is checked: `/`, `/auth/signin`, `/dashboard`, `/dashboard/avatar`, save, return to `/dashboard`.
- Hosted Supabase migration ownership is clear before deploying S-03 to production.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before considering the change implemented.

---

## Testing Strategy

### Unit Tests:

- No unit test runner is configured for this repo, so S-03 should not introduce one as part of this change.
- Use TypeScript, lint, and build checks to catch catalog typing, React island, Astro page, and route contract errors.
- Catalog validation helpers should be simple enough to verify through source review and endpoint manual tests until a test runner exists.

### Integration Tests:

- No Playwright or browser test runner is configured yet.
- Database integration should be verified manually against local Supabase when available, and through a hosted Supabase smoke check before production deploy.
- Manual endpoint checks cover valid save, invalid IDs, unauthenticated access, and upsert behavior.

### Manual Testing Steps:

1. Apply the migration to a local or hosted Supabase environment with owner approval.
2. Sign in and open `/dashboard`; confirm it prompts for avatar choice when no row exists.
3. Open `/dashboard/avatar`; confirm five cards render correctly on desktop.
4. Resize to mobile; confirm card text, portraits, and buttons do not overlap or shift unexpectedly.
5. Select each card once and confirm the selected state is clear.
6. Save one choice and confirm the browser returns to `/dashboard?avatar=updated`.
7. Confirm `/dashboard` shows the saved avatar/modality and a change action.
8. Change the choice and verify the database still has one row for the user.
9. Submit a malformed request with invalid IDs and confirm no row is written.
10. Open `/dashboard/avatar` as a visitor and confirm redirect to `/auth/signin`.

## Performance Considerations

The only meaningful performance cost is the five avatar images. Keep them non-photorealistic, compressed, dimensioned, and lazy-loaded where appropriate. Avoid adding client-side state beyond the card-selection island; dashboard and page shells remain server-rendered Astro.

## Migration Notes

This change introduces the first application table. Apply the migration only after reviewing owner-only RLS. Hosted Supabase migration application is an owner/deployment step and must not require a service-role key in the Astro/Worker runtime. If production migration is not applied during implementation, S-03 can be merged only with that limitation called out explicitly in PR/deploy notes.

## References

- Roadmap S-03: `context/foundation/roadmap.md:132`
- S-03 blocker: `context/foundation/roadmap.md:139`
- PRD user story avatar prerequisite: `context/foundation/prd.md:54`
- PRD FR-004: `context/foundation/prd.md:79`
- PRD avatar business logic: `context/foundation/prd.md:109`
- Existing dashboard placeholder: `src/pages/dashboard.astro:20`
- Protected dashboard middleware: `src/middleware.ts:5`
- Auth redirect dashboard safety: `src/lib/auth-redirect.ts:27`
- Supabase SSR client: `src/lib/supabase.ts:5`
- PRP modality groups: `https://prp.org.pl/wazne-definicje/`
- NIMH psychotherapy overview and tailoring caution: `https://www.nimh.nih.gov/health/topics/psychotherapies`
- Progress format reference: `.agents/skills/10x-plan/references/progress-format.md:1`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.agents/skills/10x-plan/references/progress-format.md`.

### Phase 1: Data Contract And RLS

#### Automated

- [x] 1.1 `npx astro sync` completes successfully
- [x] 1.2 `npm run lint` completes successfully
- [x] 1.3 `npm run build` completes successfully
- [x] 1.4 Source search finds exactly one static MVP modality catalog
- [x] 1.5 Migration source enables RLS on `public.user_avatar_choices`

#### Manual

- [x] 1.6 The catalog contains exactly five MVP modalities matching the approved list
- [x] 1.7 User-facing modality copy is educational and does not diagnose, prescribe, or claim therapeutic effectiveness for a specific user
- [x] 1.8 The migration is reviewed for owner-only RLS before it is applied to any hosted Supabase project

### Phase 2: Protected Avatar Flow

#### Automated

- [ ] 2.1 `npx astro sync` completes successfully
- [ ] 2.2 `npm run lint` completes successfully
- [ ] 2.3 `npm run build` completes successfully
- [ ] 2.4 Source search shows the save endpoint validates choices through the catalog helper before writing to Supabase
- [ ] 2.5 Source search shows no raw Supabase/database error message is written directly into avatar-choice query strings

#### Manual

- [ ] 2.6 Anonymous access to `/dashboard/avatar` redirects to `/auth/signin`
- [ ] 2.7 A signed-in user can open `/dashboard/avatar`
- [ ] 2.8 Submitting an invalid `modalityId`/`avatarId` pair does not write a row and shows a safe Polish error
- [ ] 2.9 A valid choice creates or updates exactly the signed-in user's row
- [ ] 2.10 Reopening `/dashboard/avatar` preselects the saved choice

### Phase 3: Avatar Choice UI And Assets

#### Automated

- [ ] 3.1 `npm run lint` completes successfully
- [ ] 3.2 `npm run build` completes successfully
- [ ] 3.3 All five avatar asset paths referenced by the catalog exist under `public/avatars/`
- [ ] 3.4 Source search finds no prescriptive copy such as `recommended for you`, `best for`, or `diagnose` in the avatar-choice UI

#### Manual

- [ ] 3.5 `/dashboard/avatar` shows five coherent avatar cards on desktop and mobile
- [ ] 3.6 Selecting a card visibly changes state without resizing or overlapping UI
- [ ] 3.7 The save button is disabled before selection and enabled after a valid selection
- [ ] 3.8 Avatar portraits render with meaningful alt text and do not look like real clinicians
- [ ] 3.9 The page copy explains that the choice is educational and can be changed before the first session

### Phase 4: Dashboard Integration And Verification

#### Automated

- [ ] 4.1 `npx astro sync` completes successfully
- [ ] 4.2 `npm run lint` completes successfully
- [ ] 4.3 `npm run build` completes successfully
- [ ] 4.4 `git diff --check` reports no whitespace errors
- [ ] 4.5 Source search confirms no S-04 chat/timer/session route was added
- [ ] 4.6 Migration source contains no service-role key, broad admin policy, or anonymous access policy

#### Manual

- [ ] 4.7 `/dashboard` as a signed-in user without a choice shows a clear action to choose an avatar
- [ ] 4.8 `/dashboard` as a signed-in user with a choice shows the selected avatar/modality and a change action
- [ ] 4.9 Saving a different choice updates the existing row instead of creating duplicates
- [ ] 4.10 `/dashboard` still does not imply that the first session/chat is implemented
- [ ] 4.11 Full visitor/signed-in smoke flow is checked: `/`, `/auth/signin`, `/dashboard`, `/dashboard/avatar`, save, return to `/dashboard`
- [ ] 4.12 Hosted Supabase migration ownership is clear before deploying S-03 to production
