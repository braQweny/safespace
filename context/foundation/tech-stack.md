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

## Why this stack

SafeSpace is a solo-built, after-hours web MVP with a short 3-week timeline, sensitive auth, AI conversation flows, paid-account upgrade potential, and an AWS-oriented deployment preference. Next.js is the strongest fit because it is a mainstream TypeScript full-stack React framework with mature patterns for auth, API routes, streaming AI responses, payments, and self-hosted deployment. The hand-off records `self-host` so bootstrapper can stay compatible with an AWS path such as CloudFront/S3 for static assets, App Runner or ECS for the runtime, Aurora PostgreSQL for data, Cognito for identity, and KMS-managed secrets. Next.js passes the agent-friendly gates and has verified scaffolding support; the only self-check caveat is that project-specific AWS architecture documentation must be maintained explicitly.
