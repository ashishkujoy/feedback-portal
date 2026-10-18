# 3.4 Bootstrap admin — Plan

**Phase:** 3 — Identity (users, roles, login)
**Status:** Done

## Goal
A seed script creates the first admin from `BOOTSTRAP_ADMIN_EMAIL`

## Done when
- `pnpm db:seed` creates the first admin from `BOOTSTRAP_ADMIN_EMAIL`. Running it again changes nothing.
- In Compose, a one-shot `seed` service runs after `migrate` and before `api`.
- Integration tests cover every outcome.
- `pnpm check` passes.

## Plan

### Decision needed: when does the seed act?
The seed will run on every `docker compose up` and every deploy, so "idempotent" has to say what happens when the user already exists but has been changed since.

| Option | Behaviour | Trade-off |
|---|---|---|
| **A. Act only when there is no active admin** *(recommended)* | If any active admin exists, it does nothing. Otherwise it makes sure the bootstrap email belongs to an **active admin**: it creates the user, or grants `admin` and reactivates them. | It never undoes an admin's decision while admins exist. For example, if an admin deactivated the bootstrap person, the next deploy leaves them deactivated. It also works as a **break-glass** step: if every admin ends up inactive, re-running the seed restores access. |
| B. Create only if the email doesn't exist | Otherwise it does nothing | Simplest, but there's no way back if every admin is lost, short of editing the DB by hand. |
| C. Always enforce: active admin | Grants and reactivates on every run | Silently undoes deactivations and role changes on every deploy. |

The rest of the plan assumes **A**.

### Behaviour (option A)
| State | Outcome | Writes |
|---|---|---|
| `BOOTSTRAP_ADMIN_EMAIL` not set | `not_configured`. Logs it and exits 0, so Compose can always run the seed. | none |
| An active admin exists (whoever it is) | `admin_exists` | none |
| No active admin, and no user with that email | `created`: the domain's `createUser` with `roles: ['admin']` and `grantedBy: null` (a system grant) | user + role |
| No active admin, and the user exists | `restored`: `grantRole('admin', by: null)` and `reactivate`. Each of these is a no-op if not needed. | the changed fields |

- **The name** comes from `BOOTSTRAP_ADMIN_NAME` (optional). It defaults to the part of the email before `@`. The admin can rename themselves later (out of scope).
- **Concurrent runs** (two replicas starting at once) are serialised with a Postgres **transaction-level advisory lock**, taken before the check. The second run then sees `admin_exists`.
- **Logging:** the outcome and the user ID. Not the email, which is personal data and is already in the environment.

### Code
- **Use case** `modules/identity/application/bootstrap-admin.ts`:
  - `bootstrapAdmin({ users, newId, now }, { email, name })` returns the outcome.
  - It uses only the domain functions from 3.2 and the `UserRepository` port from 3.3.
- **CLI** `modules/identity/bootstrap-admin.cli.ts`:
  - Loads config and opens the DB.
  - Opens a transaction, takes the advisory lock, and builds `createUserRepository(tx)`.
  - Runs the use case, logs the outcome, and exits with 0 or 1. It's shaped like `migrate.cli.ts`.
- **The advisory lock** is a small helper, `shared/db/advisory-lock.ts`: `lockForTransaction(tx, key)`. The key is a fixed constant for this seed.
- **Config:** a new optional `BOOTSTRAP_ADMIN_EMAIL`, checked with `z.email()`, and an optional `BOOTSTRAP_ADMIN_NAME`. They're exposed as `config.bootstrapAdmin: { email, name } | null`. The API server ignores them.
- **Scripts:** `pnpm db:seed`, plus a root alias like `db:migrate`.
- **Compose:**
  - A `seed` service using the same image (`x-api-image`) that runs `node src/modules/identity/bootstrap-admin.cli.ts` and depends on `migrate` completing successfully.
  - `api` now depends on `seed` completing.
  - The value comes from `apps/api/.env`.
- **Docs:** `.env.example`, README (first-time setup: set the email, then sign in with that Google account), and DATA_MODEL (the meaning of the system grant).

### Tests
- **Integration (use case + real repository + real lock, against Testcontainers):**
  - Each row of the behaviour table, asserted on the DB afterwards.
  - Running it twice gives `created`, then `admin_exists`, and there's still only one user.
  - The email is normalised (`  Admin@Example.COM ` ends up stored lower-case), and the default name is derived from the email.
  - An inactive admin plus an existing non-admin user gives `restored`. The existing user keeps their other roles, and their original grants are unchanged.
  - Two runs started at once both finish, with exactly one `created`.
- **Unit:** the config parsing (unset, invalid email, name default), and the CLI's exit codes are covered through the use case's outcomes.

### Out of scope
- **Signing in as that admin:** 3.6. Until then, the seeded user exists but can't log in.
- **Renaming users:** not in the roadmap yet.
- **Seeding sample data** (batches, interns): later phases, if ever.

### Steps
1. Config, `.env.example` and the advisory-lock helper.
2. The use case and its integration tests.
3. The CLI, the scripts and the Compose `seed` service.
4. Check it by hand on Compose: `up` creates the admin; `up` again gives `admin_exists`; deactivate the admin in psql, then `up` gives `restored`.
5. Docs. Run `pnpm check`. Write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- `docker compose up -d --build --wait` twice shows `created`, then `admin_exists`, in `docker compose logs seed`.
