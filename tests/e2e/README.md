# Browser tests

Use `/10x-e2e` for new browser risks. `seed.spec.ts` is the first runnable
exemplar; its scope is production CSP, SSR routing and React hydration on the
sign-in screen. It does not verify successful Supabase login or an AI session.

Run `npm run build` with a usable `SUPABASE_URL`, then `npm run test:e2e`.
Install the browser once with `npx playwright install chromium`.
For a single test: `npm run test:e2e -- tests/e2e/seed.spec.ts`.

The preview runs the production artifact in local workerd, with a disposable
configuration and dummy service credentials. It never reads `.dev.vars`, never
uses remote Cloudflare bindings and does not create accounts. Each Playwright
context is isolated and automatically disposed, including cookies and storage.

Rules:

- Prefer `getByRole`, `getByLabel` and `getByText`; no CSS/XPath/DOM-structure locators.
- Wait for observable state; never `page.waitForTimeout()`.
- One independently runnable test per risk/file, with its own data and cleanup.
- For authenticated scenarios use isolated test-account `storageState` setup.
- Keep internal boundaries real; only external nondeterministic services may be mocked.
- Assert the user outcome and verify it fails when the target behavior breaks.
- Read the seed and the `/10x-e2e` references before generating a test.
