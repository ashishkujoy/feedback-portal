# 3.2 User domain — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/identity/domain/email.ts` (+ test) | `Email`, a Zod-branded string that is trimmed, lower-cased, a valid email and at most 254 characters. `parseEmail` throws `validation_failed` with the issue at `email`. |
| `apps/api/src/modules/identity/domain/user-id.ts` | `UserId`, a branded `z.uuid()` |
| `apps/api/src/modules/identity/domain/user.ts` (+ test) | `User` and `RoleGrant`, plus `createUser`, `grantRole`, `revokeRole`, `deactivate`, `reactivate`, `signIn`, `signInRejected`, `hasRole`, `roleSet` and `ensureAnAdminRemains` |
| `apps/api/src/shared/errors/field-issues.ts` (+ test) | **New.** `fieldIssues(zodError, at?)` turns Zod issues into `{ path, message }`, never including values. Used by the domain and by `validate.ts`, which no longer has its own copy. |
| `apps/api/src/shared/http/validate.ts` | Uses `fieldIssues` (same behaviour; its tests are unchanged and pass) |
| `packages/contracts/src/problem.ts` (+ test) | `ErrorCode` gains `user_requires_role` and `cannot_deactivate_self` |

## How to verify
```sh
pnpm check                                                     # 45 contracts + 136 api tests
grep -rnE "drizzle|hono|@opentelemetry" apps/api/src/modules/identity/domain/   # no output
```

| Check | Result |
|---|---|
| `pnpm check` | exit 0: 45 contracts tests; 136 api tests (116 unit + 20 integration), up from 102 |
| Domain imports | Only `zod`, `@feedback-portal/contracts` and `shared/` (errors, plus `ids` in tests). No Drizzle, Hono or OTel. |

### Unit tests
- **Email (5):** trims and lower-cases. Rejects an empty value, a blank value, a missing `@` and a 260-character address, each with the issue at `email`. The value never appears in the error.
- **`createUser` (9):**
  - The defaults, plus the email is normalised and the name trimmed.
  - Duplicate roles collapse; several roles are allowed; a system grant (`grantedBy: null`).
  - A blank name, a 201-character name, no roles and an invalid email are each rejected at the right path. A 200-character name is accepted.
  - All the invalid fields are reported together (`email`, `name`, `roles`).
- **Roles (6):**
  - Queries.
  - Granting returns a new user with `updatedAt` set, and the original is unchanged.
  - Granting a held role returns the same object.
  - Revoking works; revoking a role that isn't held returns the same object; revoking the last role gives `user_requires_role`.
- **Deactivate / reactivate (3):** both directions, both no-ops return the same object, and deactivating yourself gives `cannot_deactivate_self`.
- **`signIn` (4):**
  - The first sign-in links `googleSub` and sets `avatarUrl`, `lastLoginAt` and `updatedAt`.
  - A later sign-in with the same account works.
  - A different Google account and an inactive user both get `unauthenticated` with the same message, `Sign-in failed`.
- **`ensureAnAdminRemains` (3):** 0 is rejected (`conflict`); 1 and 2 are fine.
- **`fieldIssues` (3):** nested paths, the field-name prefix, and no values in the output.

## Decisions & trade-offs
- **Every operation takes an options object** (`{ by, now }` or `{ now }`). The plan had positional `grantRole(user, role, by, now)` and `revokeRole(user, role)` with no time. Every change sets `updatedAt`, so `revokeRole` and `reactivate` need `now` too, and one shape for all of them keeps call sites readable.
- **`createUser` validates every field at once** with one Zod object, so a 3.8 form gets all its field errors in one response. The email field reuses the `Email` schema.
- **`signInRejected()` is exported.** The unknown-email case lives in 3.6, outside the aggregate, and must give the identical error. Sharing the factory guarantees that.
- **Deactivating yourself is rejected even if you're already inactive.** An inactive user can't make requests anyway, so the order of the checks doesn't matter in practice. Checking for self first keeps the rule simple.
- **Validation messages are our own** (`Name is required`, `Email must be at most 254 characters`, …), not Zod's defaults, so the web app can show them as they are.
- **`ensureAnAdminRemains` uses the generic `conflict` code**, as planned. If the web app needs a specific message, a `last_admin` code can be added in 3.8.

## Deviations from plan
- **Added:** `shared/errors/field-issues.ts`, which removes the duplicated mapping from `validate.ts`, and `signInRejected()`.
- **Changed:** the option-object signatures described above.
- Nothing else.

## Observations
- Mapping a DB row to `User` (3.3) will parse `email` and `id` through `Email` and `UserId`, so rows read from the DB get the same brands without casts.
