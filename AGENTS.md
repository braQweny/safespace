# Repository Guidelines

SafeSpace is a greenfield Next.js web app for simulated psychotherapy sessions. The active stack is Next.js 16.2.6, React 19.2.4, TypeScript, Tailwind CSS 4, and npm; product scope lives in @context/foundation/prd.md and stack rationale in @context/foundation/tech-stack.md.

## Hard Rules

- Communicate with the user in Polish; write commit messages and commit descriptions in English.
- This is Next.js 16, not older Next.js. Before changing Next APIs, routing, server/client boundaries, or config, read the relevant guide under @node_modules/next/dist/docs/ and heed deprecation notices.
- Treat private therapy-session content as sensitive. Do not add admin reads of private conversations except narrow legal or safety cases from @context/foundation/prd.md.
- Keep `context/foundation/*` edit-in-place; put change-scoped plans under `context/changes/<change-id>/` per @context/foundation/README.md and @context/changes/README.md.

## Project Structure

- `src/app/` holds App Router files; currently `layout.tsx`, `page.tsx`, `globals.css`, and `favicon.ico`.
- `public/` contains static SVG assets referenced by pages and components.
- `docs/` preserves initial idea/case notes; `context/foundation/` is canonical for current product decisions.
- Generated, build, and install output (`.next/`, `node_modules/`, coverage, env files) stays uncommitted per @.gitignore.

## Commands

- `npm run dev` starts local Next at http://localhost:3000.
- `npm run lint` runs ESLint with `eslint-config-next/core-web-vitals` and TypeScript rules from @eslint.config.mjs.
- `npm run build` is the production build/type gate; run it before handing off larger changes.
- `npm audit --json` is the current dependency audit; the bootstrap log records two MODERATE findings in @context/changes/bootstrap-verification/verification.md.

## Coding Style

- Write TypeScript in strict mode; imports can use `@/*` for `src/*` per @tsconfig.json.
- Keep App Router route UI in `src/app/`; use typed `Metadata` in layout files like @src/app/layout.tsx.
- Tailwind CSS 4 is loaded from @src/app/globals.css; extend tokens there before scattering one-off CSS files.

## Testing And CI

- No test runner or GitHub Actions workflow is configured yet. Do not claim test coverage exists.
- For now, verify changes with `npm run lint` and `npm run build`; add test tooling only with an explicit project decision.

## Commits And PRs

- Recent history uses imperative English summaries (`Add...`, `Refine...`, `Remove...`). Keep commits English and scoped to one change.
- PRs should cite the product/context doc they alter and list the commands run.
