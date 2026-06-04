# Repository Guidelines

SafeSpace is an Astro 6 SSR app with React 19 islands, Tailwind 4, Supabase auth, shadcn/ui, and Cloudflare Workers deployment. Communicate with the user in Polish unless they ask otherwise.

## Critical Rules

- Keep SSR enabled through `output: "server"` in `@astro.config.mjs`; Cloudflare runtime is configured in `@wrangler.jsonc`.
- Do not commit secrets. Use `.env` for Node tools, `.dev.vars` for local Wrangler, and GitHub/Cloudflare secrets for deploys; see `@.env.example`.
- Protect sensitive session data from logs and admin surfaces. Product privacy guardrails live in `@context/foundation/prd.md`.
- Supabase uses Auth plus application tables managed through `supabase/migrations/`. Keep RLS enabled with granular policies for every new table.
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

Use the `@/*` alias from `@tsconfig.json`. Prefer Astro components for static layout and React components only for interactive islands. Merge Tailwind classes with `cn()` from `@/lib/utils`. Do not add Next.js directives. No test runner is configured yet; the current CI gate is `npx astro sync`, `npm run lint`, and `npm run build` on push/PR to `main`. Pushes to `main` then run `npx supabase db push` before Cloudflare deploy.

## Commits And PRs

Recent history uses imperative English commit messages, not Conventional Commits. Keep PRs scoped, mention env/secret changes explicitly, and verify Cloudflare deploy changes against `@context/deployment/deploy-plan.md`.

Communicate with the user in Polish.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
