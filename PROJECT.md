# PROJECT.md

## Project
Personal Data Exposure Checker (PDEC) is a privacy-focused web app that checks:
1. Email exposure via XposedOrNot + HIBP public breach catalog.
2. Password exposure via HIBP Pwned Passwords (k-anonymity SHA-1 prefix flow).

Primary user flows:
1. `/` home form for email/password check.
2. `/results` risk scoring + recommendations + breach details + PDF export.
3. `/methodology` scoring formulas and references.
4. `/stats` internal/public observability dashboard.

## Current Repo Structure

Monorepo (pnpm workspace), key packages:
1. `artifacts/exposure-checker`: Vite + React frontend.
2. `artifacts/api-server`: Express 5 API server (Node runtime).
3. `lib/api-spec`: OpenAPI source.
4. `lib/api-client-react`: generated React Query client/hooks.
5. `lib/api-zod`: generated runtime schemas.
6. `lib/db`: Postgres/Drizzle package (currently not used by request paths in this app).

Main API contract (from `lib/api-spec/openapi.yaml`):
1. `GET /api/healthz`
2. `POST /api/check`
3. `GET /api/stats`

Frontend consumes relative `/api/*` endpoints through generated client.

## Current Runtime Architecture (Before Refactor)
1. Frontend is static-build Vite output (`artifacts/exposure-checker/dist/public`).
2. Backend is Express + Node-only patterns (`app.listen`, middleware stack, `process.hrtime`, Node crypto).
3. Metrics are in-memory process state with ring buffers and periodic bucketing.
4. Rate limiting currently uses `express-rate-limit` for `/api/check`.
5. No persistent app database is required for core behavior.

## Cloudflare Pages Gap Analysis
Why it is not deployable as-is:
1. Express API cannot run directly in Pages Functions without refactor.
2. Node/server lifecycle assumptions must be replaced with Worker/Functions model.
3. Current shared API state model must be adapted for edge/runtime constraints.

Cloudflare constraints relevant to this project:
1. Pages Functions usage is billed under Workers Free quota (`100,000` req/day).
2. Workers Free CPU limit is `10ms` CPU/request.
3. Static asset requests are free/unlimited when Functions are not invoked.
4. KV on Free has `100,000` reads/day and `1,000` writes/day, with eventual consistency.
5. Durable Objects cannot be created/deployed inside a Pages project itself (would require separate Worker).

## Target Deployment Decision (Locked)
Chosen decisions:
1. Keep everything Pages-only (single Pages project) and use KV where shared state is needed.
2. Keep `/stats` publicly accessible.
3. Keep existing app/API surface behavior for end users.

Planned target topology:
1. Static frontend from `artifacts/exposure-checker`.
2. Pages Functions for `/api/*` routes.
3. KV binding for Pages Functions for edge-compatible shared state use.
4. `_routes.json` to limit Function invocation to API routes only (preserve free static serving behavior).

## Expected Behavioral Compatibility
Will remain the same:
1. Same route paths and JSON contract for `/api/healthz`, `/api/check`, `/api/stats`.
2. Same risk-scoring formulas and recommendations.
3. Same password privacy guarantees (raw password never leaves in identifiable form).
4. Same frontend page routes and interactions.

Runtime-level caveat to document after refactor:
1. Any cross-edge shared state implemented with KV is eventually consistent by design.
