# 4.6 Web in Compose + OTel web — Plan

**Phase:** 4 — Frontend skeleton
**Status:** Done

## Goal
The web container, plus browser traces sent through to the api

## Done when
- **`docker compose up -d --build --wait` runs the whole app.** http://localhost:5173 serves the web app, with `/api` forwarded to the API, and Google sign-in works with the same redirect URI as in dev.
- **One trace runs browser → API → database in Grafana.** A page's `/api/...` request has a browser span, the API's request span under it, and the `pg` query spans under that.
- Tests cover the telemetry setup. `pnpm check` passes.

## Plan

### Decision needed (1): what the `web` container runs
| Option | What it means |
|---|---|
| **A. nginx serving the production build** *(recommended)* | A multi-stage image: `vite build`, then the static files in `nginx-unprivileged`. nginx forwards `/api/` to the API with the prefix stripped (the Vite proxy's rule), and `/otlp/` to the collector (below). **It's what production will run.** It matches the API container, which also runs in production mode. 11.4 then only adds production concerns (TLS, hosts) on top. Day-to-day UI work stays on `pnpm dev:web`, as API work stays on `pnpm dev`. |
| B. The Vite dev server in a container | Hot reload inside Compose, but it needs the source bind-mounted and a Linux `node_modules` kept apart from the host's. It's slower on macOS, and it isn't what ships. |

TECH_STACK's Compose table currently says "Vite dev server locally". With **A**, that row becomes "nginx with the production build (`pnpm dev:web` for development)".

### Decision needed (2): how browser spans reach Grafana
| Option | What it means |
|---|---|
| **A. Through the web origin** *(recommended)* | The browser posts OTLP/HTTP to **`/otlp/v1/traces`** on its own origin. nginx (and Vite in dev) forwards `/otlp/` to the collector's port 4318. No CORS, no collector port called from the page, and nothing new in the API. |
| B. Through the API | A new `POST /telemetry/traces` endpoint relays spans to the collector. More code in the API, and every browser span costs an API request. |

**Either way,** an open span-ingest endpoint is fine locally. For production (11.x), it needs a size limit and rate limit, or sampling, or to be turned off; this is recorded as a follow-up.

The rest of the plan assumes **A** for both.

### The `web` image (`apps/web/Dockerfile`)
- **build stage:** the same Node image as the API (`node:24.22.0-alpine3.24`) and pnpm. `pnpm install --frozen-lockfile --filter @feedback-portal/web...`, then `pnpm --filter @feedback-portal/web build`. `VITE_OTEL_TRACES_URL` is passed as a build arg (below).
- **runtime stage:** `nginxinc/nginx-unprivileged:<pinned>-alpine`, which runs as a non-root user on port 8080. It contains only `dist/` and `apps/web/nginx.conf`.
- **Its own ignore file:** `apps/web/Dockerfile.dockerignore`, an allow-list like the API's. BuildKit reads it in place of the root `.dockerignore` for this Dockerfile, so the API image's context doesn't change.

### `apps/web/nginx.conf`
- **`/api/`:** `proxy_pass http://api:3000/;` (the trailing `/` strips `/api`).
  - The browser's `Host` and `Origin` pass through unchanged, so the API's CSRF check and its redirects see the web origin, as with Vite's `changeOrigin: false`.
  - `X-Forwarded-For` is **not** relied on. The API ignores it on purpose until 11.x configures a trusted proxy.
- **`/otlp/`:** `proxy_pass http://otel-lgtm:4318/;`, with `client_max_body_size` 1m.
- **Everything else:** static files, falling back to `/index.html` for client-side routes (`/batches`, `/login?error=…`).
- **Caching:** `/assets/*` (hashed names) is `public, max-age=31536000, immutable`. `index.html` is `no-cache`, so a new build is picked up straight away.
- `server_tokens off`, and a `/healthz` location for the container health check.

### Compose
- **New `web` service:** built from `apps/web/Dockerfile`, with host port **`5173:8080`**.
  - Same port as `pnpm dev:web`, so `WEB_APP_URL`, the Google redirect URI and the CSRF origin need no change. **As with the API on 3000, run one or the other.**
  - It `depends_on` the API being healthy. Its health check is `wget /healthz`.
- The header comment ("a later task adds web") is updated.
- **The session cookie in Compose is `__Host-session` with `Secure`** (the API runs with `NODE_ENV=production`). Chrome and Firefox accept `Secure` cookies on `http://localhost`. **Safari doesn't, so signing in through Compose needs Chrome or Firefox.** This is documented; `pnpm dev` (no `Secure`) works everywhere.

### Browser telemetry (`apps/web/src/telemetry/`)
- **Packages:** `@opentelemetry/sdk-trace-web`, `@opentelemetry/instrumentation-fetch`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/instrumentation`, `@opentelemetry/resources` and `@opentelemetry/semantic-conventions`.
  - They're pinned to **the same release line as the API's** (2.12.0 / 0.223.0 / 1.43.0), not the new 3.0 / 0.300 line from two days ago. Upgrading both together is a separate change.
- **Off unless `VITE_OTEL_TRACES_URL` is set at build time.**
  - The Compose build sets it to `/otlp/v1/traces`.
  - `pnpm dev:web` leaves it unset, so local development makes no telemetry requests and logs no exporter errors. Setting it in `apps/web/.env.local` turns it on, and Vite proxies `/otlp` to `localhost:4318` (the LGTM port Compose exposes).
- **When it's on, it's loaded with a dynamic `import()` before the first render,** so a build without it doesn't ship the SDK in the main bundle.
- **`WebTracerProvider`:**
  - resource `service.name = feedback-portal-web`;
  - a `BatchSpanProcessor` with the OTLP/HTTP exporter;
  - the default W3C trace-context propagator.
- **`FetchInstrumentation`:**
  - It adds `traceparent` only to same-origin requests (the default: no `propagateTraceHeaderCorsUrls`).
  - It ignores the exporter's own `/otlp/` requests (`ignoreUrls`), so exporting doesn't trace itself.
  - Span attributes follow the instrumentation's defaults (method, URL path, status). No user data is added.
- **The API needs no change.** Its HTTP instrumentation already continues an incoming `traceparent`, so the API's span becomes a child of the browser's.
  - The catch: a browser can choose its own trace ID. That's harmless for tracing, and noted for 11.x along with the ingest limits.
- **Pages, routes and document load aren't traced.** Only `fetch` is (out of scope).

### Tests
- **`telemetry/telemetry.test.ts`** (unit, with an in-memory exporter in place of OTLP):
  - A same-origin `fetch` to `/api/me` gets a `traceparent` header, and produces a client span with the method and status.
  - A request to `/otlp/v1/traces` isn't traced.
  - Without `VITE_OTEL_TRACES_URL`, `startTelemetry` isn't called, and `fetch` isn't patched.
- **Compose and nginx are checked by hand** (below). They're configuration, like the Vite proxy in 4.3.

### Docs
- **README "Running everything in Docker":**
  - The web app at http://localhost:5173, and the API still at :3000.
  - Run `pnpm dev:web` or the `web` container, not both. The same goes for the API.
  - Chrome or Firefox for Compose sign-in.
  - Finding a browser → API → DB trace in Tempo: service `feedback-portal-web`.
- **README "Web app":** `VITE_OTEL_TRACES_URL` for local tracing.
- **TECH_STACK:** the Compose `web` row (decision 1). The Telemetry row notes the `/otlp` path through the web origin.

### Out of scope
- **Production hosting:** TLS, real hostnames, security headers and CSP, trusting `X-Forwarded-For`, and limits on `/otlp` (11.4 and 11.x).
- **Web metrics and logs, document-load and route-change spans.**
- **Real-user sampling.** Everything is sampled locally.

### Steps
1. The telemetry module, its packages (with the release-age check) and tests. Wire it into `main.tsx` and add the Vite `/otlp` proxy.
2. `apps/web/Dockerfile`, `Dockerfile.dockerignore` and `nginx.conf`.
3. The Compose `web` service. `docker compose up -d --build --wait` from clean.
4. Docs. Run `pnpm check`, do the checks below, and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0. The Compose stack comes up healthy, including `web`.
- **With curl against :5173 (Compose):**
  - `/` and `/batches` give `index.html` (`no-cache`), and an `/assets/` file is `immutable`.
  - `/api/health` gives 200 from the API, and `/api/me` gives 401 problem+json.
  - `/api/auth/google` gives 302 to Google (or to `/login?error=unavailable` if it isn't configured).
- **The trace:** load the app in a browser (or, without the extension, send a `fetch` with a `traceparent` to `/api/me` and post a span to `/otlp/v1/traces`). Then confirm in Grafana Tempo, through its API, that one trace ID holds the `feedback-portal-web` span, the API's `GET /me` span and its `pg` spans.
- **By you, with your OAuth client:** sign in with Google at http://localhost:5173 in Chrome, with no `pnpm dev` running.
