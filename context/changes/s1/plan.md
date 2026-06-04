# Product Landing and Limits Implementation Plan

## Overview

Implement the first public SafeSpace product surface: a calm, Polish landing page that explains the offer, the one free 15-minute session, and the limits of the product before a visitor creates an account. The work replaces starter branding on the public shell, keeps the scope in S-01, and uses existing auth routes instead of inventing the later session flow.

## Current State Analysis

The app is still using starter content on `/`. `src/pages/index.astro` renders `Welcome` inside `Layout`, and `Welcome.astro` presents "10x Astro Starter" with developer-oriented cards and cosmic styling. Auth routes already exist, and `Topbar.astro` can read `Astro.locals.user`, but the public copy does not explain SafeSpace, the free 15-minute session, or the safety boundaries required by the PRD.

## Desired End State

A visitor landing on `/` understands that SafeSpace is an AI-supported psychotherapy-simulation/education product, not a specialist, diagnosis, or crisis-support guarantee. The first screen offers a clear primary action to create an account for the future free session, while a signed-in user sees account-aware navigation and a path onward to the private area. The page is visually tailored to SafeSpace, responsive on desktop and mobile, and verified through the current Astro/ESLint/build gates.

### Key Discoveries:

- S-01 requires the visitor to understand the offer, free session, and product limits before account creation: `context/foundation/roadmap.md:108`.
- The roadmap flags weak boundary copy as the main S-01 risk because later sessions could overpromise what the product may safely provide: `context/foundation/roadmap.md:117`.
- PRD acceptance criteria require the landing page to state that the product does not replace a specialist and that the free session is available only after sign-in: `context/foundation/prd.md:57`.
- The current root page delegates all public content to `Welcome.astro`: `src/pages/index.astro:6`.
- `Welcome.astro` still contains starter hero and developer-tooling cards: `src/components/Welcome.astro:35`.
- `Topbar.astro` already branches on `Astro.locals.user`, which can support visitor vs signed-in navigation without a React island: `src/components/Topbar.astro:2`.
- `middleware.ts` currently protects only `/dashboard`, so S-01 should not introduce a fake protected session route: `src/middleware.ts:4`.
- CI runs `npx astro sync`, `npm run lint`, and `npm run build` before deploy: `.github/workflows/ci.yml:21`.

## What We're NOT Doing

- No session chat UI, timer, AI integration, avatar choice, history, summaries, or crisis-detection logic.
- No new database tables, Supabase migrations, RLS policies, or API routes.
- No social-login implementation or auth flow redesign; those belong to S-02.
- No monetization or paid-upgrade surface; FR-008 is parked in the roadmap for this early quality stream.
- No automatic redirect from `/` for signed-in users; users can still inspect public product information.
- No change to Cloudflare SSR output, Wrangler configuration, or deployment secrets.

## Implementation Approach

Keep the implementation as static Astro-first UI. Replace the starter landing content in `Welcome.astro`, update the page/layout metadata to SafeSpace and Polish language, refine `Topbar.astro` copy and state-aware actions, and add one product-specific visual asset under `public/`. Reuse existing routes (`/auth/signup`, `/auth/signin`, `/dashboard`) and current CSS/Tailwind conventions rather than creating new navigation contracts.

## Critical Implementation Details

### User experience spec

The landing must not imply that a visitor can immediately start a therapy-like session from the public page. The primary visitor CTA is account creation for access to the future free session; the signed-in CTA can point to `/dashboard` as the existing private area until S-03/S-04 add avatar and session routes.

## Phase 1: Product Shell And Visual Asset

### Overview

Update the public page shell so SafeSpace, Polish language, and a relevant visual identity replace starter defaults before the detailed landing content is implemented.

### Changes Required:

#### 1. Page Entry

**File**: `src/pages/index.astro`

**Intent**: Set a SafeSpace-specific page title and keep the root route as a public landing page.

**Contract**: The root route continues to render through `Layout`, passing a product title such as `SafeSpace - pierwsza bezpieczna rozmowa` and `lang="pl"` for the Polish landing surface.

#### 2. Document Layout

**File**: `src/layouts/Layout.astro`

**Intent**: Replace starter defaults with SafeSpace defaults and align the document language with the Polish product surface.

**Contract**: Default `title` becomes SafeSpace-branded. `Layout.astro` accepts an optional `lang` prop with a safe default for existing English pages, while the root landing passes `lang="pl"`. Optional metadata supports a public product landing without exposing secrets or changing SSR.

#### 3. Product Visual Asset

**File**: `public/safespace-landing.png`

**Intent**: Add one calm, product-relevant raster image for the landing hero or first viewport.

**Contract**: The file is a checked-in PNG optimized enough for a landing page and referenced by `Welcome.astro`. It should be generated for SafeSpace or otherwise owned/licensed for this project, stay under 500 KB unless there is a documented reason, use a stable aspect ratio or explicit dimensions in the landing layout, include meaningful Polish `alt` text, and replace reliance on `public/template.png` for product presentation.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- `public/safespace-landing.png` exists and is referenced by the landing page.

#### Manual Verification:

- Browser title and document language reflect SafeSpace and Polish.
- The first viewport no longer presents `10x Astro Starter` branding.
- The visual asset renders on desktop and mobile without cropping important content.
- The visual asset has meaningful Polish `alt` text, stable dimensions/aspect ratio, and a checked file size under the agreed budget.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Landing Content

### Overview

Replace the starter landing with a SafeSpace narrative that explains what the product does, how the first session path works, and what boundaries protect the user.

### Changes Required:

#### 1. Landing Structure

**File**: `src/components/Welcome.astro`

**Intent**: Replace the cosmic starter hero and developer cards with a calm product landing: hero, "how it works", free 15-minute session, safety limits, and final CTA.

**Contract**: The component remains an Astro component, uses Tailwind classes directly, and avoids React islands because the page is static apart from server-known auth state.

#### 2. Safety Boundary Copy

**File**: `src/components/Welcome.astro`

**Intent**: Surface the non-negotiable guardrails from the PRD: simulation/education, no replacement for a specialist, no diagnosis, and crisis situations requiring urgent real-world contact.

**Contract**: A short boundary appears near the hero and a dedicated section explains limits before the final CTA. Crisis copy must clearly state in Polish that SafeSpace is not crisis support and that a person in immediate danger should contact local emergency services, a crisis help line, or a specialist, including `112` where applicable.

#### 3. Free Session Copy

**File**: `src/components/Welcome.astro`

**Intent**: Explain the one free 15-minute session without promising that the current S-01 change starts or stores sessions.

**Contract**: Copy states that an account is required, avatar choice comes later in the flow, and the actual timed session belongs to subsequent roadmap items.

### Success Criteria:

#### Automated Verification:

- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Searching the source no longer finds public landing copy for `10x Astro Starter`.

#### Manual Verification:

- A visitor can understand the offer, the free 15-minute session, and the product limits before clicking an auth CTA.
- The safety section is visible and understandable on desktop and mobile.
- The page does not imply diagnosis, specialist replacement, or guaranteed crisis help.
- Crisis copy clearly directs immediate-danger situations to emergency services, a crisis help line, or a specialist instead of the product.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Topbar And Auth-Aware CTA

### Overview

Make navigation and calls to action consistent with the chosen S-01 scope: visitor actions lead to auth, while signed-in actions lead onward to the private area.

### Changes Required:

#### 1. Topbar Labels

**File**: `src/components/Topbar.astro`

**Intent**: Replace English starter labels with Polish SafeSpace labels while preserving the existing auth-state branch.

**Contract**: Unauthenticated users see sign-in/sign-up links, signed-in users see account state, dashboard, and sign-out; no new client-side state is introduced.

#### 2. Visitor CTA

**File**: `src/components/Welcome.astro`

**Intent**: Make the primary CTA point to `/auth/signup` and support `/auth/signin` as a secondary action for returning users.

**Contract**: Visitor copy says account creation is required before the free session; links use existing routes and do not require middleware changes.

#### 3. Signed-In CTA

**File**: `src/components/Welcome.astro`

**Intent**: Use `Astro.locals.user` to show signed-in users an action toward `/dashboard` instead of another sign-up prompt.

**Contract**: The component reads server-side auth state in Astro frontmatter and renders stable link text for signed-in and visitor states.

### Success Criteria:

#### Automated Verification:

- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- The implementation does not add routes to `PROTECTED_ROUTES` for non-existent session paths.

#### Manual Verification:

- As a visitor, primary CTA opens `/auth/signup` and secondary auth link opens `/auth/signin`.
- As a signed-in user, topbar and main CTA show account-aware actions and do not ask the user to register again.
- Existing `/dashboard` protection still redirects unauthenticated users to `/auth/signin`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Verification Polish

### Overview

Run the final verification pass, check responsive behavior, and make small polish edits needed to avoid starter residue or layout regressions.

### Changes Required:

#### 1. Responsive Review

**File**: `src/components/Welcome.astro`

**Intent**: Adjust spacing, type scale, and image behavior after desktop/mobile inspection.

**Contract**: Text must not overlap or overflow on common mobile and desktop widths; fixed-format UI elements should have stable dimensions.

#### 2. Starter Residue Sweep

**File**: `src/components/Welcome.astro`, `src/layouts/Layout.astro`, `src/components/Topbar.astro`

**Intent**: Remove remaining public-facing starter wording from the S-01 surface.

**Contract**: Source search may still find starter references in README/config docs, but not in the root public landing surface.

#### 3. Verification Notes

**File**: `context/changes/s1/plan.md`

**Intent**: Keep the `## Progress` section as the single execution state when implementation starts.

**Contract**: `/10x-implement` flips checkboxes in `## Progress`; no sidecar state file is added.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- `git diff --check` reports no whitespace errors.

#### Manual Verification:

- `/` is checked as visitor on desktop and mobile.
- `/` is checked as signed-in user on desktop and mobile.
- CTA links and `/dashboard -> /auth/signin` behavior are checked in browser.
- No public S-01 surface still looks or reads like the starter template.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before considering the change implemented.

---

## Testing Strategy

### Unit Tests:

- No unit test runner is configured for this repo, so do not introduce one for S-01.
- Use lint/build as the automated guard for Astro, TypeScript, JSX, a11y linting, and Tailwind class formatting.

### Integration Tests:

- No Playwright or browser test runner is configured yet.
- Manual browser checks cover visitor and signed-in states on desktop and mobile.

### Manual Testing Steps:

1. Run the dev server and open `/` as a visitor on desktop width.
2. Confirm hero, free-session copy, safety section, and final CTA are visible and coherent.
3. Resize to mobile width and confirm text, buttons, and image do not overlap or overflow.
4. Click the visitor primary CTA and confirm it opens `/auth/signup`.
5. Click the secondary auth link and confirm it opens `/auth/signin`.
6. Sign in or use an existing session, revisit `/`, and confirm signed-in topbar/CTA state.
7. Open `/dashboard` as a visitor and confirm middleware still redirects to `/auth/signin`.

## Performance Considerations

The only likely performance risk is the new raster hero image. Keep the image dimensions and file size reasonable, avoid unnecessary client-side JavaScript, and preserve Astro static rendering for the landing content.

## Migration Notes

No database migration is required. Supabase remains Auth-only for this change, and no RLS policies or application tables are introduced.

## References

- Roadmap S-01: `context/foundation/roadmap.md:108`
- S-01 risk: `context/foundation/roadmap.md:117`
- PRD landing acceptance criteria: `context/foundation/prd.md:57`
- PRD onboarding requirements: `context/foundation/prd.md:70`
- Current root page: `src/pages/index.astro:6`
- Current starter landing: `src/components/Welcome.astro:35`
- Current auth-aware topbar: `src/components/Topbar.astro:2`
- Current protected route list: `src/middleware.ts:4`
- Current CI gates: `.github/workflows/ci.yml:21`
- Progress format reference: `.agents/skills/10x-plan/references/progress-format.md:1`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.agents/skills/10x-plan/references/progress-format.md`.

### Phase 1: Product Shell And Visual Asset

#### Automated

- [x] 1.1 `npx astro sync` completes successfully
- [x] 1.2 `npm run lint` completes successfully
- [x] 1.3 `npm run build` completes successfully
- [x] 1.4 `public/safespace-landing.png` exists and is referenced by the landing page

#### Manual

- [x] 1.5 Browser title and document language reflect SafeSpace and Polish — a1f4b9f
- [x] 1.6 The first viewport no longer presents `10x Astro Starter` branding — a1f4b9f
- [x] 1.7 The visual asset renders on desktop and mobile without cropping important content — a1f4b9f
- [x] 1.8 The visual asset has meaningful Polish `alt` text, stable dimensions/aspect ratio, and a checked file size under the agreed budget — a1f4b9f

### Phase 2: Landing Content

#### Automated

- [x] 2.1 `npm run lint` completes successfully — 08cd66e
- [x] 2.2 `npm run build` completes successfully — 08cd66e
- [x] 2.3 Searching the source no longer finds public landing copy for `10x Astro Starter` — 08cd66e

#### Manual

- [x] 2.4 A visitor can understand the offer, the free 15-minute session, and the product limits before clicking an auth CTA — 08cd66e
- [x] 2.5 The safety section is visible and understandable on desktop and mobile — 08cd66e
- [x] 2.6 The page does not imply diagnosis, specialist replacement, or guaranteed crisis help — 08cd66e
- [x] 2.7 Crisis copy clearly directs immediate-danger situations to emergency services, a crisis help line, or a specialist instead of the product — 08cd66e

### Phase 3: Topbar And Auth-Aware CTA

#### Automated

- [x] 3.1 `npm run lint` completes successfully — c6f03ea
- [x] 3.2 `npm run build` completes successfully — c6f03ea
- [x] 3.3 The implementation does not add routes to `PROTECTED_ROUTES` for non-existent session paths — c6f03ea

#### Manual

- [x] 3.4 As a visitor, primary CTA opens `/auth/signup` and secondary auth link opens `/auth/signin` — c6f03ea
- [x] 3.5 As a signed-in user, topbar and main CTA show account-aware actions and do not ask the user to register again — c6f03ea
- [x] 3.6 Existing `/dashboard` protection still redirects unauthenticated users to `/auth/signin` — c6f03ea

### Phase 4: Verification Polish

#### Automated

- [x] 4.1 `npx astro sync` completes successfully — 1f36b08
- [x] 4.2 `npm run lint` completes successfully — 1f36b08
- [x] 4.3 `npm run build` completes successfully — 1f36b08
- [x] 4.4 `git diff --check` reports no whitespace errors — 1f36b08

#### Manual

- [x] 4.5 `/` is checked as visitor on desktop and mobile — 1f36b08
- [x] 4.6 `/` is checked as signed-in user on desktop and mobile — 1f36b08
- [x] 4.7 CTA links and `/dashboard -> /auth/signin` behavior are checked in browser — 1f36b08
- [x] 4.8 No public S-01 surface still looks or reads like the starter template — 1f36b08
