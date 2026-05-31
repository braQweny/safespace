# Repository Guidelines

SafeSpace is an Astro 6 SSR app with React 19 islands, Tailwind 4, Supabase auth, shadcn/ui, and Cloudflare Workers deployment. Communicate with the user in Polish unless they ask otherwise.

## Critical Rules

- Keep SSR enabled through `output: "server"` in `@astro.config.mjs`; Cloudflare runtime is configured in `@wrangler.jsonc`.
- Do not commit secrets. Use `.env` for Node tools, `.dev.vars` for local Wrangler, and GitHub/Cloudflare secrets for deploys; see `@.env.example`.
- Protect sensitive session data from logs and admin surfaces. Product privacy guardrails live in `@context/foundation/prd.md`.
- Current Supabase use is Auth only. If a change introduces tables, add migrations under `supabase/migrations/` and enable RLS with granular policies.
- For 10x roadmap work, load `@.agents/skills/10x-roadmap/SKILL.md`; do not create implementation change folders from roadmap output.

## Commands

- `npm run dev` starts the Astro dev server.
- `npm run build` builds production SSR output for `@astrojs/cloudflare`.
- `npm run preview` previews the production build.
- `npm run lint` runs ESLint with type-aware TypeScript, Astro, React, hooks, compiler, a11y, and Prettier rules from `@eslint.config.js`.
- `npm run lint:fix` and `npm run format` apply the repo fixers. Husky runs lint-staged from `@package.json` before commit.

## Project Structure

- `src/pages/` contains Astro pages and `src/pages/api/` route handlers with uppercase method exports.
- `src/middleware.ts` resolves Supabase auth and protects `PROTECTED_ROUTES`.
- `src/lib/` contains helpers such as `createClient()` and `cn()`.
- `src/components/ui/` holds shadcn/ui components configured by `@components.json`; interactive auth components live in `src/components/auth/`.
- Foundation docs are in `context/foundation/`; deployment notes are in `context/deployment/deploy-plan.md`.

## Style And Checks

Use the `@/*` alias from `@tsconfig.json`. Prefer Astro components for static layout and React components only for interactive islands. Merge Tailwind classes with `cn()` from `@/lib/utils`. Do not add Next.js directives. No test runner is configured yet; the current CI gate is `npx astro sync`, `npm run lint`, and `npm run build` on push/PR to `main`, with deploy only on push to `main`.

## Commits And PRs

Recent history uses imperative English commit messages, not Conventional Commits. Keep PRs scoped, mention env/secret changes explicitly, and verify Cloudflare deploy changes against `@context/deployment/deploy-plan.md`.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 2

Turn one roadmap item into the first implementation cycle with the **change planning chain**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review`, and `/10x-implement` are the lesson focus. `/10x-frame` and `/10x-research` are not required rituals here; they are escalation paths introduced in the next lesson.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Change setup (lesson focus)** | |
| `/10x-new <change-id>` | You selected a roadmap item and need a stable change folder. Creates `context/changes/<change-id>/change.md` so planning, implementation, progress, commits, and later review all share one identity. Use AFTER roadmap selection, BEFORE `/10x-plan`. |
| **Planning (lesson focus)** | |
| `/10x-plan <change-id>` | You have a change folder and need a reviewable implementation plan. Reads roadmap context, foundation docs, codebase evidence, and any existing change notes; writes `plan.md` and `plan-brief.md` with phases, file contracts, success criteria, and `## Progress`. |
| **Plan readiness (lesson focus)** | |
| `/10x-plan-review <change-id>` | You have `plan.md` and need a light pre-code readiness check. Use it to catch missing end state, weak contracts, malformed progress, scope drift, or blind spots before code changes begin. |
| **Implementation (lesson focus)** | |
| `/10x-implement <change-id> phase <n>` | You have an approved plan and want to execute one phase with verification, manual gate, commit ritual, and SHA write-back to `## Progress`. |
| **Lifecycle closure** | |
| `/10x-archive <change-id>` | A change is merged or intentionally closed. Move it out of active `context/changes/` into archive state. |

### How the chain hands off

- `/10x-new` creates the durable change identity.
- `/10x-plan` turns that identity into an implementation contract.
- `/10x-plan-review` checks the plan before the agent mutates code.
- `/10x-implement` executes one planned phase, verifies, asks for manual confirmation when needed, commits, and records progress.

### Lesson boundaries

- Plan is the default router after roadmap selection. Start with `/10x-plan` unless the problem is unclear or external evidence is blocking.
- Do not run `/10x-frame + /10x-research` as ceremony for every change.
- Do not turn this lesson into a full end-to-end product build. A checkpoint with a planned and partially or fully implemented stream is valid.
- Code review of the implemented diff belongs to Lesson 3 via `/10x-impl-review`.
- Lifecycle closure via `/10x-archive` after a change is merged or intentionally closed.

### Paths used by this lesson

- `context/foundation/roadmap.md` - upstream roadmap
- `context/changes/<change-id>/change.md` - change identity
- `context/changes/<change-id>/plan.md` - implementation contract
- `context/changes/<change-id>/plan-brief.md` - compressed handoff
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->

Communicate with the user in Polish.