# 3.2 User domain — Plan

**Phase:** 3 — Identity (users, roles, login)
**Status:** Done

## Goal
`User` entity, email normalization, roles, and the active/inactive rule

## Done when
- `modules/identity/domain/` holds the `User` aggregate, the `Email` and `UserId` value types, and pure functions for every user rule below. It imports no Drizzle, Hono or SDK code.
- Unit tests cover every rule, including each rejection.
- `pnpm check` passes.

## Plan

### Style
This matches the codebase so far: **immutable data plus arrow functions**, with no classes.
- Each operation takes a `User` and returns a **new** `User`, or throws an `AppError` from `shared/errors`. That module is already framework-free and maps to HTTP later.
- Time is passed in (`now: Date`). The domain never reads the clock, so tests are deterministic.
- IDs come from the caller (`newId()`, from 3.1), so the domain stays pure.

### Value types (`domain/email.ts`, `domain/user-id.ts`)
- **`Email`** is a Zod-**branded** string: `z.string().trim().toLowerCase().pipe(z.email().max(254)).brand<'Email'>()`.
  - `parseEmail(input)` returns an `Email`, or throws `validationFailed([{ path: 'email', … }])`.
  - Branding means a plain `string` can't be passed where a normalised email is expected. Zod creates the brand, so there's no unsafe cast, and lint stays clean.
  - The DB column is also `citext` (3.1). That's a second line of defence, not the main one.
- **`UserId`** is a branded `z.uuid()`.
- Zod in the domain is a pure validation library like contracts, not an SDK, and it gives us brands without casts.

### The aggregate (`domain/user.ts`)
```ts
type RoleGrant = Readonly<{ role: Role; grantedBy: UserId | null; grantedAt: Date }>;
type User = Readonly<{
  id: UserId; email: Email; name: string;
  googleSub: string | null; avatarUrl: string | null;
  isActive: boolean; lastLoginAt: Date | null;
  roles: readonly RoleGrant[];          // part of the aggregate: user_roles is owned by users
  createdAt: Date; updatedAt: Date;
}>;
```

### Rules
| Function | Rule | On violation |
|---|---|---|
| `createUser({ id, email, name, roles, grantedBy, now })` | The email is normalised. The name is trimmed and must be 1–200 characters. At least **one role** is required. The user starts **active**, with no `googleSub`. `grantedBy = null` means a system grant (the bootstrap seed, 3.4). | `validation_failed` with field issues |
| `grantRole(user, role, by, now)` | Adds the grant. If the user **already holds** the role, it's a **no-op** (returns the same user), so the 3.8 API is idempotent. | — |
| `revokeRole(user, role)` | Removes the grant. A role the user doesn't hold is a no-op. **The last role can't be revoked**: a user without roles could sign in and see nothing. To remove access, deactivate the user. | `conflict`, code `user_requires_role` |
| `deactivate(user, { by, now })` | Sets `isActive = false`. Already inactive is a no-op. **A user can't deactivate themselves** (`by === user.id`), which stops an admin from locking themselves out. | `conflict`, code `cannot_deactivate_self` |
| `reactivate(user, now)` | Sets `isActive = true`. Already active is a no-op. | — |
| `hasRole(user, role)`, `roleSet(user)` | Queries | — |
| `signIn(user, { googleSub, avatarUrl, now })` | **Inactive users can't sign in.** On the first sign-in, `googleSub` is linked. After that, a **different** `googleSub` is rejected: the email now belongs to another Google account, for example a recycled Workspace address. On success it updates `lastLoginAt` and `avatarUrl`. | `unauthenticated`, with **one generic message for every case**, so the response never reveals whether the email exists, is inactive, or is linked elsewhere |

Every change sets `updatedAt = now`. A no-op returns the **same object**, so callers (3.3 and 3.8) can skip the write with `next === user`.

### Rule left for 3.8
"There must always be at least one active admin" needs to know about *other* users, so it isn't a single-aggregate rule.
- The domain will provide `ensureAnAdminRemains(activeAdminCountAfterChange)`.
- The 3.8 use cases will call it with a count from the repository.

### Contracts
`ErrorCode` gains `user_requires_role` and `cannot_deactivate_self`, so the web app can show a specific message. These are the first specific codes; 1.4 planned for adding them as needed.

### Files
```
apps/api/src/modules/identity/domain/
  email.ts (+ test)        # Email brand, parseEmail
  user-id.ts               # UserId brand
  user.ts (+ test)         # User, RoleGrant, createUser, grantRole, revokeRole,
                           # deactivate, reactivate, signIn, hasRole, roleSet, ensureAnAdminRemains
packages/contracts/src/problem.ts (+ test)   # two new ErrorCodes
```

### Tests (unit only)
- **Email:**
  - trims and lower-cases (`'  A.Person@Example.COM '` → `'a.person@example.com'`);
  - rejects an empty string, a missing `@`, and anything over 254 characters, each with an issue at `email`;
  - the error never includes the value.
- **`createUser`:** the defaults; the name is trimmed; a blank or over-long name is rejected; no roles is rejected; duplicate roles in the input collapse into one grant; a system grant (`grantedBy: null`).
- **`grantRole` / `revokeRole`:** adding a role; granting an already-held role returns the same object; revoking; revoking a role that isn't held is a no-op; revoking the last role is rejected (`user_requires_role`); `updatedAt` changes only on a real change.
- **`deactivate` / `reactivate`:** both directions; both no-ops; deactivating yourself is rejected (`cannot_deactivate_self`).
- **`signIn`:**
  - The first sign-in links `googleSub` and sets `lastLoginAt` and `avatarUrl`.
  - A later sign-in with the same `googleSub` works.
  - A different `googleSub` is rejected, and so is an inactive user. Both give the same `unauthenticated` message.
- **`ensureAnAdminRemains`:** 0 is rejected (`conflict`); 1 or more is fine.

### Out of scope
- **Persistence and mapping DB rows ↔ `User`:** 3.3.
- **Use cases and the at-least-one-admin check wired to real counts:** 3.8.
- **Sessions:** 3.5. **The OAuth flow:** 3.6. This task gives it `signIn`.
- **Editing a user's name or email:** not in the roadmap yet.

### Steps
1. Add the two `ErrorCode`s in contracts, with a test.
2. Write `email.ts` and `user-id.ts` with tests.
3. Write `user.ts` with tests, rule by rule.
4. Run `pnpm check`. Write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- `grep` shows no `drizzle`, `hono` or `@opentelemetry` imports under `modules/identity/domain/`.
