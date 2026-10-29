# 11.4 Production build — Review

## What changed
| File | Notes |
|---|---|
| `deploy/compose.yml` | **The production stack**, project `feedback-portal-prod`. Images are `${IMAGE_REGISTRY}feedback-portal-{api,web}:${IMAGE_TAG}`, built here or pulled. postgres (named volume, required password, no port), `migrate`, `seed`, the api (no port, `TRUST_PROXY=true`), and web on `${WEB_BIND:-127.0.0.1}:${WEB_PORT:-8080}`. `restart: unless-stopped`, healthchecks, json-file logs capped at 5 × 10 MB. Required settings use `${VAR:?…}`; `WEB_APP_URL` and the Google redirect URI come from `PUBLIC_URL`. `DATABASE_URL` can point elsewhere. Optional settings pass through from `deploy/.env` (`env_file`, `required: false`). |
| `deploy/deploy.sh` | **Migrate on deploy:** `[--build | --pull]`, then `compose run --rm migrate`, then `up --detach --wait --remove-orphans`. A failed migration stops the deploy before anything running is replaced. |
| `deploy/.env.example` | Required settings first (`PUBLIC_URL`, branding, `POSTGRES_PASSWORD`, Google), then the optional ones: the first admin, Cloudinary, an outside database, image registry and tag, bind/port/`TRUSTED_PROXIES`, OTLP, and browser traces. `deploy/.env` is gitignored. |
| `apps/web/nginx/default.conf.template` (was `nginx.conf`) | Rendered by the image's entrypoint (envsubst). Changes: security headers and a **CSP** on every response (`add_header_inherit merge`); gzip; `X-Real-IP` **overwritten** with the client nginx saw; `/api` through an `upstream` with **`resolve`** (Docker's DNS via `NGINX_LOCAL_RESOLVERS`); `/otlp` only when `OTLP_UPSTREAM` is set, otherwise 404; **caching fixed** (below). |
| `apps/web/nginx/25-real-ip.sh` | When `TRUSTED_PROXIES` is set, writes `set_real_ip_from` lines with `real_ip_header X-Forwarded-For` (recursive); otherwise an empty file. |
| `apps/web/Dockerfile` (+ `.dockerignore`) | Copies the template and script, and sets the defaults with `ENV`: `OTLP_UPSTREAM=""`; Cloudinary and `*.googleusercontent.com` for `CSP_IMG_SRC`; Cloudinary's api for `CSP_CONNECT_SRC`; `TRUSTED_PROXIES=""`. |
| `apps/api/src/shared/config/config.ts`, `client-ip.ts`, `auth.routes.ts`, `main.ts` | **`TRUST_PROXY`** (true/false, default false), giving `config.server.trustProxy`. `clientIp(c, { trustProxy })` takes `X-Real-IP` only when trusted and only when it's an IP; it never reads `X-Forwarded-For`. Sign-in records it. |
| `apps/api/src/shared/db/migrate.ts`, `client.ts` | `runMigrations` takes one pool connection, holds a **session advisory lock** (`feedback-portal:migrate`) on it, migrates over it, and unlocks. A pool of one is enough. `Database` now carries its `$client` pool type. |
| `docker-compose.yml` (local) | The api gets `TRUST_PROXY: 'true'`; web gets `OTLP_UPSTREAM: otel-lgtm:4318`. |
| `e2e/compose.yml`, `e2e/e2e.env`, `e2e/run.sh` | **E2E now runs on the production Compose**: `-f deploy/compose.yml -f e2e/compose.yml --env-file e2e/e2e.env`. The override puts postgres on tmpfs, unpublishes web, resets `env_file` (so a real `deploy/.env` is never used), adds the stand-in Google and playwright, and drops the `otel-lgtm` alias. |
| `e2e/tests/main-path.spec.ts` | Fails a test on any **Content-Security-Policy** console error. |
| Tests | `client-ip.test.ts` (3); `migrate.int.test.ts` (two migrations at once); auth routes (X-Real-IP only when trusted); config (`TRUST_PROXY`). |
| `README.md`, `TECH_STACK.md`, `apps/api/.env.example` | "Deploying": first deploy, each deploy, rollback, Caddy, load balancer, nginx settings, backups and restore, logs. Also the production services table, the layout, and `TRUST_PROXY`. |

## How to verify
```sh
pnpm check   # contracts 84 + web 426 + api 725
pnpm e2e     # the production Compose with the test overrides
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** API 725 (+6). Format and lint clean, no suppressions, no new dependencies. |
| `pnpm e2e` | **6 passed, twice in a row** (about 50s each), with the CSP check on. Nothing left behind. |
| 1. Missing settings | `compose config` without an env file stops, naming each one ("required variable POSTGRES_PASSWORD is missing a value: set POSTGRES_PASSWORD in deploy/.env", GOOGLE_CLIENT_ID, …). |
| 2. Up and headers | On a throwaway project (`feedback-portal-prodcheck`, sample settings in the scratchpad), all services are healthy. Only web is published (`127.0.0.1:8090`); the api and postgres aren't reachable from the host. `/batches`, `/` and `/index.html` return the five security headers, the CSP and `Cache-Control: no-cache`. A hashed asset returns `public, max-age=31536000, immutable`, gzip, and the headers. A missing asset or `favicon.ico` gives 404. `/otlp/v1/traces` gives 404. `/api/health/ready` gives 200. |
| 3. Deploy again | `migrate` runs again ("migrations applied", nothing new), and the api keeps the same container. |
| 4. Failed migration | An api image with an extra `select 1/0;` migration. **`docker compose up` alone took the site down** (below). With **`deploy/deploy.sh`**, the deploy exits 1 with "division by zero", the **api keeps its container and image**, and `/api/health/ready` stays 200. A normal `deploy.sh` afterwards exits 0. |
| 5. Client IP | Every E2E session records the browser's address (`127.0.0.1`), not nginx's. A sign-in with a forged `X-Real-IP: 6.6.6.6` (and `X-Forwarded-For`) still records `127.0.0.1`. `TRUSTED_PROXIES=10.0.0.0/8,192.168.0.0/16` renders two `set_real_ip_from` lines, and `nginx -t` passes. |
| Redeployed api | The api was recreated at a new address (`.3` → `.5`) without restarting web. nginx found it: one 502, then 200 within about 4s (the resolver's 10s TTL). |
| 6. Teardown | The check project, its volumes and the broken-image tags were removed. |
| Local stack | `docker compose up --build --wait` works. `/otlp/v1/traces` reaches the collector (200), the headers are present, and the stack was stopped again. **Dev data is unchanged:** Dhurandhar has 61 interns, and there are no `@e2e.test` users. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **5, all caught:** <ul><li>No advisory lock: the concurrency test fails 3 runs out of 3 ("duplicate key … pg_namespace").</li><li>The api trusting `X-Real-IP` without `TRUST_PROXY`: 2 tests fail.</li><li>nginx forwarding the browser's `X-Real-IP`: the forged sign-in records `6.6.6.6`.</li><li>Deploying with plain `up` (no separate migrate step): check 4 leaves the site down.</li><li>A CSP that blocks the app: the first E2E run failed on `font-src 'self'` (below).</li></ul> |

## Decisions & trade-offs
- **All six as recommended:**
  - TLS in front;
  - `X-Real-IP` overwritten by nginx and trusted by the api only with `TRUST_PROXY`;
  - the CSP;
  - an advisory lock on migrations;
  - telemetry only when configured;
  - Postgres bundled, or `DATABASE_URL`.
- **The CSP allows `data:` fonts.** Vite inlines small font subsets as `data:` URIs. The E2E CSP check found this on its first run.
- **`img-src` includes `https://*.googleusercontent.com`:** users' Google avatars are shown.
- **The web port binds to loopback by default,** for a TLS proxy on the same host. A load balancer elsewhere needs `WEB_BIND=0.0.0.0`.
- **The production project name is `feedback-portal-prod`,** so it can never share volumes with the local `feedback-portal` stack on the same machine.
- **`deploy.sh` with no option uses the images already on the host,** which is what a rollback to an earlier `IMAGE_TAG` needs. `--build` and `--pull` are explicit.

## Deviations from plan
- **`deploy/deploy.sh` was added.** The plan relied on `depends_on: migrate (completed)` in `up`. Check 4 showed that `up` replaces the api's container before the migration runs, so a failed migration left the api Created but not started, and the site down. Running `migrate` on its own first keeps the running app until migrations succeed.
- **Fixed a caching bug that predates this task.** Hashed assets never got their year-long `Cache-Control`, and `index.html` never got `no-cache`. The file-extension regex location won over `/assets/` and over the `/index.html` fallback. Now `^~ /assets/` and `location = /index.html` are used. The README already described the intended behaviour.
- **nginx re-resolves the api** (`upstream … resolve`). Without it, a redeploy that gave the api a new address left nginx on the old one until restarted. This wasn't in the plan, but the deploy needs it.
- **The CSP is not configurable through Compose,** only by setting the web container's `CSP_IMG_SRC` / `CSP_CONNECT_SRC`. Listing them in `deploy/compose.yml` with empty defaults would have overridden the image's defaults.
- **Check 5 was done by hand** with curl inside the E2E stack, not as an automated test: sessions' IPs aren't visible in the UI.

## Not done / follow-ups
- CI/CD, pushing images to a registry, scheduled backups, more than one api replica (which would avoid the short window during an api restart), and Kubernetes.
- **Migrations only go forward.** A rollback across a schema change needs a compatible migration or a restore (the README says so).
