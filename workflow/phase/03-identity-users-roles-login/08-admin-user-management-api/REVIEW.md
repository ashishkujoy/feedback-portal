# 3.8 Admin user management API — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/identity/http/users.routes.ts` | **New.** Mounted at `/users`, behind `authenticate` and `requireRole('admin')`: `GET /`, `POST /` (201 + `Location`), `PUT /:id/roles`, `POST /:id/deactivate`, `POST /:id/reactivate`. Each change is logged at info with the actor's ID, the target's ID and the roles. Never the email. |
| `apps/api/src/modules/identity/application/manage-users.ts` | **New.** The use cases `listUsers`, `addUser`, `setUserRoles`, `deactivateUser` and `reactivateUser`. Each change runs in one `UserAdminTransaction`. An unknown user gives 404. Unchanged results are not saved. When an active admin stops being one, `ensureAnAdminRemains(countActiveAdmins())` runs inside the transaction. Deactivating also calls `revokeAllForUser`. |
| `apps/api/src/modules/identity/application/user-admin.ts` | **New.** The port: `UserAdminTransaction = <T>(work: ({ users, sessions }) => Promise<T>) => Promise<T>` |
| `apps/api/src/modules/identity/infrastructure/drizzle-user-admin.ts` | **New.** `db.transaction`, then `lockForTransaction(tx, 'feedback-portal:user-admin')`, then the repositories bound to `tx` |
| `apps/api/src/modules/identity/domain/user.ts` (+ test) | **+ `setRoles(user, roles, { by, now })`.** It grants first and then revokes, through `grantRole` and `revokeRole`, so kept grants keep their history and an empty set gives `user_requires_role`. It refuses to remove your own `admin` (`cannot_remove_own_admin`). `ensureAnAdminRemains` now uses the code `last_admin`. |
| `apps/api/src/modules/identity/http/user-views.ts` | **New.** `toMeResponse` (moved out of `me.routes.ts`) and `toAdminUser` share the role ordering |
| `packages/contracts/src/admin-user.ts` (+ test), `problem.ts` | **New:** `AdminUser`, `CreateUserRequest` (the same limits and messages as the domain) and `SetRolesRequest`. **+ the error codes** `cannot_remove_own_admin` and `last_admin`. |
| `apps/api/src/app.ts`, `main.ts` | `AppDeps` gains `userAdmin`, wired with the Drizzle version |
| `apps/api/test/app-deps.ts` | **+ `realApp(db, { secureCookies, googleAuth })`:** the full app on real repositories, with a clock the test moves. `signInAs` takes `name` and uses the app's clock. `me-and-logout.int.test.ts` now uses `realApp` too. |
| `apps/api/src/modules/identity/http/users.routes.int.test.ts` | **New.** 30 route tests |
| `README.md`, `DATA_MODEL.md` | "API endpoints (identity)" lists `/users`. `is_active`: deactivation deletes sessions, and one active admin always remains. |

## How to verify
```sh
pnpm check   # 52 contracts + 293 api tests
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 52 contracts tests (+5). 293 API tests: 171 unit and 122 integration, up from 257. |
| Access | All 5 routes: signed out gives **401**; a mentor or PM gives **403** "Requires one of: admin" |
| `GET /users` | Ordered by name, inactive users included, and every item parses as `AdminUser` |
| `POST /users` | **201** with `Location`. The email is normalised, the name trimmed, and `grantedBy` is the admin. **The added user then signs in through the Google callback** (fake Google), and their `googleSub` is linked. A duplicate email in a different case gives 409 `email_taken`, and nothing is added. Bad input gives 400 with issues for `email`, `name` and `roles.0`. |
| `PUT /users/:id/roles` | Adds and removes in one call, and the kept grant keeps its original `grantedAt`. The same set writes nothing (the stored user is unchanged). An empty list, an unknown role or a missing list gives 400. An unknown user gives 404, and a malformed ID gives 400 on `id`. Your own `admin` gives 409 `cannot_remove_own_admin`, even when another admin exists. Another admin's `admin` can be removed. |
| Deactivate / reactivate | Deactivating deletes **all** of the user's sessions (2 of 2), and their cookie then gets 401 on `/me`. Repeating it gives 200 and writes nothing. Deactivating yourself gives 409 `cannot_deactivate_self`. Reactivating works. An unknown ID gives 404. |
| **The race** | Admins A and B deactivate each other, or remove `admin` from each other, while an outside connection holds the lock. The test waits until **both** transactions are queued on it, then releases it. The result is one 200, one 409 `last_admin`, and **1** active admin. |
| Tests catch the bug | **Without the last-admin check:** both race tests fail with `outcomes: ['200','200']` and `activeAdmins: 0`. **Without the lock:** both fail, because the two changes are never queued together. All restored and green afterwards. |
| By hand, Compose (production mode) | As a seeded admin, I created a user (201; duplicate 409), listed users, changed roles, and deactivated a mentor (their session row went from 1 to 0, and their cookie then got 401). I reactivated them. Deactivating myself gave 409 `cannot_deactivate_self`, and removing my own `admin` gave 409 `cannot_remove_own_admin`. As a mentor, `/users` gave 403. The `api.users` log lines carry IDs and roles, no email. I deleted the test users afterwards. |

## Decisions & trade-offs
- **Decisions taken (A and A):** roles are replaced as a set with `PUT /users/:id/roles`, and an admin can't remove their own `admin`.
- **A single request can't break the last-admin rule.** The actor is an active admin and can't remove themselves, so the rule only matters in a race. That's why its tests are race tests.
- **One lock for every user-management change.** These writes are rare, so running them one at a time costs nothing noticeable. Without the lock, a concurrent roles change also failed once with a **500 from the `user_roles` insert** (most likely a deadlock between the two transactions; I didn't look further). The lock rules that out too.
- **Deactivation and sign-out are atomic.** Revoking the sessions happens in the same transaction as the change, so a failed deactivation leaves the sessions alone, and vice versa.
- **The bootstrap seed has its own lock.** Its "restore an admin" only acts when no active admin exists, so it can't conflict with the "keep one admin" rule.

## Deviations from plan
- **No separate unit test with a fake repository for the last-admin check.** The race tests already fail when the check is removed (shown above), which proves the same thing through the real stack.
- **`realApp` test helper.** It's added so the `/me`, logout and `/users` tests share one wiring. It also takes a fake Google, used by the "added user can sign in" test.
- **`signInAs` uses the app's clock.** It used `new Date()`, so with a moved clock a new grant looked older than the user. The test caught it.

## Not done / follow-ups
- **Phase 5:** the "Batches" column; what happens to an inactive mentor's batch assignments; and refusing to revoke `mentor` or `program_manager` while the user is assigned in that capacity.
- **Phase 4:** the Users and roles screen needs a multi-select for roles (design decision 3) and the "Add user" copy (decision 5).
