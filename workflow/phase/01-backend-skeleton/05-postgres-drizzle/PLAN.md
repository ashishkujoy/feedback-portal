# 1.5 Postgres + Drizzle — Plan

**Phase:** 1 — Backend skeleton
**Status:** Done

## Goal
DB client, drizzle-kit config, migrations script

## Done when
- `pnpm db:migrate` applies migrations to a local Postgres 18.6 and is safe to re-run.
- `pnpm db:generate` creates a SQL migration from the Drizzle schema.
- `GET /health/ready` returns 200 when the DB answers and 503 when it doesn't. `/health` stays a liveness check only.
- The API closes the DB pool on shutdown.
- `pnpm check` passes.

## Plan

### Packages (exact pins, all older than 1 day)
| Package | Version | Where | Why |
|---|---|---|---|
| `drizzle-orm` | 0.45.4 | api deps | Latest stable. 1.0 is still RC, so I'm not using it. |
| `postgres` (postgres.js) | 3.4.9 | api deps | **Zero dependencies**, unlike `pg`, which pulls in pg-pool, pg-types and others. Drizzle supports it natively. |
| `drizzle-kit` | 0.31.11 | api devDeps | Only used to **generate** migrations. It brings esbuild and tsx, but only as dev dependencies. |

### Where Postgres comes from locally
**Decided:** Postgres **18.6**. TECH_STACK and DATA_MODEL have been updated from 17.
- A minimal root `docker-compose.yml` with **only** a `postgres` service using `postgres:18.6-alpine`. Task 2.1 adds the api to the same file.
- **Port:** host `5433` → container `5432`, so it doesn't clash with the Homebrew Postgres already on 5432.
- **Volume:** the named volume is mounted at `/var/lib/postgresql`. Since the 18 images, PGDATA is `/var/lib/postgresql/18/docker`, and the older `/var/lib/postgresql/data` mount no longer works.
- **Healthcheck:** `pg_isready`.

### Config additions
| Env var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | **yes** | `postgres://…`, validated as a URL with a `postgres:` or `postgresql:` protocol. It's never printed, because it contains the password. Error messages show the key only, as now. |
| `DATABASE_POOL_MAX` | no | Default `10`, integer 1–100 |

- Maps to `config.db = { url, poolMax }`.
- `.env.example`: `DATABASE_URL=postgres://feedback:feedback@localhost:5433/feedback_portal`. These are local-only credentials, the same ones Compose uses.

### Files
```
docker-compose.yml                     # postgres:18.6-alpine only (2.1 adds api)
apps/api/
  drizzle.config.ts                    # dialect postgresql, schema glob, out: ./drizzle, url from env
  drizzle/                             # generated SQL migrations + meta (committed)
  src/shared/db/
    client.ts                          # createDb(config.db) → { db, close }; postgres.js pool
    schema.ts                          # barrel re-exporting module schemas (empty until 3.1)
    migrate.ts                         # runMigrations(db) via drizzle-orm's migrator
    migrate.cli.ts                     # `pnpm db:migrate` entry: load config → migrate → close
    db.test.ts                         # unit-level: config mapping; no live DB (that's 1.6)
  src/shared/http/health.routes.ts     # + GET /health/ready
```

### Migrations
- **`pnpm db:generate`** runs `drizzle-kit generate`. It writes SQL files into `apps/api/drizzle/`, which are committed and reviewed like code.
- **`pnpm db:migrate`** runs our own script, `node --env-file-if-exists=.env src/shared/db/migrate.cli.ts`. It uses `drizzle-orm`'s migrator, **not** `drizzle-kit migrate`, for two reasons:
  - The production image (11.4) can run migrations without dev dependencies.
  - Logging and errors go through our config and LogTape.
- **First migration (decided):** `0000_baseline.sql` contains `CREATE EXTENSION IF NOT EXISTS citext;`.
  - It gives case-insensitive unique emails for `users.email` in 3.1, enforced by the DB even for rows not written through the app.
  - The app will still trim emails and lower-case them for display consistency.
- Root `package.json` gets `db:generate` and `db:migrate` scripts that forward to `apps/api`.

### DB client
- `createDb({ url, poolMax })` creates the postgres.js pool and wraps it with `drizzle()`. It returns `{ db, close }`. There is no global singleton: `main.ts` creates it and passes it on, using the same manual DI as everything else.
- `prepare: true` is the default; it's fine because we don't use PgBouncer in transaction mode.
- **Readiness:** `GET /health/ready` runs `select 1` with a 2-second timeout.
  - When it works: `200 {status:'ok'}`.
  - When it fails: a **503 problem response** with code `unavailable`. That code is added to `ErrorCode` in contracts.
  - The DB error is logged at `warning` and never sent to the client.
- **Wiring:** `createApp()` takes the deps it needs: `createApp({ db })`. Only the readiness route uses it for now. Tests pass a fake `{ ping }` function. To avoid passing the whole Drizzle instance into the HTTP layer, the route depends on a small `ping: () => Promise<void>` port.
- **Shutdown:** in `main.ts`, after `server.close` completes, `await close()` on the pool, then dispose the loggers.

### Tests (no live DB in this task; that's 1.6)
- **Config:** `DATABASE_URL` is required, a non-postgres URL is rejected, the URL value never appears in the error, and `DATABASE_POOL_MAX` has a default and bounds.
- **`/health/ready`** with a fake ping:
  - A resolved ping returns 200.
  - A rejected ping returns a 503 problem response with code `unavailable`. The error message is not in the body, and a `warning` is logged.
  - A ping slower than the timeout returns 503.
- **`/health`** still returns 200 without touching the DB.

### Manual verification
1. `colima start`, then `docker compose up -d postgres`, and wait until it's healthy.
2. `pnpm db:migrate` applies `0000_baseline`. Running it a second time is a no-op. I'll check `drizzle.__drizzle_migrations` with `psql`.
3. `pnpm db:generate` against the empty schema reports "No schema changes".
4. `pnpm dev`, then `curl /health/ready` returns 200. After `docker compose stop postgres`, it returns 503 problem JSON, and the API keeps running.
5. `SIGTERM` exits cleanly with code 0, and the pool is closed.

### Out of scope
- Tables and Postgres enums: 3.1 and later.
- Testcontainers and the integration-test harness: 1.6.
- The api container and the full Compose stack: 2.1.
- Migrate-on-deploy: 11.4.
- uuid v7 generation: it arrives with the first table (3.1).

### Steps
1. Add packages; check release-age exceptions.
2. Add `DATABASE_URL` and `DATABASE_POOL_MAX` to config and tests. Add `unavailable` to `ErrorCode`.
3. Write `client.ts`, `schema.ts`, `migrate.ts`, `migrate.cli.ts` and `drizzle.config.ts`. Hand-write `0000_baseline` in drizzle-kit's format.
4. Add the readiness route with a `ping` port; change `createApp(deps)`; wire `main.ts` and shutdown.
5. Add `docker-compose.yml`, `.env.example` and the root scripts.
6. Run the tests and the manual checks above. Run `pnpm check` and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- `pnpm db:migrate` succeeds twice in a row against Compose Postgres 18.6. `/health/ready` switches between 200 and 503 as the DB goes up and down.
