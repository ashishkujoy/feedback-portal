# 11.4 Production build — Plan

**Phase:** 11 — Dashboards & polish
**Status:** Done

## Goal
Nginx for the web app, production Compose, and a migrate-on-deploy job

## Done when
The api and web Dockerfiles, nginx and the one-shot migrate job already exist (2.1, 4.6), but only as the **local** stack (`docker-compose.yml`: dev credentials, Grafana, open ports). This task makes them deployable.

- **`deploy/compose.yml`**: the production stack on one host.
  - **Images:** `${IMAGE_REGISTRY}feedback-portal-{api,web}:${IMAGE_TAG}`. They are pulled when the tag exists, or built on the host with `--build`.
  - **Services:**
    - postgres: a named volume, its password from the env file, no host port;
    - the one-shot `migrate` and `seed` jobs;
    - the api, with no host port;
    - web, published on `${WEB_PORT:-8080}` only.
  - **Running:** `restart: unless-stopped`, healthchecks, and log rotation (json-file, capped).
  - **Configuration** comes from `deploy/.env` (gitignored), copied from **`deploy/.env.example`**. Compose stops with a clear message if a required value is missing (`${VAR:?…}`): `PUBLIC_URL`, `PROGRAM_NAME`, `ORG_NAME`, `POSTGRES_PASSWORD`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. The optional values are Cloudinary, the first admin, OTLP, and the image tag.
  - `WEB_APP_URL` and `GOOGLE_REDIRECT_URI` are derived from `PUBLIC_URL`, so they can't disagree.
  - There is no Grafana.
- **Migrate on deploy:** every `docker compose up` runs `migrate` first, and the api (re)starts only once it has **succeeded**.
  - **If a migration fails,** `up` stops with its error and the **running api is left as it was**: it isn't replaced by the new version.
  - **Two deploys at once** can't migrate together: the migration takes a Postgres advisory lock (decision 4).
- **nginx for production** (one image, configured at start-up through nginx's `templates/` and environment variables):
  - **Security headers** on every response: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, and a **Content-Security-Policy** (decision 3).
  - **gzip** for text assets.
  - **`/otlp` only when an upstream is configured** (`OTLP_UPSTREAM`; otherwise 404). nginx then starts without a collector (decision 5). The local stack sets it to `otel-lgtm`, and the E2E stack no longer needs its alias.
  - The api gets **`X-Real-IP`** (decision 2).
- **The client's IP behind proxies:** the api reads it from `X-Real-IP` only when `TRUST_PROXY=true`. Otherwise it uses the socket's peer, as now. nginx can take the client's address from a TLS load balancer's `X-Forwarded-For` when `TRUSTED_PROXIES` lists that balancer.
- **TLS is in front** (decision 1): the README shows the expected setup, with a Caddy example. `PUBLIC_URL` must be `https://`.
- **E2E runs on the production Compose:** `e2e/compose.yml` now **extends** `deploy/compose.yml`, overriding only what tests need (the stand-in Google, tmpfs, no published port). `pnpm e2e` therefore tests the production configuration.
- **README** gets "Deploying": first deploy, updates, rollback, backups (a `pg_dump` one-liner), and the TLS proxy.
- `pnpm check` and `pnpm e2e` pass, and the deployment checks below pass.

## Decisions
**All accepted as recommended.**

### (1) Where HTTPS ends
In production the session cookie is Secure, so the site must be served over HTTPS.
- **Recommended:** TLS is terminated **in front of** the stack: a cloud load balancer, the host's existing proxy, or Caddy. The stack serves plain http on `WEB_PORT`. The README includes a three-line Caddyfile for a bare VM (automatic certificates). This keeps the stack the same wherever it runs.
- **The alternative:** a Caddy service inside `deploy/compose.yml`, which owns ports 80 and 443 and gets certificates itself. That works on a bare VM but conflicts with any proxy already there.

### (2) The client's IP
Sessions record the sign-in IP. Behind nginx, the api only ever sees nginx's address. **Recommended:**
- nginx always **overwrites** `X-Real-IP` with the client it saw. It never forwards one the browser sent.
- The api trusts that header only when `TRUST_PROXY=true`, which the production and local stacks set. `pnpm dev` stays as now.
- If a load balancer sits in front, `TRUSTED_PROXIES` (its address range) lets nginx take the real client from `X-Forwarded-For`, via `real_ip`.

### (3) Content-Security-Policy
**Recommended:**
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: https://res.cloudinary.com; connect-src 'self' https://api.cloudinary.com;
font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```
- **The Cloudinary origins:** photos are uploaded straight to Cloudinary and shown from it.
- **`'unsafe-inline'` for styles only:** React sets some `style` attributes.
- **Overrides:** the Cloudinary origins come from `CSP_IMG_SRC` / `CSP_CONNECT_SRC`.
- **Checks:** the browser check confirms there are no CSP violations on any page. The E2E suite also fails on a console CSP error.
- **The alternative:** only the simpler headers, with no CSP.

### (4) Concurrent migrations
**Recommended:** `migrate.cli.ts` holds a Postgres **advisory lock** while it runs. A second deploy waits, then finds nothing to apply. It's a few lines, and it makes two overlapping `up`s safe.

### (5) Telemetry in production
**Recommended:**
- **The api** exports to any OTLP endpoint (`OTEL_EXPORTER_OTLP_ENDPOINT`), and is off when that isn't set.
- **Browser tracing** is off in the production image by default. It's a build argument, so the local stack keeps it.
- **nginx's `/otlp`** proxies only when `OTLP_UPSTREAM` is set.

Grafana stays local-only.

### (6) Postgres
**Recommended:** Postgres runs in the stack, with a named volume and a required password. Setting `DATABASE_URL` points the api at a managed database instead, and the `postgres` service can then be left out with `--scale postgres=0`. **Backups:** the README gives a `pg_dump` command and a restore. Scheduling them is out of scope.

## Plan
- **API:**
  - `TRUST_PROXY` in the config;
  - `clientIp` reads `x-real-ip` when it is trusted;
  - the advisory lock in `runMigrations`.
  - Tests: the config; the client IP with and without trust (a forged header is ignored when untrusted); two migrations at once both succeed, and the schema is applied once.
- **Web image:**
  - `apps/web/nginx.conf` becomes `apps/web/nginx/default.conf.template`, with the headers, CSP, gzip, `X-Real-IP`, an optional `real_ip`, and `/otlp` behind `OTLP_UPSTREAM`.
  - The Dockerfile copies it to `/etc/nginx/templates/`, with defaults set by `ENV`.
  - `VITE_OTEL_TRACES_URL` stays a build argument.
- **`deploy/compose.yml`** and **`deploy/.env.example`**.
- **The local `docker-compose.yml`:** sets `OTLP_UPSTREAM` and `TRUST_PROXY`; otherwise unchanged.
- **`e2e/compose.yml`:** rebuilt on `extends: deploy/compose.yml`. The spec adds a check for no CSP violations.
- **README:** "Deploying". **TECH_STACK:** the production services table.

### Tests
- **API unit and integration:**
  - `TRUST_PROXY`;
  - `clientIp` (trusted, untrusted, missing);
  - the concurrent migrations.
- **E2E:** the main path, now on the production Compose; no CSP violations in the console.
- **Deployment checks** (local, with a sample `deploy/.env` in the scratchpad, never the real one; on a separate project name, so the dev stack is untouched):
  1. `config` fails with the missing variable's name when a required value is unset.
  2. `up --wait`: health, the login page, the security headers and CSP (`curl -I`), `/otlp` gives 404, and `/api` isn't reachable on any other port.
  3. Running `up` again: migrate runs and does nothing.
  4. **Failed migration:** with a deliberately broken migration in a test image, `up` fails and the old api container keeps serving (same container id, `/health` 200).
  5. A sign-in records the browser's IP, not nginx's.
  6. Tear down, including volumes.
- **Mutations** (on copies, restored with `cp`, checked with `cmp`):
  - the api trusting `X-Real-IP` without `TRUST_PROXY`;
  - nginx passing on the browser's `X-Real-IP`;
  - no advisory lock (the concurrency test);
  - api not depending on migrate succeeding (deployment check 4);
  - a CSP that blocks the app (E2E).

### Out of scope
- CI/CD, pushing images to a registry, scheduled backups, Kubernetes, and more than one host or api replica.
- Mobile.

### Steps
1. The api: `TRUST_PROXY`, `clientIp`, the migration lock, and tests.
2. The nginx template, the web Dockerfile, and the local Compose update.
3. `deploy/compose.yml`, `.env.example`, and the deployment checks.
4. `e2e/compose.yml` on top of it, plus the CSP check; `pnpm e2e` twice.
5. README and TECH_STACK, `pnpm check`, mutations, `REVIEW.md`.

### Verification
- `pnpm check` and `pnpm e2e` exit 0.
- Deployment checks 1–6 pass.
- The mutations fail the tests or checks.
- The dev stack and its data are unchanged (Dhurandhar: 61 interns).
