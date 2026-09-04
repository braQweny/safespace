# Risk: production CSP silently prevents sign-in island hydration

Research anchor: `CLAUDE.md` request lifecycle/CSP guidance, `Layout.astro`,
`SignInForm.tsx` and the project review of 2026-09-04.

Business scenario: an unauthenticated visitor reaches the sign-in screen through
the protected dashboard redirect. The password visibility control works after
hydration and missing email is reported inline without leaving the screen.

Real boundaries: production Astro build, Cloudflare local runtime, middleware,
SSR redirect, browser CSP enforcement and the React island. No internal mocks.
No successful authentication, database writes or AI calls are part of this risk.
The preview uses dummy service configuration; the test supplies only local,
synthetic input. Browser context disposal is all the cleanup required.

Use the seed pattern and E2E rules. A broken hydration path must make the
password-control or inline-validation assertion fail, even if SSR HTML renders.
