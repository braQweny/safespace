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

## Why this stack

SafeSpace is a TypeScript web app with a 3-week after-hours MVP window, account-based access, sensitive session history, AI conversation flow, and later paid-account conversion. The 10x Astro Starter is the recommended JS/TS default for this product shape because it gives Astro, React, TypeScript, Supabase auth/database/storage, Zod-friendly boundaries, Tailwind, and Cloudflare deployment in one opinionated starter. OpenRouter is the default AI provider for the therapy-simulation layer, which will be added after scaffold alongside streaming/session handling, crisis-flow safeguards, and user-visible session summaries. Bootstrapper support is first-class, so scaffolding should be mostly smooth, with occasional manual steps expected.
