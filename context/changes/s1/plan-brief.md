# Product Landing and Limits — Plan Brief

> Full plan: `context/changes/s1/plan.md`

## What & Why

Build the first public SafeSpace landing page. A visitor should understand the product, the free 15-minute session, and the safety limits before creating an account.

## Starting Point

The root page still renders a starter-branded `Welcome.astro` with "10x Astro Starter" copy. Auth routes and auth-aware server state already exist, so S-01 can use current `/auth/signup`, `/auth/signin`, and `/dashboard` routes without adding backend behavior.

## Desired End State

The public landing is Polish, calm, and SafeSpace-branded. Visitor CTA leads to account creation for the future free session; signed-in users see account-aware navigation and a route onward to the private area. The page clearly states that SafeSpace is simulation/education, not a specialist, diagnosis, or crisis-support guarantee.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Scope | Landing + topbar | Keeps first contact coherent without expanding into S-02 auth implementation. |
| Primary visitor CTA | `/auth/signup` | Matches existing routes and PRD requirement that the free session comes after sign-in. |
| Safety prominence | Hero note + dedicated section | Reduces overpromising risk called out in the roadmap. |
| Content structure | Short decision path | Explains product, process, free session, and limits before the final CTA. |
| Visual direction | Calm product UI + raster image | Replaces starter feel and creates a first-viewport SafeSpace signal. |
| Signed-in behavior | CTA to `/dashboard` | Uses existing private route without inventing future session routes. |
| Manual verification | Desktop + mobile + auth states | Covers the highest-risk public UX states for S-01. |

## Scope

**In scope:**

- Public `/` landing content in Polish.
- SafeSpace title, language metadata, and public shell cleanup.
- One product-relevant landing image under `public/`.
- Topbar labels and visitor/signed-in CTA behavior.
- Desktop/mobile manual checks for visitor and signed-in states.

**Out of scope:**

- Session chat UI, timer, AI, avatar choice, history, summaries, and crisis detection.
- Supabase tables, migrations, RLS policies, and new API routes.
- Social login or auth-flow redesign.
- Paid upgrade or monetization copy.
- Cloudflare deployment or secret changes.

## Architecture / Approach

Use Astro-first static UI. `src/pages/index.astro` keeps the root route public, `Layout.astro` provides SafeSpace metadata, `Welcome.astro` becomes the landing page, and `Topbar.astro` uses existing `Astro.locals.user` state to render visitor vs signed-in actions.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Product Shell And Visual Asset | SafeSpace metadata, Polish document language, and landing image | Asset size/cropping could hurt first viewport. |
| 2. Landing Content | Hero, process, free-session, limits, and final CTA sections | Copy could overpromise therapeutic value. |
| 3. Topbar And Auth-Aware CTA | Polish topbar and correct visitor/signed-in actions | CTA could imply a session route that does not exist yet. |
| 4. Verification Polish | Responsive checks and final automated gates | Manual auth-state check depends on local Supabase/session setup. |

**Prerequisites:** Existing Astro app, current auth routes, and S-01 roadmap decision. No database setup is required for implementation.
**Estimated effort:** ~1-2 implementation sessions across 4 phases.

## Open Risks & Assumptions

- Signed-in CTA points to the current dashboard placeholder until S-03/S-04 add real next-step routes.
- If no local signed-in session is available, the signed-in manual check may need a configured Supabase dev environment.
- The generated or chosen landing image must feel product-specific, not stock-like or decorative.

## Success Criteria (Summary)

- A visitor understands SafeSpace, the free 15-minute session, and product limits before signing up.
- Visitor and signed-in CTA states work on desktop and mobile.
- `npx astro sync`, `npm run lint`, `npm run build`, and final whitespace checks pass.
