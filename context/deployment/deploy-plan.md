# SafeSpace First Deployment Plan

## Summary

SafeSpace v1 deploys as a standard Next.js Node.js service on DigitalOcean App Platform. The app uses `npm run build` during build time and `npm run start` at runtime. Supabase owns PostgreSQL, Auth, and Storage. The first production target is a DigitalOcean starter domain, with a custom domain added later through DigitalOcean App Platform and DNS at the domain registrar or DigitalOcean DNS.

Default deployment choices:

- Hosting: DigitalOcean App Platform.
- Data/Auth/Storage: Supabase.
- Repository: `braQweny/safespace`.
- Branch: `main`.
- Package manager: npm.
- Runtime: Node.js `22.x`.
- DigitalOcean region: `fra`.
- Supabase region: EU region closest to first users in Poland.
- Deployment driver: GitHub Actions using `digitalocean/app_action/deploy@v2`.
- App Platform source auto-deploy: disabled in the app spec; deploy should pass through GitHub Actions checks.

## Manual Work Before Deployment

Do these steps manually before running the automated deployment workflow:

- Confirm access to GitHub, DigitalOcean, Supabase, and the domain registrar.
- In DigitalOcean, connect App Platform to the GitHub account and grant access to `braQweny/safespace`.
- Create a DigitalOcean API token with access to App Platform.
- In Supabase, create a production project in an EU region.
- In Supabase, enable the Auth providers needed by the app and configure redirect URLs for the DigitalOcean app URL and, later, the custom domain.
- In Supabase, avoid direct production schema edits after migrations are introduced; production schema changes should go through committed migration files.
- In GitHub, create the `production` environment.
- In GitHub, enable required approval for the `production` environment if a human approval gate is desired before production deploy.
- Before real private session data is stored, confirm Supabase backup/PITR expectations and RLS coverage for all private session-history tables.
- If using a custom domain, add the domain in DigitalOcean App Platform and configure the registrar DNS records exactly as DigitalOcean shows them.

## Accounts And Services

Required for first deployment:

- GitHub: repository, GitHub Actions, environment secrets, and environment variables.
- DigitalOcean: App Platform hosting, deploy token, app logs, app rollback, and optional DigitalOcean DNS.
- Supabase: PostgreSQL, Auth, Storage, project API keys, database password or migration database URL.
- Domain registrar: only needed when a custom domain is added.

Not required for first deployment:

- Docker image registry.
- External CDN.
- Separate managed database outside Supabase.
- Payment provider.
- Dedicated monitoring vendor.

## Secrets And Environment Variables

Configure these in the GitHub `production` environment.

Secrets:

- `DIGITALOCEAN_ACCESS_TOKEN`: DigitalOcean API token used by GitHub Actions.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon key. It is public in the browser bundle, but keep it in GitHub secrets to avoid accidental repo exposure.
- `SUPABASE_DB_URL`: Percent-encoded migration database URL, only needed once `supabase/migrations/*.sql` exists.

Variables:

- `NEXT_PUBLIC_SITE_URL`: initial value should be the DigitalOcean app URL, later the production custom domain.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL, for example `https://<SUPABASE_PROJECT_REF>.supabase.co`.
- `SUPABASE_PROJECT_REF`: Supabase project ref for CLI and runbook commands.

Add later only when the app code actually uses them:

- `SUPABASE_SERVICE_ROLE_KEY`: server-only secret. Never expose it to browser code and never prefix it with `NEXT_PUBLIC_`.
- `OPENAI_API_KEY` or another AI provider key after the model provider is chosen.
- OAuth provider secrets in Supabase Dashboard.
- SMTP/email provider secrets in Supabase Dashboard.

## Automated Agent Work

The agent should make these repository changes before the first production deploy:

- Add `engines.node = "22.x"` to `package.json`.
- Add `.do/app.yaml` with the DigitalOcean App Platform spec.
- Add `.github/workflows/deploy.yml` for lint, build, optional migration push, and App Platform deploy.
- Add `.env.example` with variable names only, no real secret values.
- Keep deployment documentation in this file.
- Verify the app spec locally before pushing.

Minimum `.do/app.yaml` shape:

```yaml
name: safespace
region: fra
features:
  - buildpack-stack=ubuntu-22
ingress:
  rules:
    - component:
        name: web
      match:
        path:
          prefix: /
alerts:
  - rule: DEPLOYMENT_FAILED
  - rule: DOMAIN_FAILED
services:
  - name: web
    environment_slug: node-js
    github:
      repo: braQweny/safespace
      branch: main
      deploy_on_push: false
    source_dir: /
    build_command: npm run build
    run_command: npm run start
    http_port: 8080
    instance_count: 1
    instance_size_slug: basic-xxs
    health_check:
      http_path: /
    envs:
      - key: NODE_ENV
        value: production
        scope: RUN_AND_BUILD_TIME
        type: GENERAL
      - key: NEXT_PUBLIC_SITE_URL
        value: ${NEXT_PUBLIC_SITE_URL}
        scope: RUN_AND_BUILD_TIME
        type: GENERAL
      - key: NEXT_PUBLIC_SUPABASE_URL
        value: ${NEXT_PUBLIC_SUPABASE_URL}
        scope: RUN_AND_BUILD_TIME
        type: GENERAL
      - key: NEXT_PUBLIC_SUPABASE_ANON_KEY
        value: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
        scope: RUN_AND_BUILD_TIME
        type: SECRET
```

Minimum `.github/workflows/deploy.yml` shape:

```yaml
name: Deploy

on:
  workflow_dispatch:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build

      - name: Install doctl
        uses: digitalocean/action-doctl@v2
        with:
          token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}

      - name: Validate app spec
        run: doctl apps spec validate .do/app.yaml --schema-only

      - name: Setup Supabase CLI
        if: hashFiles('supabase/migrations/*.sql') != ''
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Push Supabase migrations
        if: hashFiles('supabase/migrations/*.sql') != ''
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: supabase db push --db-url "$SUPABASE_DB_URL" --yes

      - name: Deploy to DigitalOcean App Platform
        uses: digitalocean/app_action/deploy@v2
        env:
          NEXT_PUBLIC_SITE_URL: ${{ vars.NEXT_PUBLIC_SITE_URL }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ vars.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
        with:
          token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}
          app_spec_location: .do/app.yaml
          print_build_logs: true
          print_deploy_logs: true
```

## Deployment Commands

Local validation before pushing deployment changes:

```bash
npm ci
npm run lint
npm run build
doctl apps spec validate .do/app.yaml --schema-only
```

Configure GitHub production secrets and variables:

```bash
gh secret set DIGITALOCEAN_ACCESS_TOKEN --env production
gh variable set NEXT_PUBLIC_SITE_URL --env production --body "https://<APP_DOMAIN_OR_DO_URL>"
gh variable set NEXT_PUBLIC_SUPABASE_URL --env production --body "https://<SUPABASE_PROJECT_REF>.supabase.co"
gh secret set NEXT_PUBLIC_SUPABASE_ANON_KEY --env production
gh secret set SUPABASE_DB_URL --env production
gh variable set SUPABASE_PROJECT_REF --env production --body "<SUPABASE_PROJECT_REF>"
```

Prepare and push Supabase migrations manually when needed:

```bash
supabase login
supabase link --project-ref <SUPABASE_PROJECT_REF>
supabase db push --dry-run
supabase db push --yes
```

Trigger the first GitHub Actions deployment:

```bash
git push origin main
gh workflow run deploy.yml --ref main
gh run watch
```

Inspect the DigitalOcean app after deployment:

```bash
doctl apps list --format ID,Spec.Name,DefaultIngress
doctl apps logs <APP_ID> web --type build --tail 200
doctl apps logs <APP_ID> web --type run --tail 200
curl -I https://<DEFAULT_INGRESS_OR_DOMAIN>
```

Check a custom domain after it is configured in DigitalOcean App Platform:

```bash
dig +short CNAME www.<APP_DOMAIN>
curl -I https://www.<APP_DOMAIN>
```

Rollback the app code/config if a deployment is bad:

```bash
doctl apps list-deployments <APP_ID>
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DIGITALOCEAN_ACCESS_TOKEN" \
  -d '{ "deployment_id": "<PREVIOUS_SUCCESSFUL_DEPLOYMENT_ID>" }' \
  "https://api.digitalocean.com/v2/apps/<APP_ID>/rollback"
```

Rollback note: DigitalOcean app rollback restores app code/config/app spec. It does not roll back Supabase schema or data. Database recovery must use migration repair, a forward fix migration, or Supabase backup/PITR depending on the incident.

## Test Plan

Before handoff:

- `npm run lint` passes.
- `npm run build` passes.
- `doctl apps spec validate .do/app.yaml --schema-only` passes.
- The deployment workflow exists and uses the `production` environment.
- The app deploy returns a public URL.
- `curl -I` against the public URL returns HTTP `200`, `301`, `302`, or another expected non-error status.
- Build and runtime logs do not print secret values.

When migrations exist:

- Run `supabase db push --dry-run` before pushing to production.
- Run `supabase db push --yes` only after reviewing the dry-run output.
- Confirm RLS policies before writing any private therapy-session data.

When a custom domain is added:

- Confirm DigitalOcean shows the domain as active.
- Confirm HTTPS works.
- Add the custom domain to Supabase Auth redirect URLs.
- Confirm sign-in redirects work on both the DigitalOcean starter URL and the custom domain during transition.

## Assumptions

- This is the first deployment plan, not a full production hardening runbook.
- The initial deploy can expose the scaffolded app before the full MVP feature set exists.
- Supabase is the only production database for v1.
- Payment provider setup is out of scope until monetization work begins.
- AI provider setup is out of scope until the model provider is selected.
- Preview deployments should not use production write-capable Supabase secrets.

## References

- Next.js deployment: https://nextjs.org/docs/app/getting-started/deploying
- DigitalOcean App Spec: https://docs.digitalocean.com/products/app-platform/reference/app-spec/
- DigitalOcean GitHub Actions deploy: https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-github-actions/
- DigitalOcean app action: https://github.com/digitalocean/app_action
- DigitalOcean domains: https://docs.digitalocean.com/products/app-platform/how-to/manage-domains/
- Supabase migrations: https://supabase.com/docs/guides/deployment/database-migrations
