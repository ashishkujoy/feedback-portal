# 1.6 Testcontainers harness — Plan

**Phase:** 1 — Backend skeleton
**Status:** Done

## Goal
Vitest global setup that starts Postgres, runs migrations, and gives each test a clean DB

## Done when
- Integration tests run against a real `postgres:18.6-alpine` container that the test run starts and stops itself, with no Compose needed.
- Migrations are applied once per run. Each test file gets its own database, and each test starts with empty tables.
- An integration test hitting the DB passes: migrations applied, `/health/ready` against the real DB, and the table reset.
- `pnpm check` passes. `pnpm test:unit` runs without Docker.

## Plan

### Packages (exact pins, devDeps only)
| Package | Version | Note |
|---|---|---|
| `testcontainers` | 12.2.0 | 12.2.1 is from yesterday, so it's within the release-age window but should be old enough by install time. I'll pin whichever is newest and older than 1 day. |
| `@testcontainers/postgresql` | same | Only depends on `testcontainers` |

`testcontainers` is the heaviest dependency so far: dockerode, undici, tar-fs, archiver and others. It's **dev-only** and never reaches the production image. The alternative is about 40 lines of our own `docker run` / `docker rm` code. I'm keeping Testcontainers because it's in the agreed stack, and it handles cleanup properly when a run crashes (its Ryuk reaper).

### Test layout: two Vitest projects
| Project | Files | Docker? | Global setup |
|---|---|---|---|
| `unit` | `src/**/*.test.ts`, excluding `*.int.test.ts` | no | none |
| `integration` | `src/**/*.int.test.ts` | yes | `test/global-setup.ts` |

Scripts in `apps/api`:
- `test`: both projects. This is what `pnpm check` runs.
- `test:unit`: the `unit` project only, for fast runs without Docker.
- `test:int`: the `integration` project only.

### How a clean DB is provided
1. **Global setup, once per run.**
   - Start `PostgreSqlContainer('postgres:18.6-alpine')`.
   - Run `runMigrations` from 1.5 into a database called `template_app`. This uses the real migrations, not a schema push.
   - Expose the admin connection URL to the tests with Vitest's `provide('pgAdminUrl', …)`. Tests read it with `inject`, and it's typed through a `ProvidedContext` declaration.
   - On teardown, stop the container.
2. **Per test file:** `useTestDb()` in `beforeAll` runs `CREATE DATABASE test_<random> TEMPLATE template_app STRATEGY FILE_COPY`.
   - This copies the migrated database in milliseconds. The file gets a real `DbHandle` (`createDb`) connected to its own database.
   - Test files can therefore run in parallel across Vitest workers without sharing data.
3. **Per test:** in `beforeEach`, the helper calls `resetDb()`. It runs `TRUNCATE … RESTART IDENTITY CASCADE` on every table in `public`, skipping the migrations table, which lives in the `drizzle` schema.
4. **After the file:** in `afterAll`, the pool is closed and the database is dropped.

```ts
// usage in any *.int.test.ts
const testDb = useTestDb();          // registers beforeAll/beforeEach/afterAll
it('...', async () => { await testDb.handle.db.insert(...) });
```

**Why not wrap each test in a transaction and roll it back?** Use cases will open their own transactions, for example in feedback submission (6.x). Nested transactions behave differently from production, so I'm using truncation instead.

### Files
```
apps/api/
  vitest.config.ts                 # projects: unit, integration
  test/
    global-setup.ts                # container + template DB + provide()
    test-db.ts                     # useTestDb(), resetDb()
    vitest-context.d.ts            # ProvidedContext typing for inject('pgAdminUrl')
  src/shared/db/db.int.test.ts     # the integration tests below
  tsconfig.json                    # include test/
```
The `test/` folder sits outside `src/` because it's test infrastructure, not app code.

### Colima / Docker notes
- Testcontainers reads `DOCKER_HOST`, which is already set to the Colima socket in your shell.
- On Colima, the Ryuk reaper may need `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`.
- If it does, I'll set it **inside `global-setup.ts`, and only when it isn't already set**, rather than asking you to export it.
- I'll document whatever I find in `README.md` under "Running tests".

### Integration tests (`db.int.test.ts`)
- **Migrations applied:** `citext` is installed and `drizzle.__drizzle_migrations` has one row.
- **`createDb().ping()`** resolves against the real DB.
- **`/health/ready`:** `createApp({ ping })` with the real ping returns 200.
- **`resetDb` empties tables:**
  - The test creates a scratch table, inserts a row, calls `resetDb()`, and the table is empty.
  - The scratch table is dropped afterwards.
  - A second test confirms the first test's data isn't visible.
- **Isolation:** two test files each see only their own database name (`select current_database()`).

### Out of scope
- **Seeding helpers and factories** (users, batches): they come with their tables (3.1+).
- **CI caching of the image:** 11.4.
- **Coverage thresholds.**

### Steps
1. Install packages (with the release-age check).
2. Add `vitest.config.ts` with the two projects, and update the scripts.
3. Write `global-setup.ts`, `test-db.ts` and the context typing. Add `test/` to the tsconfig.
4. Write the integration tests. Run them on Colima and fix any Ryuk or socket issues.
5. Confirm `test:unit` passes with Docker stopped. Leave Colima running afterwards.
6. Run `pnpm check`, update the README's test section, and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0, with both unit and integration tests run.
- No containers are left behind after the run (`docker ps -a` shows only the Compose Postgres).
- `pnpm test:unit` passes with Colima stopped.
