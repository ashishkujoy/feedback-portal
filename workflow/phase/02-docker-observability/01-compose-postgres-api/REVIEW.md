# 2.1 Compose: postgres + api — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/Dockerfile` | New. Two stages on `node:24.22.0-alpine3.24`. **`deps`:** installs pnpm 12.5.1 with npm, copies only the manifests and lockfile, then `pnpm install --frozen-lockfile --prod --filter @feedback-portal/api...` with a BuildKit cache mount for the store. **`runtime`:** copies the three `node_modules` folders and the source (`apps/api/{src,drizzle,package.json}`, `packages/contracts/{src,package.json}`), runs as `USER node` with `NODE_ENV=production`, has a `HEALTHCHECK` on `/health`, and starts with `CMD node src/main.ts`. |
| `.dockerignore` | New, allow-list style: `*` is ignored, then only the files the Dockerfile copies are re-included. `**/*.test.ts` is excluded. |
| `docker-compose.yml` | Adds `migrate` (one-shot) and `api`. Both share one image, `feedback-portal-api`, through the `x-api-image` anchor. `api` waits for `migrate` to complete successfully and has a `/health/ready` healthcheck. `postgres` is unchanged. |
| `README.md` | New section "Running everything in Docker" |

No app code changed.

## How to verify
```sh
colima start                               # if not running
cp apps/api/.env.example apps/api/.env     # if not done yet
docker compose up -d --build --wait
curl -i localhost:3000/health/ready
docker compose stop api                    # frees port 3000 for pnpm dev
```

| Check | Result |
|---|---|
| `docker compose up -d --build` | postgres healthy → `migrate` exits 0 ("migrations applied") → `api` started and **healthy** |
| `GET /health` | 200 `{"status":"ok"}`, with `x-request-id` |
| `GET /health/ready` | 200 |
| `GET /nope` | 404 `application/problem+json`, and `requestId` matches the header |
| Logs | JSON lines, `env: "production"`, `host: "0.0.0.0"` |
| `docker compose run --rm migrate` again | Exits 0; `drizzle.__drizzle_migrations` still has 1 row |
| `docker compose stop postgres` | `/health` 200, `/health/ready` **503**, warning logged (`ENOTFOUND postgres`). After `start`: 200 again. The api stayed up throughout. |
| `docker compose stop api` | "SIGTERM received, shutting down" logged, **exit code 0**, about 0.1 s |
| Image user | `node` |
| Image contents | `.pnpm` holds only hono, @hono/node-server, @logtape/logtape, drizzle-orm, postgres and zod. No vitest, drizzle-kit, testcontainers or typescript. No pnpm binary. No `.env`, none of our `*.test.ts` files, no `test/`, no `drizzle.config.ts`. |
| Workspace symlink | `node_modules/@feedback-portal/contracts` resolves to `/app/packages/contracts`, outside `node_modules`, so type stripping works |
| Image size | **273 MB unpacked**: the base image is 238 MB and our layers add 35 MB. Compressed it's 65 MB, against 62 MB for the base. |
| `pnpm check` | exit 0: 45 contracts tests, 59 api tests (53 unit + 6 integration) |

## Decisions & trade-offs
- **Node `24.22.0-alpine3.24`, not 24.21 as in the plan.** 24.22.0 was published 2026-10-14, so it's more than 1 day old. Local Node is 24.21.0; both are 24 LTS. Alpine 3.24 is the newest variant.
- **The `migrate` and `api` settings come from one YAML anchor (`x-api-image`).** They need the same image, env file and DB URL, so there's a single place to change them. `HOST`/`PORT` are set only on `api`, because `migrate` doesn't listen.
- **Two healthchecks:**
  - The image's `HEALTHCHECK` uses `/health` (liveness), so the image is sensible on its own.
  - Compose overrides it with `/health/ready` for `api`, so a later `web` service can wait for an api that can reach the DB.
- **`packages/tsconfig/package.json` is copied into the `deps` stage.** It's a devDep and is not installed, but `--frozen-lockfile` expects every workspace importer in the lockfile to exist. It is not copied into `runtime`.
- **`init: true`** puts Docker's tiny init in front of Node as PID 1. Signals are still forwarded, and the clean shutdown above confirms it.
- **`env_file` is `required: false`.** If `apps/api/.env` is missing, Compose still starts, and the api exits with the existing config error naming `PROGRAM_NAME`/`ORG_NAME`. No program or org name appears anywhere in Compose or the Dockerfile.
- **oxfmt formats `docker-compose.yml`.** It moved one comment onto an anchor line, so I placed that comment above the key instead.

## Deviations from plan
- The Node patch version: 24.22.0 instead of 24.21 (see above).
- Nothing else.

## Observations (not fixed here)
1. **Quoted message values.** In JSON logs, the request message renders as `"GET" "/nope" 404 0.3ms`, because LogTape quotes string values interpolated into `message`. The structured `properties` are correct. This is cosmetic and comes from 1.3. It could be fixed by pre-formatting the message, but log queries (Loki, 2.3) will use `properties` anyway.
2. **Readiness warning includes the full error.** When the DB is down, the warning includes the full error with its stack and Drizzle's `query`/`params`. For `select 1` there are no params, so nothing sensitive is logged now. This is the redaction item already noted for 3.x.
