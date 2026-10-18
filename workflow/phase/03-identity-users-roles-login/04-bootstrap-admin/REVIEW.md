# 3.4 Bootstrap admin — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/identity/application/bootstrap-admin.ts` | **New.** The `bootstrapAdmin` use case (option A). If an active admin exists, the result is `admin_exists`. Otherwise it's `created` (via `createUser` with a system grant) or `restored` (via `grantRole` + `reactivate`). It uses only the 3.2 domain functions and the 3.3 port. |
| `apps/api/src/modules/identity/infrastructure/run-bootstrap-admin.ts` | **New.** Runs the use case in one transaction under an advisory lock (`bootstrapAdminLock`), with a repository built on that transaction |
| `apps/api/src/modules/identity/bootstrap-admin.cli.ts` | **New.** `pnpm db:seed`. Logs `not_configured` (exit 0) when the variable isn't set. Logs the outcome and user ID, never the email. Exits 1 on failure. |
| `apps/api/src/shared/db/advisory-lock.ts` | **New.** `lockForTransaction(tx, name)` runs `pg_advisory_xact_lock(hashtextextended(name, 0))` |
| `apps/api/src/modules/identity/domain/user-id.ts` | `newUserId()` |
| `apps/api/src/shared/config/config.ts` (+ test) | Optional `BOOTSTRAP_ADMIN_EMAIL` (an email) and `BOOTSTRAP_ADMIN_NAME` (at most 200 characters), exposed as `config.bootstrapAdmin: { email, name } \| null` |
| `apps/api/package.json`, root `package.json` | `db:seed` scripts |
| `docker-compose.yml` | A one-shot `seed` service, run after `migrate` succeeds. `api` now depends on `seed`. |
| `apps/api/.env.example`, `README.md`, `DATA_MODEL.md` | The variables (commented out); a "The first admin" section; the meaning of `granted_by NULL` |
| `apps/api/src/modules/identity/infrastructure/run-bootstrap-admin.int.test.ts` | **New**, 8 integration tests |

## How to verify
```sh
pnpm check                                   # 45 contracts + 170 api tests
docker compose up -d --build --wait          # seed logs not_configured unless the email is in apps/api/.env
docker compose run --rm --no-deps -e BOOTSTRAP_ADMIN_EMAIL=you@example.com seed
```

| Check | Result |
|---|---|
| `pnpm check` | exit 0: 45 contracts tests; 170 api tests (125 unit + 45 integration), up from 159 |
| `docker compose up -d --build --wait` | postgres, otel-lgtm → migrate → **seed** (`not_configured`, exit 0) → api (healthy) |
| Compose, by hand, with `BOOTSTRAP_ADMIN_EMAIL=Seed.Check@Example.com` | Run 1 `created`. Run 2 `admin_exists`. After deactivating the user in psql, run 3 `restored`. Run 4 `admin_exists`. The DB has one row: `seed.check@example.com`, name `seed.check`, active, `admin`, `granted_by` NULL. |
| Invalid email (`nope`) | The config error names `BOOTSTRAP_ADMIN_EMAIL`, without the value. Exit 1. |
| Cleanup | I deleted the test user from the Compose DB afterwards, so it has no users, as before. |

### Integration tests (Testcontainers)
- **Creates:** an active admin with a system grant, named from the email (`admin`), with `createdAt` = `now`.
- **Idempotent:** a second run gives `admin_exists`, and `list()` is unchanged.
- **Normalises** `  Admin@Example.COM ` and uses the configured name.
- **Another active admin exists:** the result is `admin_exists`. The bootstrap user isn't created, and a deactivated bootstrap user stays deactivated.
- **Restores:** an inactive PM with the bootstrap email, plus an inactive admin, gives `restored`. The user is active, their PM grant is unchanged, `admin` is added as a system grant, and the active admin count is 1.
- **Invalid email:** `validation_failed`, and nothing is written.
- **Concurrency:** a separate connection holds the seed's lock while two runs start. After 300 ms there are **still 0 users** (both are waiting). After the release, the outcomes are exactly `created` + `admin_exists`.
  - I proved the test detects a missing lock: with the lock call removed, it **fails** (1 user was written while the lock was held). With the lock, it passes.

## Decisions & trade-offs
- **Option A, as agreed:** the seed acts only when no active admin exists.
- **Locking and the transaction live in `run-bootstrap-admin.ts`, not the CLI**, so the integration tests exercise the real lock rather than a copy of it.
- **The name is derived from the email in the use case**, after normalisation, so `Seed.Check@…` becomes `seed.check`, not `Seed.Check`.
- **`not_configured` is decided in the CLI.** The use case always receives an email.
- **The log message quotes the outcome** (`bootstrap admin: "created"`). That's LogTape's stdout rendering, noted in 2.1. The `outcome` property is also there for filtering.

## Deviations from plan
- **The concurrency test** holds the lock from outside instead of simply starting runs at the same moment. My first version, with three runs in `Promise.all`, **also passed with the lock removed**, so it proved nothing. Holding the lock makes the overlap deterministic.
- **Added:** `newUserId()` in `user-id.ts`, and the exported `bootstrapAdminLock` (for that test).
- Nothing else.
