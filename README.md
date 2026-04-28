# Personal Data Exposure Checker

A privacy-preserving FYP web app that checks whether an email or password has appeared in known data breach datasets.

## Cloudflare Pages (Free Tier) Deployment

This repo is deployed as a single Cloudflare Pages project:
1. Static frontend build output: `artifacts/exposure-checker/dist/public`
2. API routes: Pages Functions under `functions/api/*`
3. KV binding required: `PDEC_KV`
4. Public deployment: `https://personal-data-exposure-checker.pages.dev`

### Setup

1. Create one KV namespace for production and one for preview.
2. Update `wrangler.toml` with real namespace IDs:
   - `kv_namespaces.id`
   - `kv_namespaces.preview_id`
3. Install dependencies:
   - `pnpm install`
4. Build:
   - `pnpm run build:pages`
5. Local Pages runtime:
   - `pnpm run dev:pages`

### Cloudflare Pages Project Settings

Use these settings in the Pages UI:
1. Build command: `pnpm run build:pages`
2. Build output directory: `artifacts/exposure-checker/dist/public`
3. Root directory: `/` (repo root)
4. KV binding name: `PDEC_KV`

`_routes.json` is emitted via `public/_routes.json` and limits Function invocation to `/api/*`.

## Architecture Notes

See `PROJECT.md` and `replit.md` for project details and implementation notes.

## Upstream APIs

1. XposedOrNot is called directly with no API key.
2. HIBP Pwned Passwords uses k-anonymity and sends only the SHA-1 prefix.
3. HIBP public breach metadata is cached server-side for email results.
