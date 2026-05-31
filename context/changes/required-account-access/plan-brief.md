# Required Account Access - Plan Brief

> Full plan: `context/changes/required-account-access/plan.md`

## What & Why

Implement S-02: a visitor can create an account or sign in using Google social login and the existing email/password option, then enter the private product area. This matters because SafeSpace needs account-based continuity before avatar choice, the first timed session, private history, and summaries can be built.

## Starting Point

The repo already has Supabase SSR auth, email/password API routes, React auth forms, middleware-protected `/dashboard`, and Cloudflare SSR deployment. Missing pieces are Google OAuth, a server callback that writes Supabase session cookies, direct success routing to `/dashboard`, Polish SafeSpace auth UI, and reliable Supabase redirect setup.

## Desired End State

Email/password and Google both create a middleware-visible Supabase session and land the user on `/dashboard`. Auth errors are safe and Polish, signed-in users do not see login/signup prompts, `/dashboard` acts as the private gateway, and local/hosted Supabase setup is documented for manual OAuth verification.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Social provider | Google only | Fastest useful social login with strong Supabase support and manageable manual verification. |
| Non-social option | Keep email/password | PRD requires a non-social method because the product context is sensitive. |
| Success destination | `/dashboard` | It is the existing protected private route and satisfies S-02 without inventing S-03 routes. |
| Email confirmation | Support both modes | Local Supabase may auto-confirm while production may require email confirmation. |
| Hardening scope | Practical hardening | Fixes real risks: validation, safe errors, redirect safety, and signed-in auth page redirects. |
| Auth UI | Polish SafeSpace auth | Removes starter residue from the account flow and keeps Google/email as equal choices. |
| Supabase setup | Repo local config plus manual hosted checklist | Code can align local redirects, but hosted provider secrets must stay in Supabase/Google. |
| Verification | Manual local + production matrix | OAuth/cookie behavior needs browser and provider checks beyond lint/build. |

## Scope

**In scope:**

- Google OAuth start route and callback route.
- Email/password redirect and validation hardening.
- Safe auth error mapping.
- Polish signin/signup/confirmation UI.
- `/dashboard` as private post-auth gateway.
- Local Supabase redirect config and hosted OAuth setup checklist.
- Manual verification matrix for email/password, Google OAuth, callback, dashboard, and sign-out.

**Out of scope:**

- Apple OAuth, MFA, password recovery, passkeys, magic links, account linking, anonymous auth.
- Supabase tables, migrations, RLS policies, service-role key, profile table.
- Avatar choice, session UI, timer, AI flow, history, summaries, paid upgrade.
- New `/app`, `/onboarding`, or any S-03/S-04 private route.
- Automated E2E test framework for OAuth.

## Architecture / Approach

Use Supabase Auth as the single auth system. Email/password routes and Google OAuth routes converge on the same success destination, `/dashboard`; the callback exchanges the OAuth code server-side through the existing SSR client so cookies are visible to Astro middleware. Auth UI remains Astro pages with React islands for the existing interactive forms, and provider setup stays in Supabase/Google rather than Worker secrets.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Auth Contracts And Redirect Foundation | Shared redirect, validation, safe errors, and email/password success to `/dashboard` | Over-tight redirect rules could break expected auth flows. |
| 2. Google OAuth Callback Flow | Google start route, callback exchange, provider contract, sign-out compatibility | Callback may not write SSR cookies if implemented client-side. |
| 3. SafeSpace Auth UI | Polish signin/signup/confirmation screens with Google and email/password | UI could pressure social login despite PRD sensitivity concerns. |
| 4. Private Entry And Config Checklist | Dashboard gateway, topbar copy, local redirect config, hosted checklist | Hosted OAuth may fail if Supabase redirect URLs are not configured. |
| 5. Verification Matrix | Final gates and local/production manual auth matrix | Manual completion depends on available Supabase/Google provider setup. |

**Prerequisites:** Existing Supabase project URL/anon key. For full Google OAuth verification, the owner must configure Google provider credentials in Supabase Auth and allow local plus deployed callback URLs.
**Estimated effort:** ~2-3 implementation sessions across 5 phases, with additional owner time for Supabase/Google provider configuration.

## Open Risks & Assumptions

- Hosted Google OAuth cannot be fully verified until the final Worker URL is known and added to Supabase Auth redirect settings.
- Local OAuth testing depends on aligning Supabase redirect URLs with the actual Astro dev origin.
- If production email confirmation is enabled, signup cannot be fully completed without working Supabase email delivery and Site URL settings.
- No E2E runner exists, so OAuth regression coverage is manual for this change.

## Success Criteria (Summary)

- A user can sign up/sign in with email/password or Google and reach `/dashboard`.
- `/dashboard` is protected from visitors and remains the S-02 private gateway without S-03/S-04 scope creep.
- Auth UI, errors, redirects, and Supabase setup are safe enough to support the next roadmap slices.
