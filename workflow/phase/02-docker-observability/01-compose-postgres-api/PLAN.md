# 2.1 Compose: postgres + api — Plan

**Phase:** 2 — Docker & observability
**Status:** Done

## Goal
Multi-stage Dockerfile for the api and a `docker-compose.yml`

## Done when
- `docker compose up` builds the api image, applies migrations, and starts the api against the Compose Postgres.
- `curl localhost:3000/health` returns 200, and `curl localhost:3000/health/ready` returns 200.
- The runtime image has no dev dependencies (no vitest, drizzle-kit, testcontainers, typescript), no pnpm, runs as a non-root user, and contains no `.env` file or tests.
- `docker compose stop api` shuts the api down cleanly (exit 0, within the 10 s timeout).
- `pnpm check` still passes.

## Plan

### The main constraint: native TypeScript and `node_modules`
Node refuses to strip types from `.ts` files **inside `node_modules`** (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). `@feedback-portal/contracts` exports `./src/index.ts`.
- Locally this works because pnpm symlinks `node_modules/@feedback-portal/contracts` to `packages/contracts`, and Node resolves the real path, which is outside `node_modules`.
- So **`pnpm deploy` is not an option**: it copies workspace packages *into* `node_modules`, and the api would crash on start.
- The image therefore keeps the **workspace layout** (`/app/apps/api`, `/app/packages/contracts`) with pnpm's symlinks, installed with `--prod`.

### Dockerfile (`apps/api/Dockerfile`, build context = repo root)
The context must be the root, because the api needs the lockfile, `pnpm-workspace.yaml` and `packages/contracts`.

| Stage | Base | Does |
|---|---|---|
| `deps` | `node:24.21-alpine` (exact tag pinned and age-checked at implementation) | Installs pnpm 12.5.1 with `npm i -g` (matches `packageManager`; avoids corepack, which Node is dropping). Copies only the manifests (`package.json`s, lockfile, `pnpm-workspace.yaml`, `.npmrc`), then `pnpm install --frozen-lockfile --prod --filter @feedback-portal/api...`. Uses a BuildKit cache mount for the pnpm store. |
| `runtime` | same Node image, **without pnpm** | Copies `node_modules` from `deps`, then only what runs: `apps/api/src`, `apps/api/drizzle`, `apps/api/package.json`, `packages/contracts/src`, `packages/contracts/package.json`. `USER node`, `NODE_ENV=production`, `EXPOSE 3000`, `CMD ["node", "src/main.ts"]` from `/app/apps/api`. |

- Copying manifests before sources means a code-only change reuses the cached install layer.
- No build stage is needed, since there is no compile step. "Multi-stage" here means the install tooling (pnpm, its store) never reaches the runtime image.
- `HEALTHCHECK` in the image calls `/health` with busybox `wget` (already in Alpine), so it needs no extra package.
- Node runs as PID 1. That's fine here, because `main.ts` already handles `SIGTERM`/`SIGINT` itself. Compose also sets `init: true` so zombie processes are reaped; it costs nothing.
- `--filter @feedback-portal/api...` installs the api and its workspace deps (contracts) only. Future `apps/web` deps won't end up in the api image.

### `.dockerignore` (root)
Allow-list style: ignore `*`, then re-include only what the Dockerfile copies. This keeps `.env`, `.git`, `node_modules`, `workflow/` and docs out of the context. `**/*.test.ts` and `apps/api/test/` are excluded so tests never reach the image.

### Migrations: a one-shot `migrate` service
```yaml
migrate:   # same image, runs migrate.cli.ts and exits
  command: ['node', 'src/shared/db/migrate.cli.ts']
  depends_on: { postgres: { condition: service_healthy } }
api:
  depends_on: { migrate: { condition: service_completed_successfully } }
```
- **Why not migrate inside `main.ts` at startup?** With several api replicas they would race, and a failing migration would put the api into a restart loop. A separate step is also the pattern 11.4 (deploy) will use, so this rehearses it.
- `migrate.cli.ts` already exists from 1.5 and needs no dev deps (it uses drizzle-orm's migrator, not drizzle-kit). Re-running is a no-op.

### `docker-compose.yml` additions
- **`api` and `migrate`** both `build: { context: ., dockerfile: apps/api/Dockerfile }`, with one shared image name (`feedback-portal-api`) so it's built once.
- **Environment:**
  - `env_file: { path: apps/api/.env, required: false }` provides `PROGRAM_NAME`, `ORG_NAME` and `LOG_LEVEL`. Nothing about the program is hard-coded in Compose.
  - `environment:` overrides what must differ in a container:
    - `DATABASE_URL=postgres://feedback:feedback@postgres:5432/feedback_portal` (service name, container port)
    - `NODE_ENV=production`, `LOG_FORMAT=json`, `HOST=0.0.0.0`, `PORT=3000`
  - If `.env` is missing, the api exits with the existing clear config error naming `PROGRAM_NAME`/`ORG_NAME`. README already says to `cp .env.example .env`.
- **Ports:** `3000:3000`. This clashes with `pnpm dev` on the host; README will say to run one or the other.
- **Healthcheck** for `api`: `/health/ready`, so later services (web in 4.x) can wait on a ready api with `depends_on: condition: service_healthy`.
- `postgres` is unchanged and keeps host port 5433 for local `pnpm dev` and `pnpm db:migrate`.

### Files
```
.dockerignore                  # new, root
apps/api/Dockerfile            # new
docker-compose.yml             # + migrate, api
README.md                      # "Run everything in Docker" section
```
No app code changes are expected. If the container exposes a problem (for example a path that only works from the repo root), I'll fix it and note it in the review.

### Out of scope
- **OpenTelemetry:** 2.2. **LGTM:** 2.3.
- **Production hardening:** image digest pinning, image scanning, distroless, read-only root FS, secrets management. These belong to 11.4.
- **Web app container:** 4.x.
- **CI building the image:** 11.4.
- **Hot reload inside Docker.** Local development stays `pnpm dev` against the Compose Postgres.

### Steps
1. Check the newest `node:24.x-alpine` tag and its age; pin it.
2. Write `.dockerignore` and `apps/api/Dockerfile`. Build it and inspect the image: contents, size, user, no dev deps.
3. Add `migrate` and `api` to `docker-compose.yml`.
4. Start Colima if needed, then run the manual checks below.
5. Update README. Run `pnpm check`. Write `REVIEW.md`.

### Verification
1. `docker compose up -d --build`: `migrate` exits 0, then `api` becomes healthy.
2. `curl -i localhost:3000/health` returns 200; `curl -i localhost:3000/health/ready` returns 200; `curl -i localhost:3000/nope` returns 404 problem JSON with `x-request-id`.
3. `docker compose logs api` shows JSON log lines.
4. Image checks:
   - `docker run --rm --entrypoint sh <image> -c 'ls node_modules/.pnpm'` shows no vitest, drizzle-kit, testcontainers or typescript.
   - `whoami` is `node`; there is no `.env`, no `*.test.ts`, no `test/` folder, and no `pnpm`.
   - Record the image size in the review.
5. `docker compose run --rm migrate` a second time is a no-op.
6. `docker compose stop postgres`: `/health/ready` returns 503, `/health` stays 200. Start it again: back to 200.
7. `docker compose stop api` exits with code 0 and logs the shutdown.
8. `pnpm check` exits 0.
