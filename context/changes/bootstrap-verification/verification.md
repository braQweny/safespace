---
bootstrapped_at: 2026-05-30T17:08:22Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: safespace
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
---
starter_id: 10x-astro-starter
package_manager: npm
project_name: safespace
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: true
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---
```

SafeSpace is a TypeScript web app with a 3-week after-hours MVP window, account-based access, sensitive session history, AI conversation flow, and later paid-account conversion. The 10x Astro Starter is the recommended JS/TS default for this product shape because it gives Astro, React, TypeScript, Supabase auth/database/storage, Zod-friendly boundaries, Tailwind, and Cloudflare deployment in one opinionated starter. OpenRouter is the default AI provider for the therapy-simulation layer, which will be added after scaffold alongside streaming/session handling, crisis-flow safeguards, and user-visible session summaries. Bootstrapper support is first-class, so scaffolding should be mostly smooth, with occasional manual steps expected.

## Pre-scaffold verification

| Signal      | Value                                                     | Severity | Notes                                      |
| ----------- | --------------------------------------------------------- | -------- | ------------------------------------------ |
| npm package | not run                                                   | n/a      | cmd_template starts with git clone         |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh    | from card.docs_url via gh api              |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently
**.bootstrap-scaffold cleanup**: deleted

Install output summary: npm added 774 packages, audited 775 packages, and reported 10 vulnerabilities during install. The full post-scaffold audit below records the current advisory breakdown.

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0

#### CRITICAL findings

None.

#### HIGH findings

- `devalue` - transitive. Advisory: GHSA-77vg-94rm-hx3p, "Svelte devalue: DoS via sparse array deserialization". Affected range: 5.6.3 - 5.8.0. Fix available according to npm audit.

#### MODERATE findings

- `@astrojs/check` - direct. Caused by `@astrojs/language-server`; npm reports a semver-major fix path to `@astrojs/check@0.9.2`.
- `@astrojs/language-server` - transitive. Caused by `volar-service-yaml`; affects `@astrojs/check`.
- `@cloudflare/vite-plugin` - transitive. Caused by `miniflare`, `wrangler`, and `ws`; fix available according to npm audit.
- `miniflare` - transitive. Caused by `ws`; affects `@cloudflare/vite-plugin` and `wrangler`.
- `volar-service-yaml` - transitive. Caused by `yaml-language-server`; affects `@astrojs/language-server`.
- `wrangler` - direct. Caused by `miniflare`; affects `@cloudflare/vite-plugin`.
- `ws` - transitive. Advisory: GHSA-58qx-3vcg-4xpx, "ws: Uninitialized memory disclosure". Affected range: 8.0.0 - 8.20.0. Fix available according to npm audit.
- `yaml` - transitive. Advisory: GHSA-48c2-rrv3-qjmp, "yaml is vulnerable to Stack Overflow via deeply nested YAML collections". Affected range: 2.0.0 - 2.8.2.
- `yaml-language-server` - transitive. Caused by `yaml`; affects `volar-service-yaml`.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                         |
| ----------------------- | ----------------------------- |
| bootstrapper_confidence | first-class                   |
| quality_override        | false                         |
| path_taken              | standard                      |
| self_check_answers      | null                          |
| team_size               | solo                          |
| deployment_target       | cloudflare-pages              |
| ci_provider             | github-actions                |
| ci_default_flow         | auto-deploy-on-merge          |
| has_auth                | true                          |
| has_payments            | true                          |
| has_realtime            | false                         |
| has_ai                  | true                          |
| has_background_jobs     | false                         |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified.

Useful manual steps in the meantime:
- `git init` if you have not already, to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance. The full breakdown is in this log.
