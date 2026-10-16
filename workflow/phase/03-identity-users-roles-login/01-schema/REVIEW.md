# 3.1 Schema — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/identity/infrastructure/schema.ts` | **New**, the first `modules/` folder. Contains the `role` pgEnum (from contracts `roles`) and the `users`, `user_roles` and `sessions` tables as planned. Keys are camelCase, mapped to snake_case columns. |
| `apps/api/drizzle/0001_identity.sql` + `meta/0001_snapshot.json`, `_journal.json` | **Generated** by `pnpm db:generate --name identity`. Read and checked against the plan. |
| `apps/api/src/shared/ids.ts` (+ test) | `newId()` returns a UUID v7, using `uuid@14.0.3` (zero dependencies, more than 1 day old) |
| `apps/api/src/shared/db/client.ts` | `drizzle({ client, casing: 'snake_case' })` (see decisions) |
| `packages/contracts/src/role.ts`, `index.ts` | Export `roles`, the `as const` tuple that `Role` is built from |
| `apps/api/src/shared/db/db.int.test.ts` | The migration count comes from `drizzle/meta/_journal.json` instead of a hard-coded `1` |
| `apps/api/src/modules/identity/infrastructure/schema.int.test.ts` | **New**, 12 integration tests |
| `DATA_MODEL.md` | ID convention (app `newId()` plus DB default `uuidv7()`), `email` citext, `granted_by` nullable, sessions indexes |

## How to verify
```sh
pnpm check                                    # 45 contracts + 102 api tests
pnpm db:migrate && pnpm db:migrate            # second run is a no-op
pnpm --filter @feedback-portal/api exec drizzle-kit generate   # "No schema changes"
docker compose exec postgres psql -U feedback -d feedback_portal -c '\d users'
```

| Check | Result |
|---|---|
| `pnpm check` | exit 0: 45 contracts tests; 102 api tests (82 unit + 20 integration) |
| `pnpm db:migrate` ×2 on Compose Postgres | Both succeed. `drizzle.__drizzle_migrations` has 2 rows (baseline + identity). |
| `drizzle-kit generate` afterwards | "No schema changes, nothing to migrate", so schema and migration agree |
| `\d users` | `id uuid default uuidv7()`, `email citext not null`, `is_active default true`, `created_at`/`updated_at default now()`. Constraints `users_email_unique` and `users_google_sub_unique`. Referenced by the 3 FKs below. |
| `\d user_roles` | PK (`user_id`, `role`). FK `user_id` with cascade on delete. FK `granted_by` is nullable, with no action on delete. |
| `\d sessions` | `id text` PK. FK `user_id` with cascade on delete. Indexes on `user_id` and `expires_at`. |
| `\dT role` | `admin`, `mentor`, `program_manager` |

### Integration tests (each file gets its own migrated database)
- **users:**
  - The defaults fill `id` (UUID v7), `is_active = true`, `google_sub = null` and both timestamps. An app-supplied `newId()` is kept.
  - An email that differs only in case is rejected (`23505`), and lookup by email ignores case.
  - A duplicate `google_sub` is rejected. Several users without one are fine.
  - `updated_at` is set on update. The test backdates the row first, so it doesn't depend on the DB container's clock matching the app's.
- **user_roles:**
  - A user can hold mentor and program_manager together, and `granted_by = null` (a system grant) works.
  - The same role twice is rejected (`23505`), as is a value outside the enum (`22P02`) and a grant by an unknown user (`23503`).
- **sessions:** a session for an unknown user is rejected (`23503`). Deleting a user removes their roles and sessions.

## Decisions & trade-offs
- **IDs: option A, as agreed.** The app uses `newId()` (v7), and the column also defaults to `uuidv7()`.
- **`casing: 'snake_case'` on the runtime client.** `drizzle.config.ts` already had it for generating migrations. The client needs the same setting, or queries would use camelCase column names (`"googleSub"`). The tests prove the two agree, because inserts and selects go through the client.
- **A `roles` tuple in contracts.** `pgEnum` needs a non-empty literal tuple, and Zod's `Role.options` is typed as a plain array. Exporting the `as const` tuple that `Role` is built from avoids an unsafe cast, and keeps contracts the single source of the values. The other enums (`color_code`, `intern_status`, …) will follow the same pattern when their tables arrive.
- **An explicit name for the `google_sub` unique constraint.** Drizzle names constraints after the TS key, which produced `users_googleSub_unique`. I set `users_google_sub_unique` before committing the migration, so the name never ships.
- **`updated_at` via Drizzle's `$onUpdate`, not a DB trigger.** All writes go through repositories (3.3). Updates made by hand in psql won't touch it, which is acceptable.
- **`granted_by` has no `on delete` rule** (it's no action). Users are never deleted, and a granter can't be deleted while their grants exist.

## Deviations from plan
- **Added:** the `roles` export in contracts and the `casing` option on the client, both explained above.
- **Changed:** the migration count in `db.int.test.ts` now comes from the journal, so the tests don't need editing for every new migration.
- Nothing else.

## Observations
- Hand-edited migrations aren't detected yet. A CI step that runs `drizzle-kit generate` and fails on a diff belongs in 11.x (CI). For now, the "No schema changes" check is part of each schema task's verification.
