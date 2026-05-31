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
