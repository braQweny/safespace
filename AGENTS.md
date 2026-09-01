# Repository Guidelines

SafeSpace is an Astro 7 SSR app with React 19 islands, Tailwind 4, Supabase auth, shadcn/ui, OpenRouter-backed AI sessions, and Cloudflare Workers deployment. Communicate with the user in Polish unless they ask otherwise. `CLAUDE.md` holds the architecture and privacy-boundary guidance; this file covers conventions and the 10xDevs toolkit.

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
- `npm run test` runs Vitest once (`npm run test:watch` for watch mode); `npx vitest run <path>` runs a single file.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run lint` runs ESLint with type-aware TypeScript, Astro, React, hooks, compiler, a11y, and Prettier rules from `@eslint.config.js`.
- `npm run lint:fix` and `npm run format` apply the repo fixers. Husky runs lint-staged from `@package.json` before commit.
- `npm run audit:prod` runs `npm audit` for production dependencies at `high` severity or above.

## Project Structure

- `src/pages/` contains Astro pages and `src/pages/api/` route handlers with uppercase method exports.
- `src/middleware.ts` resolves Supabase auth and protects `PROTECTED_ROUTES`.
- `src/lib/` contains the server-side subsystems (`session-data/`, `session-safety/`, `session-ai/`, `session-summary/`, `session-transcription/`, `session-flow/`, `operational-visibility/`, `admin/`, `openrouter/`, `security/`) plus helpers such as `createClient()` and `cn()`; several subsystems carry a `README.md` that is the contract for that boundary. Tests live in `__tests__/` folders next to the code.
- `src/components/ui/` holds shadcn/ui components configured by `@components.json`; interactive auth components live in `src/components/auth/`.
- Foundation docs are in `context/foundation/`; deployment notes are in `context/deployment/deploy-plan.md`.

## Style And Checks

Use the `@/*` alias from `@tsconfig.json`. Prefer Astro components for static layout and React components only for interactive islands. Merge Tailwind classes with `cn()` from `@/lib/utils`. Do not add Next.js directives. Unit tests run on Vitest (`npm run test`; `*.test.ts` / `*.test.tsx` under `src/lib/**`, `src/components/**`, `src/pages/**`, Node environment) and a new behavior ships with a test. The CI gate on push/PR to `main` (`@.github/workflows/ci.yml`) is, in order: `npm run audit:prod`, `npm run test`, `npx astro sync`, `npm run lint`, `npm run typecheck`, `npm run build` (the build needs `SUPABASE_URL` for the CSP). Pushes to `main` then run `npx supabase db push` before Cloudflare deploy, so every migration must be backward-compatible with the code currently deployed.

## Commits And PRs

Recent history uses imperative English commit messages, not Conventional Commits. Keep PRs scoped, mention env/secret changes explicitly, and verify Cloudflare deploy changes against `@context/deployment/deploy-plan.md`.

Communicate with the user in Polish.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
