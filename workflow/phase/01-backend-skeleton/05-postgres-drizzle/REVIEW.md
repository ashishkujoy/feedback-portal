# 1.5 Postgres + Drizzle — Review

## What changed
| File | Notes |
|---|---|
| `TECH_STACK.md`, `DATA_MODEL.md` | Postgres **17 → 18.6** (image `postgres:18.6-alpine`). Compose port is now `5433` on the host. |
| `docker-compose.yml` (new, root) | Only `postgres` for now: local-only credentials, a named volume at `/var/lib/postgresql` (the Postgres 18 layout), and a `pg_isready` healthcheck |
| `apps/api/package.json` | `drizzle-orm@0.45.4` and `postgres@3.4.9` (deps), `drizzle-kit@0.31.11` (devDep). Scripts `db:generate` and `db:migrate`. |
| `package.json` (root) | `db:generate` and `db:migrate`, which forward to the api |
| `pnpm-workspace.yaml` | `allowBuilds: { esbuild: false }`. See trade-offs. |
| `apps/api/src/shared/config/config.ts` (+ test) | `DATABASE_URL` (required, must be `postgres:`/`postgresql:`), `DATABASE_POOL_MAX` (1–100, default 10). Mapped to `config.db`. |
| `apps/api/src/shared/config/load-config-or-exit.ts` | Moved out of `main.ts`, because `main.ts` and the migrate CLI both use it |
| `apps/api/src/shared/db/client.ts` | `createDb(config.db)` → `{ db, ping, close }` using the postgres.js pool. NOTICE messages are silenced. |
| `apps/api/src/shared/db/migrate.ts`, `migrate.cli.ts` | `runMigrations(db)` uses drizzle-orm's migrator. The CLI loads config and logging, migrates, closes the pool, and exits 0 or 1. |
| `apps/api/src/shared/db/columns.ts` | `citext` custom column type, for `users.email` in 3.1 |
| `apps/api/drizzle.config.ts` | Schema = `shared/db/columns.ts` plus `modules/*/infrastructure/schema.ts`. Output goes to `./drizzle`, with `snake_case` casing. |
| `apps/api/drizzle/0000_baseline.sql` (+ `meta/`) | Created with `drizzle-kit generate --custom`. Contains `CREATE EXTENSION IF NOT EXISTS citext;` |
| `apps/api/src/shared/http/health.routes.ts` (+ test) | Now a factory `healthRoutes({ ping })`. New `GET /health/ready` with a 2 s timeout → 200 or a 503 problem response. |
| `apps/api/src/app.ts` | `createApp(deps: AppDeps)`, where `AppDeps = HealthDeps` for now |
| `apps/api/src/main.ts` | Creates the DB and passes `ping`. Shutdown order: close the server → close the pool → flush logs → exit. |
| `packages/contracts/src/problem.ts` | Adds the `unavailable` code. Problem titles add 503. |
| `apps/api/src/shared/http/request-logger.ts` | Also skips `/health/ready`, since it's a probe |
| `apps/api/.env.example` | `DATABASE_URL` (Compose credentials, port 5433) and `DATABASE_POOL_MAX` |

## How to verify
```sh
colima start                                   # if not running
docker compose up -d --wait postgres
pnpm db:migrate                                # twice — second is a no-op
pnpm db:generate                               # "No schema changes, nothing to migrate"
pnpm check                                     # exit 0 — 45 contracts + 53 api tests
cd apps/api && pnpm dev
curl -i localhost:3000/health/ready            # 200; stop postgres → 503 problem JSON
```

Manual run results:

| Check | Result |
|---|---|
| Server version | `PostgreSQL 18.6 on aarch64-unknown-linux-musl` |
| `pnpm db:migrate` ×2 | Both runs succeed. `drizzle.__drizzle_migrations` has exactly 1 row, and `citext` is installed. |
| `pnpm db:generate` | "No schema changes, nothing to migrate" |
| `/health/ready` with DB up, then stopped, then restarted | 200 → **503** `unavailable` (in 3 ms; connection refused) → 200. The pool reconnects without a restart. |
| `/health` with DB stopped | 200 (liveness never touches the DB) |
| DB URL or password in logs | Not present. I grepped for `postgres://` and the password: 0 matches. |
| `SIGTERM` | Exit 0 |

## Tests
- **Config:** `DATABASE_URL` required (listed together with the other missing variables); `postgresql://` and query-string URLs accepted; `mysql://`, a URL without a scheme, and non-URLs rejected; the URL value never appears in the error; `DATABASE_POOL_MAX` default, accepted value and range; `config.db` frozen.
- **`/health/ready`:** 200 with one ping; a rejected ping → 503 problem response, the error text is absent from the body, and one `warning` is logged with the `requestId`; a hanging ping → 503 after the timeout (fake timers).
- **`/health`** returns 200 even when `ping` rejects.
- **Request logger:** neither probe path is logged.

## Decisions & trade-offs
- **`esbuild: false` in `allowBuilds`.** pnpm 12 stops on install until each build script is explicitly allowed or denied. drizzle-kit pulls in esbuild, whose postinstall script only checks its platform binary, and that binary already comes as an optional package. I chose to deny the script. `drizzle-kit generate` works without it.
- **Our own migrate script, not `drizzle-kit migrate`.** That way the production image doesn't need dev dependencies (11.4), and output goes through LogTape.
- **No schema barrel.** A comment-only file fails lint (`unicorn/no-empty-file`), and drizzle-kit needs at least one schema file. So the drizzle-kit config lists `shared/db/columns.ts` plus a glob for the module schema files. The Drizzle client gets its relational schema in 3.1, once tables exist.
- **The route depends on `ping`, not on Drizzle,** so the HTTP layer and its tests don't need a database.
- **Readiness warnings log the Drizzle error, which includes the SQL and its parameters.** For `select 1` that's harmless. **Watch-out for later:** once real queries carry user data, query errors logged by 1.4's 500 handler will include parameters. I'll handle redaction with auth (3.x), which is already listed as out of scope in 1.3.
- **Postgres 18 has a native `uuidv7()` function.** DATA_MODEL says IDs are generated in the app. Both work, and we can decide in 3.1.

## Deviations from plan
- **`schema.ts` barrel replaced by `columns.ts` plus a glob in the drizzle-kit config.** The barrel was in the plan, but lint rejects an empty file. See trade-offs.
- **`loadConfigOrExit` moved to its own file.** It's shared by `main.ts` and the migrate CLI.
- **Postgres 18.6 instead of 17,** as you decided.
- Compose is left **running** locally (`docker compose down` stops it), and Colima is running.
