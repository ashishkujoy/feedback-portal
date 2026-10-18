# 3.5 Sessions — Plan

**Phase:** 3 — Identity (users, roles, login)
**Status:** Done

## Goal
Create, validate, and revoke sessions with a hashed token, a cookie, and a sliding expiry

## Done when
- A session service can create, validate (with sliding renewal), revoke one, and revoke all sessions for a user, using the `sessions` table from 3.1.
- Cookie helpers set, read and clear the session cookie with the attributes TECH_STACK names.
- Unit tests cover the expiry policy, tokens and cookies. Integration tests cover the service against Postgres.
- `pnpm check` passes.

## Plan

### Tokens
- **Token:** 32 bytes from `crypto.randomBytes`, encoded as base64url (43 characters). That's 256 bits of randomness, so it can't be guessed.
- **Stored ID:** the SHA-256 hex of the token (DATA_MODEL). A leaked `sessions` table can't be turned back into cookies.
- **No session secret or signed cookie.** With a 256-bit random token, signing adds nothing. A forged cookie simply matches no row. This is the approach Lucia and OWASP's session guidance describe. TECH_STACK's "session secret" is removed, so there's one less secret to manage and rotate.
- Only Node's built-in `crypto` is used. No new package.

### Decision needed: expiry policy
| Option | Behaviour |
|---|---|
| **A. 7-day sliding expiry, with a 30-day absolute cap** *(recommended)* | A session expires after **7 days without use**. Using it extends it, but no session lives longer than **30 days** from sign-in. Signing in again is one click with Google. This keeps the risk window short for a tool holding personal feedback about interns. |
| B. 30-day sliding expiry, no cap | Lucia's default, and the most convenient. But a session that's used regularly never ends, for example on a shared or lost laptop. |
| C. 12 hours, no sliding | Signing in every day. Safe, but annoying. |

**Renewal writes rarely.** The expiry is pushed back only when **less than half** of the 7 days is left, so an active user causes about one write every 3–4 days, not one per request. The cookie is re-sent only on those renewals.

The rest assumes **A**. The durations are constants in the domain (`sessionPolicy`), not env vars. They're a security decision, not a deployment setting.

### Code
```
apps/api/src/modules/identity/
  domain/session.ts (+ test)          # Session type, sessionPolicy, isExpired(), renewedExpiry() — pure
  application/session-repository.ts   # port: insert, findById, updateExpiry, delete, deleteForUser, deleteExpired
  application/sessions.ts (+ int test)# createSessions({ sessions, now }) → { create, validate, revoke, revokeAllForUser }
  application/session-token.ts (+ test) # generateToken(), hashToken() — node:crypto only
  infrastructure/drizzle-session-repository.ts (+ int test)
  http/session-cookie.ts (+ test)     # setSessionCookie, readSessionCookie, clearSessionCookie (Hono cookie helpers)
```

**The service:**
- **`create(userId, { userAgent, ip })`** returns `{ token, session }`.
  - `userAgent` is cut to 512 characters.
  - It also deletes **all expired sessions**. This is an indexed delete, and sign-ins are rare, so there's no need for a cleanup job.
- **`validate(token)`** returns `{ session, renewed: boolean }` or `null`.
  - It hashes the token and looks it up.
  - An expired session is deleted, and the result is `null`.
  - If renewal is due, it updates `expires_at` and returns `renewed: true`, so 3.7's middleware knows to re-send the cookie.
- **`revoke(token)`** is for logout (3.7). **`revokeAllForUser(userId)`** is for deactivation (3.8).

**The cookie:**
- **Attributes:** `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Max-Age` matching `expires_at`.
- **`Secure` when `NODE_ENV=production`**, with the name **`__Host-session`**. The `__Host-` prefix makes browsers reject the cookie unless it's Secure, has `Path=/` and has no `Domain`, so a subdomain can't plant or overwrite it.
- **In development**, the name is plain `session` and the cookie isn't Secure, because `pnpm dev` runs on plain `http://localhost`.
- The name is neutral: no program or organisation name.

### What 3.5 does *not* decide
- **Inactive users:** `validate` checks only the session. 3.7's middleware loads the user and rejects an inactive one. 3.8's deactivation calls `revokeAllForUser`.
- **CSRF:** `SameSite=Lax` already blocks cross-site POSTs carrying the cookie. 3.7 adds Hono's `csrf()` origin check on state-changing routes.

### Tests
- **Unit:**
  - `renewedExpiry`:
    - no change while more than half the 7 days is left;
    - extends to now + 7 days once less than half is left;
    - never goes past `createdAt` + 30 days.
  - `isExpired`, including the boundary.
  - `generateToken`: 43 characters of base64url; 1,000 tokens are all different.
  - `hashToken`: a known SHA-256 vector, and the hash is not the token.
  - The cookie, through a small Hono app:
    - the attributes in production (`__Host-session`, Secure) and in development;
    - `Max-Age`;
    - reading the cookie back;
    - clearing it (`Max-Age=0`).
- **Integration (Testcontainers):**
  - `create` stores the **hash** (no row contains the token) along with `userAgent`, `ip` and the expiry.
  - `validate` works with the right token, and returns `null` for a wrong or unknown one.
  - Renewal happens only after the halfway point: `renewed` is true and `expires_at` moves.
  - An expired session returns `null` and its row is deleted.
  - The absolute cap is enforced through `validate`.
  - `revoke` makes `validate` return `null`.
  - `revokeAllForUser` removes only that user's sessions.
  - `create` removes other expired sessions.

### Out of scope
- **Routes and middleware** (`/auth/*`, loading the current user, `GET /me`, logout): 3.6 and 3.7.
- **A "sign out everywhere" screen** listing sessions: not in the roadmap.
- **Rate limiting sign-in:** Google handles credentials; revisit with deployment (11.x).

### Doc changes
- **TECH_STACK:** remove "session secret", and describe the session policy and cookie.
- **DATA_MODEL:** the `expires_at` note gets the 7/30-day policy.

### Steps
1. Domain policy and tokens, with unit tests.
2. The port, the Drizzle adapter and the service, with integration tests.
3. Cookie helpers, with tests.
4. Docs. Run `pnpm check`. Write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- `grep` shows that `domain/` has no `node:crypto`, Drizzle or Hono imports.
