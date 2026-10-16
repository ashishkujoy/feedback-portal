# 3.3 User repository — Plan

**Phase:** 3 — Identity (users, roles, login)
**Status:** Done

## Goal
Drizzle adapter behind a port

## Done when
- `modules/identity/application/user-repository.ts` defines the `UserRepository` **port**, using only domain types.
- `modules/identity/infrastructure/drizzle-user-repository.ts` implements it with Drizzle. It saves and loads the whole `User` aggregate, including its role grants.
- Integration tests (Testcontainers) cover every method, including the round trip and the error cases.
- `pnpm check` passes.

## Plan

### The port (`application/user-repository.ts`)
These are the methods the next tasks need, and nothing more:

```ts
type UserRepository = Readonly<{
  findById: (id: UserId) => Promise<User | null>;            // 3.7 session → current user
  findByEmail: (email: Email) => Promise<User | null>;       // 3.4 seed, 3.6 Google callback
  list: () => Promise<readonly User[]>;                      // 3.8 admin list, ordered by name
  save: (user: User) => Promise<void>;                       // create or update, roles included
  countActiveAdmins: () => Promise<number>;                  // 3.8 "at least one active admin"
}>;
```
- No `findByGoogleSub`. 3.6 looks users up by their Google email (only pre-added users can sign in), and the domain's `signIn` checks `googleSub`.
- No `delete`. Users are never deleted.

### The adapter (`infrastructure/drizzle-user-repository.ts`)
`createUserRepository(db)` returns the port.

- **`db` can be the pool or a transaction.** The parameter is typed as Drizzle's shared base type, so 3.8 can run a check and a save atomically with `db.transaction(tx => … createUserRepository(tx) …)`. The repository never opens its own outer transaction.
- **`save` is an upsert of the aggregate**, in one transaction (a savepoint if it's already inside one):
  1. `insert … on conflict (id) do update` on `users`. `updatedAt` comes from the domain (`now`), not from `$onUpdate`.
  2. Sync `user_roles`: delete the grants that are no longer held, and insert the new ones (`on conflict do nothing`). Existing grants keep their original `granted_by` and `granted_at`.
- **Loading:** one query for the users, then one `where user_id in (…)` query for their grants, grouped in memory. `list()` therefore makes 2 queries for any number of users, not N+1. I use the core query builder, not Drizzle's relational API, so `Database` stays untyped. (This was left open in 3.1.)
- **Row → `User`:** `email` and `id` go through the `Email` and `UserId` schemas, so values loaded from the DB get the same brands without unsafe casts. A row that doesn't parse throws, because it would be a bug or a hand-edited row, and it surfaces as a 500.
- **`countActiveAdmins`:** counts users who are active and hold `admin`.

### Errors
| Case | Result |
|---|---|
| `save` with an email another user already has (`users_email_unique`, 23505) | `conflict`, code **`email_taken`** (new `ErrorCode`). 3.8's "create user" needs this, and the DB is the only place that can check it without a race. |
| Any other DB error (for example a duplicate `google_sub`) | Passed through unchanged, so it becomes a 500. Two users linking the same Google account would be a bug, not a user error. |
| `findById` / `findByEmail` with no match | `null`. Turning that into 404 or "sign-in failed" is for the use case. |

### Files
```
apps/api/src/modules/identity/
  application/user-repository.ts                       # port (types only)
  infrastructure/drizzle-user-repository.ts            # adapter
  infrastructure/drizzle-user-repository.int.test.ts
apps/api/src/shared/db/client.ts                       # export a `DbExecutor` type (pool or transaction)
apps/api/src/shared/db/pg-error.ts (+ test)            # `isUniqueViolation(error, constraint)`, reading Drizzle's `cause`
packages/contracts/src/problem.ts (+ test)             # `email_taken`
```
`schema.int.test.ts` has its own `sqlState` helper. It will use the shared `pg-error.ts` instead.

### Integration tests (each file gets its own migrated database)
- **Round trip:** a `createUser` result is saved, then `findById` returns an equal `User`: brands, dates, roles, and `grantedBy` null or set.
- **`findByEmail`** matches regardless of case (`A.Person@Example.com` finds `a.person@example.com`), and returns `null` for an unknown email. `findById` returns `null` for an unknown ID.
- **Updating:** `signIn` → `save` → reload shows `googleSub`, `lastLoginAt` and `updatedAt`. A deactivated user reloads as inactive.
- **Role sync:** granting a role and then saving adds a row. Revoking and saving removes it. A grant that already existed keeps its original `grantedBy` and `grantedAt` through later saves.
- **`save` is idempotent:** saving the same `User` twice changes nothing.
- **`email_taken`:** a second user with the same email (in a different case) is rejected with `conflict` / `email_taken`, and nothing is written. Its roles aren't inserted.
- **`list`:** sorted by name, with each user's own roles, using 2 queries.
- **`countActiveAdmins`:** counts only users who are both active and admins. Inactive admins and active non-admins don't count.
- **Transactions:** a repository built on `tx` sees its own writes, and a rolled-back transaction leaves nothing behind. This proves 3.8 can use it inside a transaction.

### Out of scope
- **Use cases**, and wiring this into `main.ts`: 3.4, 3.6 and 3.8, when a use case needs it.
- **Sessions storage:** 3.5.
- **Optimistic locking.** Two admins editing the same user at the same moment: the last write wins. That's acceptable for a small admin team. It can be added later by checking `updated_at`.
- **Pagination and filters for `list`.** The user count is small, about one programme's staff. The cohort tasks (5.x) may add filtering by role.

### Steps
1. Add the `email_taken` code, `pg-error.ts` and the `DbExecutor` type, with tests.
2. Write the port.
3. Write the adapter and its integration tests, method by method.
4. Switch `schema.int.test.ts` to the shared helper.
5. Run `pnpm check`. Write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- `grep` shows that `application/` imports nothing from `infrastructure/` or Drizzle.
