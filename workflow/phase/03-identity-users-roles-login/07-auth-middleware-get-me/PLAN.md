# 3.7 Auth middleware + `GET /me` — Plan

**Phase:** 3 — Identity (users, roles, login)
**Status:** Done

## Goal
Loads the current user and their roles, and adds `logout`

## Done when
- Middleware turns the session cookie into the current user (active, with roles), or answers 401. A role guard answers 403.
- `GET /me` returns the signed-in user. `POST /auth/logout` ends the session.
- State-changing requests from other origins are rejected (CSRF).
- Route tests cover both the signed-in and the signed-out case for each route, plus every rejection.
- `pnpm check` passes.

## Plan

### The middleware (`http/authenticate.ts`)
`authenticate({ users, sessions, secureCookies, now })` returns Hono middleware that runs these steps:

1. **Reads the session cookie** (`readSessionCookie` from 3.5). If there's no cookie, it answers **401 `unauthenticated`**.
2. **`sessions.validate(token)`.** An unknown, malformed or expired token gives 401, and the **cookie is cleared** so the browser stops sending it.
3. **`users.findById(session.userId)`.**
   - A missing user gives 401. That shouldn't happen, because the FK cascades.
   - An **inactive user** gives 401, and **that session is revoked**.
     - 3.8's deactivation will revoke all of the user's sessions anyway; this covers a session that is still in flight.
     - It's logged at info as `session rejected: inactive`, with the user ID.
4. **Renewal.** If `validate` renewed the session, it **re-sends the cookie** with the new expiry. Otherwise it sends no `Set-Cookie`.
5. Sets **`c.var.currentUser`** (the domain `User`) and calls `next()`.

The steps above live in a small use case, `application/current-user.ts`:
- `resolveCurrentUser({ users, sessions }, token)` returns `{ ok: true, user, session, renewed }` or `{ ok: false, reason: 'no_session' | 'inactive' | 'unknown_user' }`.
- It's tested against the real repositories, which keeps the middleware to HTTP concerns only: cookies and status codes.

**Every 401 has the same body:** `unauthenticated`, "Authentication required". The reason appears only in the log, and only for `inactive`. A missing cookie is normal, and the request logger already records the 401.

**Typing:** `modules/identity/http/auth-env.ts` defines `AuthEnv = AppEnv & { Variables: { currentUser: User } }`. Routes behind the middleware read `c.var.currentUser` with no `undefined` check. `shared/` stays free of identity imports.

### The role guard (`http/require-role.ts`)
- **`requireRole(...roles)`** answers **403 `forbidden`** ("Requires one of: admin") unless the current user holds **any** of the listed roles. It runs after `authenticate`.
- 3.8 uses it as `requireRole('admin')`. 3.7 adds it, with its own tests, so 3.8 only has to apply it.

### `GET /me`
- **Path:** `GET /me`, behind `authenticate`.
- **Response (200):** `MeResponse`, a new schema in `@feedback-portal/contracts`, so the web app parses the same shape:
  ```ts
  { id: string; email: string; name: string; avatarUrl: string | null; roles: Role[] }
  ```
- **Roles are sorted** in the order of the `roles` tuple, so the response is stable.
- **Grant details** (who granted a role, and when) are left out. They belong to the admin screens (3.8).
- The design's top bar ("Viewing as \<role\>") needs all the roles. Which role to show is a web app decision for phase 4.
- **Response header:** `Cache-Control: no-store`, so no cache keeps a user's details.

### `POST /auth/logout`
- **Returns `204`.** It revokes the cookie's session and clears the cookie.
- **Doesn't require a valid session.** No cookie, or an expired or unknown one, still gives 204 and clears the cookie. Logging out is idempotent, and the web app can always call it.
- **POST, not GET,** so a link or an `<img>` can't sign someone out.

### CSRF
- **Hono `csrf({ origin: webAppUrl })`** is applied app-wide in `createApp`. It rejects a POST, PUT, PATCH or DELETE with a form-style or missing content type unless the `Origin` (or `Sec-Fetch-Site: same-origin`) matches. Safe methods and JSON bodies pass.
  - JSON from another origin can't be sent without a CORS preflight, and we add no CORS headers.
  - `SameSite=Lax` already keeps the cookie off cross-site POSTs. This check is a second layer, as 3.5 planned.
- **Rejections return 403 problem+json.** The existing `HTTPException` branch of the error handler produces it.
- The Google routes are GETs, so the check doesn't affect them.

### Wiring
- **`AppDeps.auth`** gains nothing new: the middleware reuses `users`, `sessions`, `secureCookies` and `now`.
- **New routes:**
  - `meRoutes`, mounted at `/me`.
  - `/logout`, added to `authRoutes`.
  - Both live in `modules/identity/http/`.
- **`test/app-deps.ts`** gets a helper that signs a user in directly: it creates the user and a session, and returns the cookie header. Route tests can then call protected routes without the OAuth flow. 3.8's tests will use the same helper.

### Tests
**Route tests** (Testcontainers, real repositories):
- **`GET /me`**
  - With no cookie, or a garbage or unknown token: 401 problem+json. A bad cookie is also cleared.
  - **Signed in:** 200 with the body, `MeResponse.parse` passes, and the response has `Cache-Control: no-store`. No `Set-Cookie` header is sent while no renewal is due.
  - **Renewal due** (the clock moved past the halfway point): 200, `Set-Cookie` with the new `Max-Age`, and `expires_at` moved.
  - **Expired:** 401, and the session row is deleted.
  - **Inactive user:** 401, and that session row is deleted.
  - **Production cookies:** with `secureCookies`, only `__Host-session` is accepted, and a plain `session` cookie gives 401.
- **`POST /auth/logout`**
  - Gives 204, the cookie is cleared, and the session row is gone. A later `GET /me` with the same cookie gives 401.
  - Gives 204 when there's no cookie or an unknown token.
  - Only that session is removed. The user's other sessions stay.
- **CSRF**
  - A logout with `Origin: https://evil.example` gives 403 problem+json, and the session survives.
  - The same request with `Origin` set to `WEB_APP_URL` gives 204.

**Unit:**
- `requireRole`, through a tiny Hono app with a stubbed current user:
  - a user holding the role passes;
  - a user holding one of several listed roles passes;
  - any other user gets 403 problem+json.
- `MeResponse`, in the contracts tests.

**Integration:**
- `resolveCurrentUser`, against the real repositories: each outcome.

### Docs
- **README:** a short "Auth endpoints" note listing `GET /me` and `POST /auth/logout`, and what a 401 means.
- **TECH_STACK:** one line on the CSRF origin check.

### Out of scope
- **The admin routes that use `requireRole`:** 3.8.
- **`GET /settings`** (the program and organisation names): it's public and not part of identity. It comes with the web app skeleton or wherever the roadmap puts it.
- **"Sign out everywhere":** not in the roadmap.
- **CORS:** the web app reaches the API through the same origin (the Vite proxy in dev, one host in production). That's decided in phase 4.

### Steps
1. Add `MeResponse` to the contracts, with a test.
2. Add `resolveCurrentUser` and its integration tests.
3. Add `authenticate`, `AuthEnv` and `requireRole`, with tests.
4. Add `GET /me`, `POST /auth/logout` and `csrf()`, plus the sign-in test helper and the route tests.
5. Update the docs. Run `pnpm check`, check by hand with curl, and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- **By hand**, with a session inserted directly into the DB through a small script, since Google isn't configured locally:
  - `curl -i localhost:3000/me` gives 401 without a cookie, and 200 with one.
  - `curl -i -X POST localhost:3000/auth/logout` with the cookie gives 204, and then `/me` gives 401.
  - The same POST with `-H 'Origin: https://evil.example'` gives 403.
