---
project: SafeSpace
researched_at: 2026-05-30T17:51:03+02:00
recommended_platform: DigitalOcean App Platform + Supabase
runner_up: Vercel + Supabase
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Next.js 16.2.6 / React 19.2.4
  runtime: Node.js-compatible Next.js server
  database: Supabase PostgreSQL/Auth/Storage
---

## Recommendation

**Deploy the Next.js application on DigitalOcean App Platform and use Supabase for PostgreSQL, Auth, and Storage.**

This is the best MVP fit because the project already records DigitalOcean App Platform as the intended hosting surface in `context/foundation/tech-stack.md`, the developer has DigitalOcean familiarity, and the app does not currently require WebSockets or always-on workers. Supabase removes the biggest downside of App Platform for this product: production-grade user/session data can live in a dedicated managed Postgres/Auth platform rather than in a DigitalOcean App Platform dev database.

Key sources:

- Next.js supports deployment as a Node.js server with `npm run build` and `npm run start`: https://nextjs.org/docs/app/getting-started/deploying
- DigitalOcean App Platform GitHub Actions support production and PR preview deploys: https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-github-actions/
- DigitalOcean App Platform CLI/API/logs/rollback docs: https://docs.digitalocean.com/products/app-platform/how-to/manage-deployments/
- DigitalOcean App Platform pricing: https://www.digitalocean.com/pricing/app-platform
- DigitalOcean App Platform limits and Next.js CPDoS caveat: https://docs.digitalocean.com/products/app-platform/details/limits/
- Supabase security and compliance overview: https://supabase.com/docs/guides/security
- Supabase backups and PITR: https://supabase.com/docs/guides/platform/backups
- Supabase database migrations: https://supabase.com/docs/guides/deployment/database-migrations

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Weighted result |
|---|---|---|---|---|---|---|
| DigitalOcean App Platform + Supabase | Pass | Pass | Pass | Pass | Pass | Recommended |
| Vercel + Supabase | Pass | Pass | Pass | Pass | Pass, MCP beta | Runner-up |
| Railway + Supabase | Pass | Pass | Pass | Partial | Partial, MCP WIP | Strong alternative |
| Render + Supabase | Pass | Pass | Pass | Pass | Pass, docs MCP experimental | Strong alternative |
| Cloudflare Workers + Supabase | Pass | Pass | Pass | Pass | Pass | High agent score, higher Next runtime risk |
| Netlify + Supabase | Pass | Pass | Pass | Pass | Pass | Good serverless alternative, less aligned with project |
| Fly.io + Supabase | Pass | Partial | Partial | Pass | Partial, experimental | Best if persistent processes become required |

DigitalOcean App Platform scores well on the five agent-friendly criteria because it has `doctl`, a stable API, GitHub Actions, Markdown/`llms.txt` docs, and official DigitalOcean MCP servers for App Platform management. It is not the most Next-native platform, but this project does not need Vercel-specific infrastructure yet, and standard Next.js Node deployment preserves full framework behavior.

Vercel is the strongest pure Next.js DX option: zero-config Next deployment, preview URLs, rollback CLI, logs, global CDN, and excellent agent-readable docs. It loses the top position here because the user already knows DigitalOcean, the stack hand-off already selected DigitalOcean as the intended MVP surface, and Supabase makes Vercel's integrated-storage advantage less important.

Railway and Render both offer excellent full-stack PaaS ergonomics. Railway has very strong app/database DX, but rollback is more dashboard-centered than DigitalOcean/Vercel. Render is predictable and mature for Node web services, but is less aligned with the existing project decision and not as Next-native as Vercel.

Cloudflare Workers has excellent global reach and agent tooling, but Next.js 16 relies on OpenNext and Workers `nodejs_compat`; that adds runtime-specific risk for a sensitive MVP. Netlify is solid for serverless Next, but has less project alignment. Fly.io is strong if persistent connections or regional VMs become necessary later, but it adds Docker/VM operational surface that is not needed now.

## Shortlisted Platforms

### 1. DigitalOcean App Platform + Supabase (Recommended)

The application runs as a managed Node web service on App Platform, while Supabase owns Postgres, Auth, Storage, RLS, backups, and future realtime needs. This keeps the MVP simple, matches the current project hand-off, and avoids using App Platform development databases for sensitive therapy-session data.

### 2. Vercel + Supabase

Vercel is the easiest and most idiomatic Next.js deployment target, especially for previews, rollback, and framework-specific behavior. It is the best fallback if App Platform introduces Next-specific friction, but it is less aligned with the user's DigitalOcean familiarity and the existing stack rationale.

### 3. Railway + Supabase

Railway is a strong DX-first PaaS and would be easy to operate for a small MVP. It is a good fallback if DigitalOcean App Platform build/runtime behavior is frustrating, but its rollback story is less CLI-complete and it does not use the platform the project already planned for.

## Anti-Bias Cross-Check: DigitalOcean App Platform + Supabase

### Devil's Advocate - Weaknesses

1. DigitalOcean App Platform is not a verified Next.js adapter. The safe path is a plain Node server deployment, which means no Vercel-specific Next optimizations and no Cloudflare-style edge execution by default.
2. Splitting app hosting and data across DigitalOcean and Supabase creates cross-provider latency, billing, secrets, incident response, and audit boundaries.
3. App Platform rollback restores code/config/app spec, but it does not roll back Supabase data or schema migrations.
4. Supabase RLS policy design becomes a hard security dependency because private therapy-session content must never leak across users or to admin views.
5. The app has mental-health-adjacent sensitive content. If the product ever crosses into regulated health data/ePHI obligations, SOC 2 alone is not enough; HIPAA/BAA requirements must be decided explicitly.

### Pre-Mortem - How This Could Fail

The team deploys SafeSpace to DigitalOcean App Platform and puts data in Supabase. It ships quickly, but the schema is built through dashboard edits instead of versioned migrations. During a later release, a migration changes session-history tables, the app deploy is rolled back, but the Supabase schema remains forward-only and older code starts failing. In parallel, RLS policies were added late and tested only through the happy path, so an admin/statistics query accidentally exposes more private session metadata than intended. As traffic expands beyond one region, users still hit a regional Supabase database, so global CDN does not solve conversation latency. Debugging becomes slow because logs, deploy state, database state, and auth events live in two providers with different access models. The hosting decision itself was not wrong; the failure came from treating provider separation and sensitive data controls as minor implementation details.

### Unknown Unknowns

- App Platform has a documented caveat that Next.js apps can be vulnerable to CPDoS if cache headers are handled incorrectly; cache-control must be reviewed before production.
- Supabase daily backups do not include objects stored through the Storage API; object retention needs a separate backup/export plan.
- Supabase PITR is an add-on and requires at least a Small compute add-on, so fine-grained recovery is materially more expensive than the base plan.
- Supabase region selection should match the primary user geography and App Platform region; changing database region later is a migration, not a toggle.
- Preview apps must never point at production Supabase with write-capable service-role credentials.

## Operational Story

- **Preview deploys**: Use `digitalocean/app_action/deploy@v2` with `deploy_pr_preview: "true"` to create a unique App Platform preview app per pull request, then delete it on PR close using `digitalocean/app_action/delete@v2`. Preview apps should use a separate Supabase project or locked-down anon-only test credentials.
- **Secrets**: Store production app secrets in DigitalOcean App Platform environment variables and CI deploy tokens in GitHub Secrets. Supabase `service_role` keys must be server-only, never exposed to client bundles, and rotated from the Supabase dashboard when compromised.
- **Rollback**: For application code, use DigitalOcean's rollback API (`POST /v2/apps/{app_id}/rollback`) or the App Platform Activity tab to restore one of the ten most recent successful deployments. For schema/data, use Supabase migrations and backups; code rollback does not revert database changes.
- **Approval**: Agents may open PRs, create preview deploys, read logs, and propose app spec changes. A human must approve production deploys, Supabase migration pushes, secret rotation, database restore/PITR, and any admin access path touching private conversation content.
- **Logs**: App logs: `doctl apps logs <app-id> web --type run --follow` and deployment logs: `doctl apps logs <app-id> web --type build`. Supabase logs stay read-only in the Supabase dashboard/API; database migrations should be auditable through committed `supabase/migrations/*`.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Next.js behavior differs from Vercel-specific assumptions | Devil's advocate | M | M | Deploy as standard Node server first: `npm run build` and `npm run start`; avoid Vercel-only APIs until explicitly chosen. |
| App rollback does not roll back Supabase schema/data | Devil's advocate / Pre-mortem | M | H | Use forward-only migrations, require migration review, and pair risky migrations with tested rollback/restore notes. |
| RLS policy mistake exposes private sessions | Pre-mortem | M | H | Treat RLS tests as mandatory before real user data; keep admin stats queries aggregate-only by default. |
| Preview deploy writes to production data | Unknown unknowns | M | H | Use separate Supabase preview/staging project or read-only anon credentials; block service-role keys outside production secrets. |
| Supabase backup expectations are incomplete | Unknown unknowns | M | H | Use Pro daily backups at minimum; document that Storage objects are not restored by DB backup; evaluate PITR before real payments/user data. |
| CPDoS/cache-header issue in Next.js on App Platform | Research finding | L | M | Review response cache headers before production; set private/no-store headers for personalized or session-related responses. |
| Cross-provider incident response is slower | Pre-mortem | M | M | Keep runbooks with DigitalOcean app ID, Supabase project ref, log commands, and restore contacts in `context/changes/<change-id>/`. |
| Global rollout is harder than CDN marketing suggests | Unknown unknowns | M | M | Start with one EU or US region intentionally; when geography changes, test App Platform region plus Supabase region/replica strategy. |
| Regulated health-data obligations are underestimated | Devil's advocate | L | H | Keep product positioned as simulation/education; before storing regulated ePHI, review Supabase HIPAA add-on/BAA and legal requirements. |

## Getting Started

1. Keep local development on the framework-native command already in `package.json`: `npm run dev`. Use `npm run build` before any platform deployment.
2. Create a Supabase project in the region closest to the first real users; for Polish/EU-first usage, prefer an EU region such as Frankfurt/Ireland/Paris/London where available.
3. Add Supabase client dependencies and create migration files under `supabase/migrations`; deploy schema with `supabase db push` only after review.
4. Create the DigitalOcean App Platform app from GitHub as a Node web service with build command `npm run build` and run command `npm run start`.
5. Add App Platform environment variables for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and server-only Supabase service credentials only when server code actually needs them.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
