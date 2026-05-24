# Repository Guidelines

SafeSpace is a greenfield Next.js 16 / React 19 web app for AI-assisted psychotherapy-session simulation. Treat `context/foundation/prd.md` and `context/foundation/tech-stack.md` as the product and stack source of truth.

## Critical Rules

- Do not write under `context/archive/`; archived changes are immutable.
- Preserve the PRD guardrails: the product must say it is not a specialist replacement, must interrupt crisis situations with urgent-contact guidance, and must keep private conversation content unavailable to admins except narrow legal or safety exceptions.
- Use user-visible summaries for cross-session continuity; do not carry unlimited raw chat history into later AI prompts.

## Commands

- Use scripts from `@package.json`: `dev`, `build`, `lint`, and `start`.

## Structure

- `src/app/` contains the App Router surface; current files are the scaffolded `page.tsx`, `layout.tsx`, and `globals.css`.
- `context/foundation/` holds product decisions, including `prd.md`, `shape-notes.md`, and `tech-stack.md`.
- `context/changes/bootstrap-verification/verification.md` records the scaffold command, audit findings, and manual next steps.
- `docs/idea.md` and `docs/case.md` preserve the original Polish product notes.
- `.agents/skills/` contains 10x workflow skills; edit those only when changing agent tooling, not app behavior.

## Style

TypeScript settings live in `@tsconfig.json`; keep app imports compatible with the `@/*` alias to `src/*`. Follow the existing App Router file pattern in `@src/app/page.tsx` and Tailwind v4 styling through `@src/app/globals.css`. Keep user-facing product copy in Polish until the product docs choose a localization strategy.

## Testing

No test runner or CI workflow exists yet. For now, run `npm run lint` and `npm run build` before handing off code changes. When adding the first tests, add the runner config and an `npm test` script in `@package.json` in the same change.

## Commits and PRs

Recent history uses sentence-case imperative summaries such as `Add ...`, `Update ...`, and `Refine ...`; keep the first line concise and scoped. PRs should call out product-safety effects, changed commands, and any movement in `context/foundation/` because those files drive later agent work. Remote target is `git@github.com:braQweny/safespace.git`.

<!-- BEGIN:nextjs-agent-rules -->
 
# Next.js: ALWAYS read docs before coding
 
Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.
 
<!-- END:nextjs-agent-rules -->