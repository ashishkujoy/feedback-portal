# 3.8 Admin user management API — Plan

**Phase:** 3 — Identity (users, roles, login)
**Status:** Done

## Goal
List, create, deactivate, and reactivate users, and grant or revoke roles

## Done when
- An admin can list and create users, deactivate and reactivate them, and change their roles. Every other user gets **403**, and a signed-out request gets **401**.
- **There is always at least one active admin**, even when two admins act at the same moment.
- Deactivating a user **signs them out everywhere**.
- API tests (Testcontainers) cover each route, each rule and the 403/401 cases.
- `pnpm check` passes.

## Plan

### Routes (all behind `authenticate` + `requireRole('admin')`, mounted at `/users`)
| Route | Body | Success | Errors |
|---|---|---|---|
| `GET /users` | | 200 `AdminUser[]`, ordered by name. **Inactive users are included**, with `isActive: false`. The web app filters. | |
| `POST /users` | `{ email, name, roles }` | **201** `AdminUser`, with a `Location: /users/:id` header. No email is sent (design decision 5). | 400 `validation_failed` (field issues), 409 **`email_taken`** |
| `PUT /users/:id/roles` | `{ roles }` | 200 `AdminUser` | 400 (empty list or unknown role), 404, 409 `last_admin` |
| `POST /users/:id/deactivate` | | 200 `AdminUser` | 404, 409 `cannot_deactivate_self`, 409 `last_admin` |
| `POST /users/:id/reactivate` | | 200 `AdminUser` | 404 |

- **The actions are idempotent.** Deactivating an inactive user, reactivating an active one, or setting the roles a user already has returns 200 and writes nothing.
- **A malformed `:id`** gives 400 `validation_failed`. An unknown ID gives 404 `not_found`.
- **The writes are JSON or bodyless POSTs.** Bodyless POSTs are covered by 3.7's `csrf()` check.

### Decision needed (1): how roles are changed
| Option | Shape | Notes |
|---|---|---|
| **A. Replace the set: `PUT /users/:id/roles { roles: [...] }`** *(recommended)* | One call per edit | Matches the multi-select that design decision 3 asks for. The use case works out which roles to grant and revoke, using `grantRole` and `revokeRole` from 3.2, so roles that are kept **keep their original `grantedBy` and `grantedAt`**. An empty list is a 400. |
| B. One role at a time: `POST` and `DELETE /users/:id/roles/:role` | One call per checkbox | Finer-grained, but a multi-select save becomes several calls, which can half-succeed. |

### Decision needed (2): can an admin remove their own `admin` role?
| Option | Behaviour |
|---|---|
| **A. No: 409 `cannot_remove_own_admin`** *(recommended)* | This matches the existing "you cannot deactivate yourself" rule. An admin can't demote themselves by mistake and lose the screen they're on. Another admin can still do it. |
| B. Yes, as long as another active admin remains | The last-admin rule still holds, but someone can lock themselves out of admin with one click. |

The rest of the plan assumes **A** for both.

### The "at least one active admin" rule
- **It applies to** deactivating an active admin and taking `admin` out of an active admin's roles.
- **A single request can't break it.** The actor is an active admin and can't deactivate themselves or drop their own `admin` (decision 2), so after any one change at least the actor remains. The rule guards the **race**: two admins acting on each other at once, or an actor whose own deactivation commits while their request is in flight.
- The use case changes the user, saves it, then calls `countActiveAdmins()` **inside the same transaction**. If the count is 0, `ensureAnAdminRemains` (3.2) throws, and the transaction rolls back.
  - The response is 409 with the new code **`last_admin`**. It currently has no code; this gives the web app something to switch on.
- **Concurrency.** Without care, admins A and B could deactivate each other at the same moment: each transaction would still see the other's admin and commit, leaving none. To prevent that, **every user-management write takes one transaction-level advisory lock** (`lockForTransaction` from 3.4), so the writes run one at a time.
  - Admin writes are rare, so serialising them costs nothing noticeable.
  - A test proves the lock is needed (see Tests). It uses the same approach as 3.4's seed test.

### Deactivation
- Uses the domain's `deactivate` (which refuses yourself), then `sessions.revokeAllForUser`, in the **same transaction**. The user's open tabs get 401 on their next request.
- **Reactivating** doesn't restore sessions: the user signs in again.
- **Batch assignments** are left alone for now. Batches arrive in phase 5, which decides what happens to an inactive mentor's assignments. Phase 5 also adds "you can't revoke `mentor` while they're assigned as a mentor".

### Code
```
packages/contracts/src/
  admin-user.ts (+ test)   # AdminUser, CreateUserRequest, SetRolesRequest
  problem.ts               # + last_admin, cannot_remove_own_admin
apps/api/src/modules/identity/
  application/user-admin.ts            # port: UserAdminTransaction = <T>(work: ({ users, sessions }) => Promise<T>) => Promise<T>
  application/manage-users.ts          # listUsers, addUser, setRoles, deactivateUser, reactivateUser
  infrastructure/drizzle-user-admin.ts # db.transaction + lockForTransaction + repos bound to tx
  http/users.routes.ts                 # the routes above
apps/api/src/modules/identity/domain/user.ts  # + the own-admin rule (`setRoles`, see below)
```
- **A new domain function, `setRoles(user, roles, { by, now })`.**
  - It grants the missing roles and revokes the extra ones through `grantRole` and `revokeRole`, so the existing rules apply.
  - It refuses to remove `admin` when `by === user.id`.
  - It returns the same object when nothing changes.
- **The use cases take the acting admin's ID** (`c.var.currentUser.id`) for `grantedBy`, the self-checks and the logs.
- **The transaction port** keeps `application/` free of Drizzle. Each use case runs inside one `UserAdminTransaction`. `main.ts` wires the Drizzle version, and tests use the real one.
- **`AdminUser` (response):** `{ id, email, name, avatarUrl, isActive, roles, lastLoginAt, createdAt }`.
  - Dates are ISO strings.
  - Roles are in the order of the `roles` tuple, as in `/me`.
  - Grant details stay internal; nothing in the design shows them.
- **`CreateUserRequest`** uses the same limits as the domain (email of at most 254 characters, name 1–200 characters after trimming, at least 1 role), so the web form can validate with it in phase 4. The domain still checks everything.
- **Logging:** info lines such as `user created`, `user deactivated` and `user roles changed`. Each carries the actor's ID, the target's ID and the roles. Never the email.

### Tests
- **Route tests** (`users.routes.int.test.ts`, using `signInAs` from 3.7):
  - **Access:** signed out gives 401; a mentor or PM gives 403 on every route; an admin passes.
  - **List:** includes an inactive user; ordered by name; the body parses as `AdminUser[]`.
  - **Create:**
    - 201, a `Location` header, and the user is stored with normalised email and `grantedBy` set to the admin.
    - The new user can then sign in through 3.6's Google flow, which proves end to end that "added users can sign in".
    - A duplicate email in a different case gives 409 `email_taken`.
    - Bad input gives 400 with field issues for `email`, `name` and `roles`.
  - **Roles:**
    - Add and remove roles in one call; kept grants keep their original `grantedAt`.
    - Setting the same roles writes nothing (`updatedAt` doesn't change).
    - An empty list gives 400; an unknown user gives 404.
    - Removing your own `admin` gives 409 `cannot_remove_own_admin`.
  - **Deactivate:**
    - 200, `isActive: false`, **all of their sessions are gone**, and their cookie now gets 401 on `/me`.
    - Deactivating yourself gives 409 `cannot_deactivate_self`. Doing it twice gives 200 both times.
  - **Reactivate:** 200, and the user can sign in again.
  - **Last admin** (the rule only bites in a race; see below):
    - **Admins A and B deactivate each other at the same moment**, with an outside connection holding the lock until both requests are waiting. Exactly one succeeds; the other gets 409 `last_admin`; one active admin remains.
    - The same race with "remove `admin` from each other".
    - Each test **fails without the lock** (checked by removing it once).
    - The use case's own check is unit-tested too: a fake repository that reports 0 active admins after the change gives `last_admin` and nothing is saved.
- **Unit:** `setRoles` (grant and revoke at once, a no-op, the own-admin rule, an empty list); the contracts schemas.

### Docs
- **README:** add the `/users` routes to "Auth endpoints", renamed "API endpoints (identity)".
- **DATA_MODEL:** note on `users.is_active` that deactivation also ends the user's sessions, and that the last active admin can't be removed.

### Out of scope
- **Editing a user's name or email:** not in the roadmap. Add later if needed.
- **The "Batches" column on the Users and roles screen:** it needs `batch_members` (phase 5).
- **Pagination and search:** the user list is small; the design's search filters on the client.
- **An audit log of user changes:** the logs record each change with the actor. A table can come later if one is needed.

### Steps
1. Contracts: `AdminUser`, the request schemas, and the two new error codes.
2. Domain: `setRoles` and the own-admin rule, with unit tests.
3. The transaction port, its Drizzle version with the lock, and the use cases.
4. Routes, wiring and the route tests, including the concurrency test.
5. Docs. Run `pnpm check`, check by hand with curl, and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- **By hand on Compose**, as a seeded admin with a session inserted directly into the DB:
  - create a user; list users;
  - change their roles; deactivate them (their session row disappears); reactivate them;
  - try to deactivate yourself (409);
  - call the routes as a mentor (403).
