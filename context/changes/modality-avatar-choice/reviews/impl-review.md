<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Modality Avatar Choice Implementation Plan

- **Plan**: context/changes/modality-avatar-choice/plan.md
- **Scope**: Phases 1-4 of 4
- **Date**: 2026-06-04
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

### Scope

- `change.md` status before review: `implemented`, updated `2026-06-04`.
- `## Progress` completion: 37/37 checked items.
- Reviewed implementation range: `6a66dde^..5f3f77f`, the S-03 phase commits referenced by Progress plus the close-out commit.
- Worktree was clean before review.

### Automated Verification

- `npx astro sync`: PASS.
- `npm run lint`: PASS. Existing `astro-eslint-parser` projectService warnings only.
- `npm run build`: PASS. Existing CSS minify and missing `site` sitemap warnings only.
- `git diff --check`: PASS.
- Static catalog source search: PASS, exactly one `MVP_MODALITIES` definition in `src/lib/modalities.ts`.
- Migration RLS source search: PASS, `public.user_avatar_choices` enables RLS and has owner-only authenticated policies.
- Avatar asset check: PASS, five PNG files under `public/avatars/`, all under 250 KB.
- Prescriptive copy search: PASS, no `recommended for you`, `best for`, `diagnose`, or related searched terms in the avatar-choice UI/catalog.
- S-04 route search: PASS, no `chat`, `timer`, `session`, `history`, `summary`, or `crisis` route files under `src/pages`.

### Manual Verification State

- The plan marks all manual verification items complete.
- Review evidence found matching UI/API/database implementation for those completed items, but this review did not re-run a live browser or hosted Supabase smoke test.

## Findings

### F1 — Authenticated clients can spoof choice timestamps

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260531223000_create_user_avatar_choices.sql:58
- **Detail**: The migration grants table-level `select, insert, update` to `authenticated`. RLS correctly limits rows to the owner, but table-level write grants still let a direct Supabase client set writable metadata columns on its own row, including `created_at` and `updated_at` on insert. This is not a cross-user privacy issue, but it weakens timestamp integrity for the first application-data table.
- **Fix A ⭐ Recommended**: Add a follow-up migration that makes timestamps server-owned by revoking broad table-level write access, granting column-level writes only for `user_id`, `modality_id`, and `avatar_id`, and/or adding a trigger that sets `created_at`/`updated_at` on insert and preserves `created_at` on update.
  - Strength: Safe even if the original migration has already been applied anywhere.
  - Tradeoff: Adds a second migration for a small hardening change.
  - Confidence: HIGH — the issue is visible in the grant and can be fixed within the database permission/trigger layer.
  - Blind spot: Current hosted Supabase migration state was not checked in this review.
- **Fix B**: Amend the original migration before deployment if it has not been applied to any shared or hosted database.
  - Strength: Keeps the first application-data migration self-contained.
  - Tradeoff: Unsafe if any environment has already applied the migration.
  - Confidence: MEDIUM — depends on deployment state outside the local repo.
  - Blind spot: Current hosted Supabase migration state was not checked in this review.
- **Decision**: FIXED via Fix A in `supabase/migrations/20260604202000_harden_user_avatar_choice_timestamps.sql`

### F2 — First-time avatar form depends on React hydration

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/modality/AvatarChoiceForm.tsx:84
- **Detail**: The visible radio group is server-rendered, but the submitted `avatarId` comes from a hidden input derived from React state, and the submit button starts disabled when there is no current selection. If the island fails to hydrate, a first-time user cannot complete the form even though the page content rendered. This matches the planned React island approach, so it is a resilience observation rather than plan drift.
- **Fix**: Let the API derive `avatarId` from `modalityId`, mark the radio group as `required`, and keep disabled/enabled button behavior as a hydrated enhancement rather than the only submit path.
- **Decision**: FIXED in `src/pages/api/profile/avatar.ts` and `src/components/modality/AvatarChoiceForm.tsx`
