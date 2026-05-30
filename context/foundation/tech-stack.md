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
    docs_current: true
    can_judge_agent: true
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

SafeSpace is a solo-built, sensitive web MVP with a 3-week after-hours timeline, account access, private session history, and AI-assisted chat. Next.js is the best fit because the repository is already scaffolded with Next.js 16, React 19, TypeScript, Tailwind, and npm, while the registry marks the Next.js starter as fully verified for bootstrapper support. DigitalOcean App Platform is the intended MVP hosting surface because the project already has an active DigitalOcean app; the hand-off records the closest supported deployment target as self-host so the downstream deploy plan can use a standard Next.js Node/Docker deployment path instead of adding Vercel-specific assumptions.
