# Google OAuth Setup Checklist

## Local App Redirects

Add these exact URLs to Supabase Auth redirect URLs for local app verification:

- `http://localhost:4321/auth/callback`
- `http://127.0.0.1:4321/auth/callback`

Local Supabase CLI uses this Google OAuth callback URL:

- `http://127.0.0.1:54321/auth/v1/callback`

## Hosted App Redirects

After the first Cloudflare Workers deploy, add the deployed app callback URL to Supabase Auth redirect URLs:

- `https://safespace.<workers-dev-subdomain>.workers.dev/auth/callback`

Set the hosted Supabase Auth Site URL to the deployed app origin:

- `https://safespace.<workers-dev-subdomain>.workers.dev`

## Google Provider Ownership

Google OAuth client credentials are owned by Supabase Auth provider configuration, not the Astro app runtime.

For hosted Supabase:

1. Open Supabase Dashboard -> Authentication -> Providers -> Google.
2. Enable Google.
3. Paste the Google OAuth Client ID and Client Secret.
4. Copy the Supabase `Callback URL (for OAuth)`.
5. Add that callback URL to Google Cloud OAuth Client -> Authorized redirect URIs.

For local Supabase CLI:

1. Add `GOOGLE_CLIENT_ID` and `GOOGLE_SECRET` to your local shell or ignored env file.
2. Set `[auth.external.google].enabled = true` in `supabase/config.toml` only when those env vars are available.
3. Restart Supabase with `npx supabase stop && npx supabase start`.

Do not add Google OAuth client secrets to `.env.production`, Cloudflare Worker secrets, GitHub Actions secrets, or committed files.
