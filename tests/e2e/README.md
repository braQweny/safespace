# Browser tests

Use `/10x-e2e` for new browser risks. `seed.spec.ts` is the first runnable
exemplar; its scope is production CSP, SSR routing and React hydration on the
sign-in screen. It does not verify successful Supabase login or an AI session.

`billing-off.spec.ts` checks anonymous billing redirects and disabled payment
entry points in that same isolated preview. It does not verify a Stripe
sandbox purchase; the checklist is in `src/lib/billing/README.md`.

`voice-off.spec.ts` checks the voice conversation surface for an anonymous
visitor: the “Voice conversations” entry and section on `/privacy` follow the
flag shipped in `wrangler.jsonc` (absent while `VOICE_SESSION_MODE` is `off`,
present after the flip commit — public `astro:env` variables are inlined at
build time, so the spec reads that file rather than the preview's `vars`), the
conversation page redirects to sign-in, and the `voice/connect` and
`voice/heartbeat` routes answer a stable 401 through the custom Worker entry.
It does not verify an audio connection, the observer or the transcript; that
checklist is in `context/changes/voice-live-conversation/verification.md`.

Run `npm run build` with a usable `SUPABASE_URL`, then `npm run test:e2e`.
Install the browser once with `npx playwright install chromium`.
For a single test: `npm run test:e2e -- tests/e2e/seed.spec.ts`.

The preview runs the production artifact in local workerd, with a disposable
configuration, dummy service credentials, the voice observer Durable Object and
the production rate-limiter bindings (a production build fails closed without
them, so limited session routes would never reach their own auth gate). It never reads `.dev.vars`, never
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
