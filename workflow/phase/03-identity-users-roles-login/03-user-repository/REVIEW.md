# 3.3 User repository — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/identity/application/user-repository.ts` | **New.** The `UserRepository` port: `findById`, `findByEmail`, `list`, `save`, `countActiveAdmins`. It uses domain types only. |
| `apps/api/src/modules/identity/infrastructure/drizzle-user-repository.ts` | **New.** `createUserRepository(db)`, which takes the pool or a transaction. `save` does an upsert on `id` plus a role sync inside its own transaction (a savepoint when nested). Loading takes 2 queries. Rows are parsed into the `Email` and `UserId` brands. |
| `apps/api/src/modules/identity/infrastructure/drizzle-user-repository.int.test.ts` | **New**, 17 integration tests |
| `apps/api/src/shared/db/pg-error.ts` (+ test) | **New.** `pgErrorOf` reads the SQLSTATE and constraint, whether or not Drizzle has wrapped the error. Also `isUniqueViolation(error, constraint)` and `pgErrorCodes`. |
| `apps/api/src/shared/db/client.ts` | `DbExecutor` type (`PgDatabase<NodePgQueryResultHKT>`, covering the pool and transactions). The comment now records the decision: the core query builder, no relational schema. |
| `apps/api/src/modules/identity/infrastructure/schema.int.test.ts` | Uses `pgErrorOf` / `pgErrorCodes` instead of its own helper |
| `packages/contracts/src/problem.ts` (+ test) | `ErrorCode` gains `email_taken` |

## How to verify
```sh
pnpm check                                                        # 45 contracts + 159 api tests
grep -rnE "drizzle|infrastructure" apps/api/src/modules/identity/{application,domain}/   # no output
```

| Check | Result |
|---|---|
| `pnpm check` | exit 0: 45 contracts tests; 159 api tests (122 unit + 37 integration), up from 136 |
| Layering | `application/` and `domain/` import nothing from Drizzle or `infrastructure/` |

### Integration tests (Testcontainers; each file gets its own migrated database)
- **Round trip:** an admin with a system grant, and a mentor + PM granted by that admin, both reload `toEqual` the domain objects: brands, dates and grants.
- **Finding:** `findByEmail` finds the user, and the citext column matches a mixed-case value. An unknown ID or email gives `null`.
- **Updates:**
  - `signIn` → save → reload shows `googleSub`, `lastLoginAt` and `updatedAt`.
  - Deactivation persists.
  - Grant → save, then revoke → save, each reloads exactly.
  - An existing grant keeps its original `grantedBy`/`grantedAt`, even when a later save passes different details.
  - Saving twice changes nothing.
- **`email_taken`:**
  - A new user whose email differs only in case is rejected, and neither the user nor their roles are written.
  - Changing an email to one another user has is rejected, and the stored email is unchanged.
  - A duplicate `google_sub` is passed through as a plain error (a 500), not an `AppError`.
- **`list`:** ordered by name, each user with their own roles. An empty list works. **4 users load with exactly 2 queries**, counted with a Drizzle query logger.
- **`countActiveAdmins`:** counts 2 out of active admins, an inactive admin and an active non-admin. It's 0 with no users.
- **Transactions:** a repository built on `tx` sees its own write and count. After the rollback, neither the user nor their roles remain.
- **Unit (`pg-error`, 6 tests):** wrapped and unwrapped driver errors; plain errors, Node's `ECONNREFUSED` and non-errors are ignored; only the named constraint matches.

## Decisions & trade-offs
- **Role order on reload is grant time, then the role enum's order** (admin, mentor, program_manager). The domain keeps insertion order. The two differ only when roles granted at the same moment were passed in a different order. Callers should compare roles as sets (`roleSet`), and the domain already offers that.
- **Existing grants are never rewritten.** `on conflict do nothing` means a grant's `granted_by`/`granted_at` record who first granted it, even if the domain object were to say otherwise.
- **The upsert writes every column explicitly, `updatedAt` included.** The domain's `now` wins over the schema's `$onUpdate`, so tests and audits see one consistent time.
- **`pgErrorOf` only accepts 5-character SQLSTATE codes**, so Node system errors such as `ECONNREFUSED` aren't mistaken for constraint violations.

## Deviations from plan
- **Added:** `pgErrorCodes` and `pgErrorOf` are exported along with `isUniqueViolation`, so `schema.int.test.ts` could drop its copy. Also a query-count test for `list`. The plan had promised "2 queries" without a test proving it.
- Nothing else.

## Observations
- **Concurrent "last admin" changes** (two admins deactivating each other at the same moment) need more than a transaction at the default isolation level. 3.8 should lock the admin rows (`select … for update`) or use `serializable` for those use cases. The `DbExecutor` design leaves room for either.
