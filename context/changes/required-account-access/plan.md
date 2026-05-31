# Required Account Access Implementation Plan

## Overview

Implement S-02: a visitor can create an account or sign in using the required methods, including Google social login and the existing non-social email/password option, then enter the private product area at `/dashboard`. The change keeps Supabase Auth as the only auth system, adds the missing OAuth callback/session contract, and hardens the current auth flow enough for the next roadmap slices to depend on it.

## Current State Analysis

SafeSpace already has a Supabase SSR client, email/password sign-up and sign-in API routes, React auth forms, a protected `/dashboard` placeholder, and middleware that resolves `Astro.locals.user`. The existing flow is incomplete for S-02 because it has no social provider route, no OAuth callback that exchanges a code for an SSR cookie session, no direct success path into the private area, and only client-side form validation for some important fields.

The auth UI still contains starter-era English copy and cosmic styling, while S-01 has moved the public landing toward a Polish SafeSpace surface. Local Supabase config also points Auth redirect URLs at port `3000`, but the repo uses plain `astro dev`, whose default local origin is normally `127.0.0.1:4321`.

## Desired End State

A visitor can sign up or sign in with email/password, or start Google OAuth from the auth pages. After successful authentication, the user lands on `/dashboard`, which remains the private gateway until S-03 and S-04 add avatar choice and the first timed session. OAuth callback handling sets Supabase SSR cookies reliably, auth errors are presented as safe Polish messages, signed-in users are not asked to sign in again, and local plus hosted Supabase redirect setup is documented enough for manual verification.

### Key Discoveries:

- S-02 requires account creation/sign-in with required methods and entry into the private part of the product: `context/foundation/roadmap.md:120`.
- The roadmap baseline says email/password auth is present, while social login still belongs to S-02: `context/foundation/roadmap.md:61`.
- PRD FR-002 requires both social login and a non-social account option because the product context is sensitive: `context/foundation/prd.md:72`.
- The PRD says the free session is available only after sign-in: `context/foundation/prd.md:60`.
- The current signin route uses `signInWithPassword` and redirects to `/`, not `/dashboard`: `src/pages/api/auth/signin.ts:13`, `src/pages/api/auth/signin.ts:19`.
- The current signup route uses `signUp` and always redirects to `/auth/confirm-email`: `src/pages/api/auth/signup.ts:13`, `src/pages/api/auth/signup.ts:19`.
- Middleware protects only `/dashboard` and redirects anonymous users to `/auth/signin`: `src/middleware.ts:4`, `src/middleware.ts:20`.
- The Supabase SSR client writes cookies through Astro cookies, so callback code must use this client instead of a browser-only flow: `src/lib/supabase.ts:5`, `src/lib/supabase.ts:17`.
- Local Supabase Auth redirects point at port `3000`, which does not match the current dev script contract: `supabase/config.toml:154`, `package.json:6`.
- Deployment notes already require adding the final Worker URL to Supabase Auth redirect settings after first deploy: `context/deployment/deploy-plan.md:17`.
- S-01 explicitly left social login and auth flow redesign to S-02: `context/changes/s1/plan.md:30`.

## What We're NOT Doing

- No new auth provider besides Google.
- No Apple OAuth, passkeys, phone auth, magic links, MFA, password recovery, account linking, or anonymous sign-in.
- No new database tables, Supabase migrations, RLS policies, service-role key, or user profile table.
- No avatar choice, session chat UI, timer, AI integration, history, summaries, or paid-account upgrade.
- No new private route such as `/app`, `/onboarding`, or a stub of S-03.
- No provider secrets in `.env`, `.dev.vars`, Cloudflare Worker secrets, or GitHub Actions; Google provider credentials live in Supabase Auth provider configuration.
- No automated E2E framework for OAuth in this change.

## Implementation Approach

Keep the existing Supabase Auth foundation and make it complete for S-02. First, centralize the auth redirect and safe error contracts so email/password and OAuth land in the same place. Then add Google OAuth through server routes: one route starts the provider flow, and one callback route exchanges the returned code for a Supabase SSR cookie session. Next, update auth pages and React forms into a coherent Polish SafeSpace auth experience. Finally, treat `/dashboard` as the private gateway and add the local/production Supabase configuration checklist needed for reliable manual verification.

## Critical Implementation Details

### Timing & lifecycle

The OAuth callback must run server-side and call Supabase's code-exchange API using the existing SSR client so `setAll()` can write cookies before the redirect to `/dashboard`. A client-only callback or direct browser handling would leave middleware unable to see the session on the next request.

### User experience spec

Email/password and Google must be presented as equal choices, not as "preferred Google, fallback email", because the PRD explicitly flags sensitivity around linking this topic to an external identity provider. The success destination is always `/dashboard` for S-02; future avatar/session routing belongs to S-03/S-04.

### Deployment and secrets

Google OAuth client ID/secret belong in Supabase provider settings, not in the Astro app or Worker runtime. The app should only continue to require `SUPABASE_URL` and `SUPABASE_KEY`, while the implementation checklist tells the owner which local and hosted Supabase redirect URLs must be allowed.

## Phase 1: Auth Contracts And Redirect Foundation

### Overview

Establish the shared redirect, validation, and safe error contracts that both email/password and Google OAuth will use.

### Changes Required:

#### 1. Auth Redirect Contract

**File**: `src/lib/auth-redirect.ts`

**Intent**: Add a small shared module that defines the S-02 success destination and validates any auth redirect target used by API routes.

**Contract**: The module exposes `/dashboard` as the default authenticated destination and only allows same-origin, path-only redirects when a redirect parameter is ever accepted. External URLs, protocol-relative URLs, and unknown private destinations are rejected to the `/dashboard` fallback.

#### 2. Safe Auth Error Mapping

**File**: `src/lib/auth-errors.ts`

**Intent**: Prevent raw Supabase provider or validation messages from being written directly into user-visible query strings.

**Contract**: API routes map known failure categories to short Polish messages or stable error codes, and auth pages render those messages through existing `ServerError` UI. The contract avoids storing email addresses, provider tokens, or technical error payloads in URLs.

#### 3. Email Sign-In Handler

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Make the existing non-social login path satisfy S-02 by validating input server-side and redirecting successful users into the private area.

**Contract**: The route remains a `POST` API route, still uses `supabase.auth.signInWithPassword`, rejects missing/invalid email or missing password before calling Supabase, maps failures through the safe error helper, and redirects successful sign-in to `/dashboard`.

#### 4. Email Sign-Up Handler

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Harden the existing non-social account creation path and make it compatible with both Supabase projects that require email confirmation and projects that auto-confirm locally.

**Contract**: The route remains a `POST` API route, validates email, password, and confirm password server-side, calls `supabase.auth.signUp` with `options.emailRedirectTo` pointing to `/auth/callback` under the current request origin, and routes success to either `/dashboard` when a session is available or `/auth/confirm-email` when confirmation is required.

#### 5. Middleware Protected Route Matching

**File**: `src/middleware.ts`

**Intent**: Keep `/dashboard` protected while avoiding accidental protection of unrelated future path prefixes.

**Contract**: The protected route check treats `/dashboard` and nested `/dashboard/...` as protected, but does not match unrelated names such as `/dashboard-public`. Anonymous users continue to redirect to `/auth/signin`.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search shows no route still redirects successful email/password sign-in to `/`.

#### Manual Verification:

- Invalid email/password submissions show safe Polish messages without raw Supabase error text in the visible UI.
- Successful email/password sign-in reaches `/dashboard`.
- Successful email/password sign-up reaches `/dashboard` when auto-confirmed or `/auth/confirm-email` when confirmation is required.
- Anonymous access to `/dashboard` still redirects to `/auth/signin`.
- A path such as `/dashboard-public` is not protected by the dashboard rule if introduced or checked manually.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding pending checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Google OAuth Callback Flow

### Overview

Add the missing Google OAuth start and callback flow so Supabase can create a server-visible session before the user enters `/dashboard`.

### Changes Required:

#### 1. Google OAuth Start Route

**File**: `src/pages/api/auth/google.ts`

**Intent**: Provide a server route that starts Google sign-in from a form button on the auth pages.

**Contract**: The route exports `POST`, uses the existing Supabase SSR client and `signInWithOAuth` with provider `google`, passes a callback URL under the current request origin, and redirects the browser to the provider URL returned by Supabase. If Supabase is not configured or no provider URL is returned, it redirects back to `/auth/signin` with a safe error.

#### 2. OAuth Callback Route

**File**: `src/pages/auth/callback.ts`

**Intent**: Exchange the provider callback code for a Supabase session and write auth cookies before the user enters the private area.

**Contract**: The route handles `GET` callbacks from Google OAuth and email confirmation, reads the `code` query parameter, uses the SSR client to exchange the code for a session, redirects successful callbacks to `/dashboard`, and redirects failures to `/auth/signin` with a safe error. Provider `error` and `error_description` query parameters are not echoed raw.

#### 3. Provider Contract

**File**: `src/lib/auth-providers.ts`

**Intent**: Keep Google as the single supported S-02 social provider in one narrow place rather than scattering string literals across pages.

**Contract**: The module identifies `google` as the only enabled social provider for this change and exposes display metadata needed by the auth UI. Adding Apple later should be a deliberate diff, not an accidental extra button.

#### 4. Sign-Out Compatibility

**File**: `src/pages/api/auth/signout.ts`

**Intent**: Keep sign-out working for users who authenticated by email/password or Google OAuth.

**Contract**: The route continues to call `supabase.auth.signOut()` when configured, does not depend on provider-specific tokens, and redirects to `/` after clearing the Supabase session cookies.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search finds exactly one Google OAuth provider contract.

#### Manual Verification:

- Clicking Google sign-in starts a Supabase Google OAuth redirect when Supabase and the provider are configured.
- A successful Google callback creates a session visible to middleware and lands on `/dashboard`.
- A failed, cancelled, or malformed callback returns to `/auth/signin` with a safe Polish error.
- Signing out after Google login returns to `/` and subsequent `/dashboard` access redirects to `/auth/signin`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: SafeSpace Auth UI

### Overview

Make the sign-in, sign-up, and confirmation screens coherent with the SafeSpace product surface and the selected auth methods.

### Changes Required:

#### 1. Sign-In Page Shell

**File**: `src/pages/auth/signin.astro`

**Intent**: Replace starter-style English sign-in presentation with a Polish SafeSpace auth page that offers email/password and Google.

**Contract**: The page keeps `Layout`, passes Polish metadata and `lang="pl"`, redirects an already signed-in user to `/dashboard`, renders the existing `SignInForm`, and includes a Google sign-in form/button wired to the new OAuth start route. The Google OAuth form is a sibling of the email/password React island, not a nested form.

#### 2. Sign-Up Page Shell

**File**: `src/pages/auth/signup.astro`

**Intent**: Present account creation as a sensitive-product access choice, not a generic starter form.

**Contract**: The page keeps `Layout`, passes Polish metadata and `lang="pl"`, redirects an already signed-in user to `/dashboard`, renders the existing `SignUpForm`, includes the same Google option, and clearly preserves email/password as a non-social account method. The Google OAuth form is a sibling of the email/password React island, not a nested form.

#### 3. Sign-In Form Polish And Error UX

**File**: `src/components/auth/SignInForm.tsx`

**Intent**: Align labels, validation messages, placeholders, pending text, and submit copy with the Polish product surface.

**Contract**: The component remains a React island, keeps the existing POST action to `/api/auth/signin`, keeps client-side validation as progressive feedback, and relies on server-side validation as the source of truth.

#### 4. Sign-Up Form Polish And Server Contract

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: Align account creation copy with the server-side validation contract and make password confirmation user-friendly without trusting it only on the client.

**Contract**: The component keeps `email`, `password`, and `confirmPassword` field names, keeps the POST action to `/api/auth/signup`, and updates copy without changing the server contract expected by Phase 1.

#### 5. Shared Auth Components

**File**: `src/components/auth/FormField.tsx`, `src/components/auth/PasswordToggle.tsx`, `src/components/auth/SubmitButton.tsx`, `src/components/auth/ServerError.tsx`

**Intent**: Polish shared labels and ensure auth controls do not overflow on mobile or expose confusing English states.

**Contract**: Components keep their current props unless a small additive prop is needed for accessibility. Button contents remain stable during pending state, and server errors remain visually distinct without raw technical details.

#### 6. Confirmation Page

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: Make the confirmation page truthful for both local auto-confirmed projects and production projects that require email confirmation.

**Contract**: The page passes `lang="pl"`, explains in Polish whether the user can continue to `/dashboard` or must check email, and does not claim a confirmation email was sent when Supabase has already returned an active session.

### Success Criteria:

#### Automated Verification:

- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Searching `src/pages/auth` and `src/components/auth` finds no public-facing English starter auth copy such as `Sign in`, `Sign up`, `Creating account`, or `Password is required`.
- Auth form field names still match the API route contracts.

#### Manual Verification:

- `/auth/signin` clearly offers Google and email/password as equal account access methods.
- `/auth/signup` clearly offers Google and email/password without pressuring the user into a social identity.
- Auth pages are coherent on desktop and mobile without text overflow or button layout shifts.
- Already signed-in users who visit `/auth/signin` or `/auth/signup` are sent to `/dashboard`.
- Confirmation page copy matches the configured Supabase email-confirmation behavior.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Private Entry And Config Checklist

### Overview

Make `/dashboard` a clear private gateway for S-02 and document the Supabase/Google configuration required to verify the flow locally and in production.

### Changes Required:

#### 1. Private Gateway Copy

**File**: `src/pages/dashboard.astro`

**Intent**: Turn the existing private placeholder into a useful post-auth landing state for S-02.

**Contract**: The route remains protected by middleware, passes `lang="pl"`, shows the signed-in user's email when available, explains that avatar choice and the first 15-minute session come in S-03/S-04, and keeps a working sign-out action.

#### 2. Topbar Auth Labels

**File**: `src/components/Topbar.astro`

**Intent**: Keep global navigation consistent with the completed S-02 flow.

**Contract**: Signed-out users see Polish links to sign in and create an account; signed-in users see their account state, a Polish link to `/dashboard`, and sign-out. No future session route is introduced.

#### 3. Local Supabase Redirect Config

**File**: `supabase/config.toml`

**Intent**: Align local Supabase Auth redirect URLs with the Astro dev origin used by this repo.

**Contract**: Local `site_url` and `additional_redirect_urls` include the Astro dev origin and `/auth/callback` variants needed by signup `emailRedirectTo` and Google auth verification. Provider credentials remain environment-backed or panel-configured and are not committed.

#### 4. OAuth Setup Checklist

**File**: `context/changes/required-account-access/oauth-setup-checklist.md`

**Intent**: Capture the manual Supabase hosted-project and Google provider setup that code cannot safely automate.

**Contract**: The checklist names the local callback URLs, hosted `workers.dev` callback URL, Supabase Auth Site URL / Redirect URLs, Google provider enablement, Google OAuth client redirect URI required by Supabase, and verification ownership. It explicitly says not to add Google provider secrets to app runtime secrets.

#### 5. Deployment Notes

**File**: `context/deployment/deploy-plan.md`

**Intent**: Update first-deploy guidance so S-02 OAuth redirects are not missed after the Worker URL is known.

**Contract**: The deploy plan continues to target Cloudflare Workers and the same Supabase runtime secrets, and adds the S-02 Google OAuth callback URL to the post-deploy Supabase Auth checklist.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- `git diff --check` reports no whitespace errors.
- Source/config search finds no committed Google OAuth client secret.

#### Manual Verification:

- `/dashboard` is readable as the post-auth private gateway and does not imply avatar/session functionality is already built.
- `/dashboard` remains inaccessible to visitors.
- Local Supabase redirect settings match the dev origin used during manual testing.
- Hosted Supabase checklist contains the production Worker callback URL pattern and owner-owned provider setup steps.
- Topbar auth state matches visitor and signed-in states.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Verification Matrix

### Overview

Run the final automated gates and execute a manual auth matrix that covers the realistic ways S-02 can fail: missing provider config, callback cookies, confirmation mode, sign-out, and private route access.

### Changes Required:

#### 1. Final Source Sweep

**File**: `src/pages/api/auth/*`, `src/pages/auth/*`, `src/components/auth/*`, `src/components/Welcome.astro`, `src/middleware.ts`, `src/pages/dashboard.astro`, `supabase/config.toml`

**Intent**: Verify the completed S-02 surface is internally consistent before handing it to `/10x-implement` completion.

**Contract**: There is one auth system, one Google provider contract, `/dashboard` is the success destination, no app route needs a provider secret, and no future S-03/S-04 route is invented.

#### 2. Manual Verification Notes

**File**: `context/changes/required-account-access/plan.md`

**Intent**: Keep final execution state mechanical through the `## Progress` section while preserving the manual checks needed for OAuth.

**Contract**: `/10x-implement` updates only the Progress checkboxes and commit SHAs. Any manual OAuth limitation, such as missing hosted Google provider configuration, is recorded in implementation notes or PR text without changing the phase titles.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- `git diff --check` reports no whitespace errors.
- `rg -n "(SUPABASE_SERVICE_ROLE_KEY|GOOGLE_[A-Z_]*SECRET|CLIENT_SECRET)\s*=" --glob '!context/changes/**' .` finds no committed runtime secret assignment.

#### Manual Verification:

- Email/password sign-up is tested for auto-confirmed local mode and confirmation-required mode when available.
- Email/password sign-in lands on `/dashboard`.
- Google OAuth start route redirects to Supabase/provider when configured.
- Google OAuth callback lands on `/dashboard` with a middleware-visible session.
- Cancelled or malformed Google OAuth callback returns a safe error to `/auth/signin`.
- Signed-in users visiting `/auth/signin` or `/auth/signup` are redirected to `/dashboard`.
- Sign-out clears the session for email/password and Google-authenticated users.
- Anonymous `/dashboard` access redirects to `/auth/signin`.
- Production or preview verification confirms Supabase hosted redirect URLs include the deployed Worker callback before considering S-02 done.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before considering the change implemented.

---

## Testing Strategy

### Unit Tests:

- No unit test runner is configured for this repo, so S-02 should not introduce one as part of this change.
- Use server-side validation paths in API routes as the main regression surface and cover them through manual smoke tests until a test runner exists.

### Integration Tests:

- No Playwright or browser test runner is configured yet.
- OAuth cannot be fully validated by CI without external Google/Supabase provider configuration, so the implementation relies on the manual matrix in Phase 5.

### Manual Testing Steps:

1. Configure local Supabase URL/key for the app and start the Astro dev server.
2. Confirm `/dashboard` redirects a visitor to `/auth/signin`.
3. Create an account with email/password and verify the success path for the active confirmation mode.
4. Sign out, then sign back in with email/password and confirm `/dashboard`.
5. Configure Google provider in Supabase Auth and add local callback URLs.
6. Start Google OAuth from `/auth/signin` and verify successful callback to `/dashboard`.
7. Cancel or break the OAuth callback and verify a safe error on `/auth/signin`.
8. Visit `/auth/signin` and `/auth/signup` while signed in and verify redirect to `/dashboard`.
9. After deployment, add the Worker callback URL to Supabase Auth and repeat the email/password plus Google smoke flow.

## Performance Considerations

This change adds no data-heavy rendering and no new client-side application state beyond existing auth islands. The main performance consideration is avoiding unnecessary React islands for static page shell copy; provider buttons can use ordinary forms where possible, while existing React forms remain limited to interactive validation and password visibility.

## Migration Notes

No database migration is required. Supabase remains Auth-only for this change. Google provider setup is a Supabase Auth configuration task, not a database or Cloudflare Worker secret migration.

## References

- Roadmap S-02: `context/foundation/roadmap.md:120`
- Roadmap auth baseline: `context/foundation/roadmap.md:61`
- PRD social plus non-social account requirement: `context/foundation/prd.md:72`
- PRD free session after sign-in: `context/foundation/prd.md:60`
- PRD access-control rationale: `context/foundation/prd.md:115`
- S-01 deferred social login: `context/changes/s1/plan.md:30`
- Current sign-in API: `src/pages/api/auth/signin.ts:13`
- Current sign-up API: `src/pages/api/auth/signup.ts:13`
- Current protected route middleware: `src/middleware.ts:4`
- Current Supabase SSR cookie writer: `src/lib/supabase.ts:17`
- Current local Supabase redirect config: `supabase/config.toml:154`
- Deployment redirect note: `context/deployment/deploy-plan.md:17`
- Current CI gates: `.github/workflows/ci.yml:21`
- Supabase local provider config area: `supabase/config.toml:302`
- Progress format reference: `.agents/skills/10x-plan/references/progress-format.md:1`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.agents/skills/10x-plan/references/progress-format.md`.

### Phase 1: Auth Contracts And Redirect Foundation

#### Automated

- [x] 1.1 `npx astro sync` completes successfully — 626756f
- [x] 1.2 `npm run lint` completes successfully — 626756f
- [x] 1.3 `npm run build` completes successfully — 626756f
- [x] 1.4 Source search shows no route still redirects successful email/password sign-in to `/` — 626756f

#### Manual

- [x] 1.5 Invalid email/password submissions show safe Polish messages without raw Supabase error text in the visible UI — 626756f
- [x] 1.6 Successful email/password sign-in reaches `/dashboard` — 626756f
- [x] 1.7 Successful email/password sign-up reaches `/dashboard` when auto-confirmed or `/auth/confirm-email` when confirmation is required — 626756f
- [x] 1.8 Anonymous access to `/dashboard` still redirects to `/auth/signin` — 626756f
- [x] 1.9 A path such as `/dashboard-public` is not protected by the dashboard rule if introduced or checked manually — 626756f

### Phase 2: Google OAuth Callback Flow

#### Automated

- [x] 2.1 `npx astro sync` completes successfully — ce298ce
- [x] 2.2 `npm run lint` completes successfully — ce298ce
- [x] 2.3 `npm run build` completes successfully — ce298ce
- [x] 2.4 Source search finds exactly one Google OAuth provider contract — ce298ce

#### Manual

- [x] 2.5 Clicking Google sign-in starts a Supabase Google OAuth redirect when Supabase and the provider are configured — ce298ce
- [x] 2.6 A successful Google callback creates a session visible to middleware and lands on `/dashboard` — ce298ce
- [x] 2.7 A failed, cancelled, or malformed callback returns to `/auth/signin` with a safe Polish error — ce298ce
- [x] 2.8 Signing out after Google login returns to `/` and subsequent `/dashboard` access redirects to `/auth/signin` — ce298ce

### Phase 3: SafeSpace Auth UI

#### Automated

- [x] 3.1 `npm run lint` completes successfully — cee9821
- [x] 3.2 `npm run build` completes successfully — cee9821
- [x] 3.3 Searching `src/pages/auth` and `src/components/auth` finds no public-facing English starter auth copy such as `Sign in`, `Sign up`, `Creating account`, or `Password is required` — cee9821
- [x] 3.4 Auth form field names still match the API route contracts — cee9821

#### Manual

- [x] 3.5 `/auth/signin` clearly offers Google and email/password as equal account access methods — cee9821
- [x] 3.6 `/auth/signup` clearly offers Google and email/password without pressuring the user into a social identity — cee9821
- [x] 3.7 Auth pages are coherent on desktop and mobile without text overflow or button layout shifts — cee9821
- [x] 3.8 Already signed-in users who visit `/auth/signin` or `/auth/signup` are sent to `/dashboard` — cee9821
- [x] 3.9 Confirmation page copy matches the configured Supabase email-confirmation behavior — cee9821

### Phase 4: Private Entry And Config Checklist

#### Automated

- [x] 4.1 `npx astro sync` completes successfully — da88619
- [x] 4.2 `npm run lint` completes successfully — da88619
- [x] 4.3 `npm run build` completes successfully — da88619
- [x] 4.4 `git diff --check` reports no whitespace errors — da88619
- [x] 4.5 Source/config search finds no committed Google OAuth client secret — da88619

#### Manual

- [x] 4.6 `/dashboard` is readable as the post-auth private gateway and does not imply avatar/session functionality is already built — da88619
- [x] 4.7 `/dashboard` remains inaccessible to visitors — da88619
- [x] 4.8 Local Supabase redirect settings match the dev origin used during manual testing — da88619
- [x] 4.9 Hosted Supabase checklist contains the production Worker callback URL pattern and owner-owned provider setup steps — da88619
- [x] 4.10 Topbar auth state matches visitor and signed-in states — da88619

### Phase 5: Verification Matrix

#### Automated

- [x] 5.1 `npx astro sync` completes successfully
- [x] 5.2 `npm run lint` completes successfully
- [x] 5.3 `npm run build` completes successfully
- [x] 5.4 `git diff --check` reports no whitespace errors
- [x] 5.5 `rg -n "(SUPABASE_SERVICE_ROLE_KEY|GOOGLE_[A-Z_]*SECRET|CLIENT_SECRET)\s*=" --glob '!context/changes/**' .` finds no committed runtime secret assignment

#### Manual

- [x] 5.6 Email/password sign-up is tested for auto-confirmed local mode and confirmation-required mode when available
- [x] 5.7 Email/password sign-in lands on `/dashboard`
- [x] 5.8 Google OAuth start route redirects to Supabase/provider when configured
- [x] 5.9 Google OAuth callback lands on `/dashboard` with a middleware-visible session
- [x] 5.10 Cancelled or malformed Google OAuth callback returns a safe error to `/auth/signin`
- [x] 5.11 Signed-in users visiting `/auth/signin` or `/auth/signup` are redirected to `/dashboard`
- [x] 5.12 Sign-out clears the session for email/password and Google-authenticated users
- [x] 5.13 Anonymous `/dashboard` access redirects to `/auth/signin`
- [x] 5.14 Production or preview verification confirms Supabase hosted redirect URLs include the deployed Worker callback before considering S-02 done
