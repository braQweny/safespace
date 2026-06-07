# Private Admin Operations - Plan Brief

> Full plan: `context/changes/private-admin-operations/plan.md`

## What & Why

S-07 adds a private admin area where an admin can view product statistics and manage users without seeing private conversation contents. The goal is to satisfy FR-009 and FR-010 while preserving the strongest SafeSpace privacy boundary: admins get operational metadata, not messages, prompts, provider payloads, or user-visible summary text.

## Starting Point

SafeSpace already has private session data, privacy-safe operational visibility, timed sessions, history/deletion, and summary-backed follow-up sessions. There is no admin role model, admin route, block state, admin audit trail, or admin UI yet.

## Desired End State

An active admin can open `/admin` for safe product stats and `/admin/users` for user search/status/blocking. Blocked users are denied private routes and session APIs, but their private data is not deleted or exposed. Admin block/unblock actions are audited.

## Key Decisions Made

| Decision           | Choice                                                  | Why                                                                           |
| ------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Statistics scope   | Basic product dashboard                                 | Useful MVP stats without message or summary content.                          |
| User management    | User list plus block/unblock                            | Real FR-010 management without deletion or private data access.               |
| Admin model        | `admin_users` allowlist by `auth.users.id`              | Testable app-level role without runtime service-role secrets.                 |
| User identity      | Email plus safe metadata                                | Supports real support/admin workflows while keeping content private.          |
| Stats source       | Server-only safe aggregate helpers                      | Keeps query control in the backend and away from client-side Supabase access. |
| Small cohorts      | Threshold suppression under 5                           | Reduces re-identification risk in low-traffic MVP segments.                   |
| Audit              | Mutations only                                          | Captures risky admin actions without logging every view.                      |
| Blocking           | Deny private routes and session APIs                    | Reversible account control without deleting private history.                  |
| UI scope           | `/admin` and `/admin/users`                             | Clear MVP split for stats and user management.                                |
| User list controls | Email search, status filter, created/last-activity sort | Enough to find and manage accounts without advanced analytics.                |
| Exports            | No exports in MVP                                       | Avoids extra PII/aggregate leakage paths.                                     |
| Verification       | Unit, route, component tests plus privacy sweeps        | Matches the high-risk admin/privacy surface.                                  |

## Scope

**In scope:**

- `admin_users` role boundary and owner-controlled first-admin bootstrap.
- Safe user profile/status table synchronized from auth metadata needed for email search.
- Account block/unblock with mutation audit.
- `/admin` overview stats with privacy thresholds.
- `/admin/users` search/filter/sort and block/unblock.
- Block enforcement in protected pages and private session APIs.
- Tests, privacy/security sweeps, docs, and verification notes.

**Out of scope:**

- Admin access to messages, summaries, prompts, provider payloads, or raw logs.
- Service-role runtime secrets.
- User deletion, password reset, trial reset, billing, exports, raw-log browser, break-glass content access, Playwright E2E.

## Architecture / Approach

The admin feature uses Supabase Auth for identity, an application `admin_users` allowlist for role checks, and safe public admin tables with RLS for account status and audit data. Admin pages and API routes call server-only guards before reading safe aggregates or mutating block state. Private session tables remain owner-bound; admin code reads only aggregate-safe metadata and never content columns.

## Phases at a Glance

| Phase                                  | What it delivers                                            | Key risk                                                        |
| -------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| 1. Admin Foundation And Access         | Admin tables, RLS, guards, block enforcement                | Accidentally weakening auth/RLS or missing session API bypasses |
| 2. Admin Dashboard And User Management | `/admin`, `/admin/users`, aggregates, search, block/unblock | Leaking PII/content through API or UI shape                     |
| 3. Verification, Sweeps And Handoff    | Tests, sweeps, docs, verification notes                     | Marking privacy/security evidence complete without proof        |

**Prerequisites:** F-01, F-03, and S-04 are implemented; current repo also has S-05 and S-06 implemented.
**Estimated effort:** ~2-3 implementation sessions across 3 phases.

## Open Risks & Assumptions

- First admin bootstrap requires owner SQL against the target Supabase project.
- Email is intentionally visible to admins in MVP; no export support keeps exposure bounded.
- Blocking is application-level access control, not a Supabase Auth ban.
- Hosted Supabase verification may remain pending if owner-owned credentials are not available during implementation.

## Success Criteria (Summary)

- Admin can view safe stats and block/unblock users without content access.
- Blocked users cannot use private pages or session APIs.
- Tests and source sweeps prove no message/summary content, service-role runtime secret, export, deletion, or break-glass path was added.
