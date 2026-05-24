---
bootstrapped_at: 2026-05-24T17:10:15Z
starter_id: next
starter_name: Next.js
project_name: safe-space
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
---
starter_id: next
package_manager: npm
project_name: safe-space
hints:
  language_family: js
  team_size: solo
  deployment_target: self-host
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: false
    can_judge_agent: true
  has_auth: true
  has_payments: true
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---
```

## Why this stack

SafeSpace is a solo-built, after-hours web MVP with a short 3-week timeline, sensitive auth, AI conversation flows, paid-account upgrade potential, and an AWS-oriented deployment preference. Next.js is the strongest fit because it is a mainstream TypeScript full-stack React framework with mature patterns for auth, API routes, streaming AI responses, payments, and self-hosted deployment. The hand-off records `self-host` so bootstrapper can stay compatible with an AWS path such as CloudFront/S3 for static assets, App Runner or ECS for the runtime, Aurora PostgreSQL for data, Cognito for identity, and KMS-managed secrets. Next.js passes the agent-friendly gates and has verified scaffolding support; the only self-check caveat is that project-specific AWS architecture documentation must be maintained explicitly.

## Pre-scaffold verification

| Signal | Value | Severity | Notes |
| --- | --- | --- | --- |
| npm package | create-next-app v16.2.6 published 2026-05-23T23:58:49.919Z | fresh | resolved from cmd_template |
| GitHub repo | not run | n/a | card docs_url is https://nextjs.org/docs, not a GitHub repository URL |

## Scaffold log

**Resolved invocation**: `npx create-next-app@latest bootstrap-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes --disable-git --no-agents-md`  
**Strategy**: subdir-then-move  
**Exit code**: 0  
**Files moved**: 11  
**Conflicts (.scaffold siblings)**: README.md.scaffold  
**.gitignore handling**: append-merged  
**bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: npm audit --json  
**Summary**: 0 CRITICAL, 0 HIGH, 2 MODERATE, 0 LOW  
**Direct vs transitive**: 0/0/1/0 direct of total 0/0/2/0

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

- `next` 16.2.6: moderate direct finding via transitive `postcss`; npm reports affected range `9.3.4-canary.0 - 16.3.0-canary.5`. The suggested npm fix is a semver-major downgrade path, so it was not applied automatically.
- `postcss` 8.4.31: GHSA-qx2v-qp2m-jg93, XSS via unescaped `</style>` in CSS stringify output; affected range `<8.5.10`. This is transitive through `next`.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint | Value |
| --- | --- |
| bootstrapper_confidence | verified |
| quality_override | false |
| path_taken | custom |
| self_check_answers | typed=true, from_official_starter=true, conventions=true, docs_current=false, can_judge_agent=true |
| team_size | solo |
| deployment_target | self-host |
| ci_provider | github-actions |
| ci_default_flow | auto-deploy-on-merge |
| has_auth | true |
| has_payments | true |
| has_realtime | false |
| has_ai | true |
| has_background_jobs | false |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, the project is scaffolded and verified.

Useful manual steps in the meantime:
- Review `README.md.scaffold` and decide whether to merge anything into the existing `README.md`.
- Address audit findings per the project's risk tolerance; the full breakdown is in this log.
- Keep AWS-specific architecture documentation explicit, especially Cognito, KMS, Aurora PostgreSQL, and the App Runner/ECS deployment path.

Additional local checks already run: `npm run lint` passed, and `npm run build` passed.
