# 3.7 Auth middleware + `GET /me` — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/identity/application/current-user.ts` (+ int test) | **New.** `resolveCurrentUser({ users, sessions }, token)`: validates the session, loads the user, rejects and **revokes** the session of an inactive user. Returns `ok` with `renewed`, or a reason for the log (`no_session`, `unknown_user`, `inactive`). |
| `apps/api/src/modules/identity/http/authenticate.ts` | **New.** Middleware. The cookie becomes `c.var.currentUser`, or the request gets 401 `unauthenticated` ("Authentication required", the same for every case). A rejected cookie is cleared, and a renewed session gets its cookie re-sent. Only `inactive` and `unknown_user` are logged. |
| `apps/api/src/modules/identity/http/auth-env.ts` | **New.** `AuthEnv`, where `currentUser: User` is always set. `shared/` imports nothing from identity. |
| `apps/api/src/modules/identity/http/require-role.ts` (+ test) | **New.** `requireRole(...roles)` gives 403 `forbidden` ("Requires one of: admin") unless the user holds one of the roles. Ready for 3.8. |
| `apps/api/src/modules/identity/http/me.routes.ts` | **New.** `GET /me` returns `MeResponse` with `Cache-Control: no-store`. Roles come in the order of the `roles` tuple. |
| `apps/api/src/modules/identity/http/auth.routes.ts` | **+ `POST /auth/logout`.** Revokes the cookie's session if there is one, clears the cookie, and returns 204. |
| `apps/api/src/app.ts` | `csrf({ origin: webAppUrl })` applied app-wide, and `/me` mounted |
| `apps/api/src/shared/http/error-handler.ts` (+ test) | Hono's own 4xx with an empty message (as `csrf()` throws) now **omits `detail`** instead of sending `"detail": ""` |
| `packages/contracts/src/me.ts` (+ test) | **New.** `MeResponse`: `{ id, email, name, avatarUrl, roles }`, with at least 1 role |
| `apps/api/test/app-deps.ts` | **+ `signInAs(deps, { roles, active, secureCookies })`.** Saves a user and starts a session, returning `{ user, token, session, cookie }`. 3.8 will use it. |
| `apps/api/src/modules/identity/http/me-and-logout.int.test.ts` | **New.** Route tests through the full `createApp`, CSRF included |
| `README.md`, `TECH_STACK.md` | "Auth endpoints", and the CSRF check on the auth row |

## How to verify
```sh
pnpm check   # 47 contracts + 257 api tests
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 47 contracts tests (+2). 257 API tests: 165 unit and 92 integration, up from 235. |
| `GET /me` route tests | **Signed in:** 200, the body parses as `MeResponse`, roles sorted (`['admin','mentor']` for grants made in the other order), `no-store`, no `Set-Cookie`. **No cookie:** 401, no `Set-Cookie`. **Malformed or unknown token:** 401, cookie cleared. **Renewal due (day 4):** 200, the cookie is re-sent with `Max-Age=604800`, and `expires_at` is created + 11 days. **Expired (day 8):** 401, cookie cleared, row deleted. **Inactive user:** 401, row deleted. **Production:** `__Host-session` gives 200 and a plain `session` cookie gives 401. |
| `POST /auth/logout` route tests | 204, the cookie is cleared, **only that session** is deleted (a second session of the same user stays), and `/me` with the old cookie then gives 401. No cookie or an unknown token: 204 as well. |
| CSRF route tests | A foreign `Origin` gives **403** problem+json, without `detail`, and the session survives. A form post with no `Origin` gives 403. A request with `Origin` = `WEB_APP_URL` gives 204. |
| `requireRole` unit tests | Holding the role passes. Holding one of several listed roles passes. Anyone else gets 403 problem+json. |
| `resolveCurrentUser` integration | Each outcome, including that **only the presented session** is revoked for an inactive user |
| Tests catch the bug | I removed `csrf()`, then the inactive-session revoke. The CSRF tests (2) and the inactive tests (2) failed, and passed again once each was restored. |
| By hand, Compose (production mode) | With a user and session inserted directly into the DB: `/me` with no cookie gave **401**; with `__Host-session` it gave **200** and the JSON. Logout with `Origin: https://evil.example` gave **403**, and `/me` still worked. Logout with `Origin: http://localhost:5173` gave **204** plus a cleared `__Host-session`. `/me` after that gave **401**, and the session row was gone. Then I deleted the test user. |

## Decisions & trade-offs
- **A bad cookie is cleared on 401, but a missing one isn't.** The browser stops sending a cookie that will never work, and a signed-out request gets no pointless `Set-Cookie`.
- **The same 401 body every time.** The client can't tell "expired" from "deactivated". The log records only `inactive` and `unknown_user`; a missing or expired cookie is routine, and the request log already records the 401.
- **An inactive user's session is revoked when presented, not all their sessions.** The middleware deals with the request in front of it. Revoking everything is the deactivation's job (3.8, `revokeAllForUser`).
- **Logout is public and idempotent.** It always answers 204 and clears the cookie, so the web app can call it after a 401 without checking first.
- **`csrf()` covers the whole app**, not just logout. Every future write route (3.8 onwards) is checked without anyone remembering to add it. JSON writes from another origin are blocked by the CORS preflight anyway, because we send no CORS headers.
- **`MeResponse` has no grant details.** Who granted a role, and when, belongs to the admin user list (3.8).

## Deviations from plan
- **Empty `detail` on Hono's own 4xx.** `csrf()` throws a 403 with no message, and the handler used to send `"detail": ""`. It's now left out. This was found during the manual check, and a unit test covers it.
- **Test file name.** The route tests are in `me-and-logout.int.test.ts`, not in `auth.routes.int.test.ts`, because they go through the full `createApp` (CSRF included). The Google tests mount only the auth routes.
- **`signInAs`** takes an option `active: false` too, which the inactive-user tests need.

## Not done / follow-ups
- **CORS** is still assumed to be unnecessary (same origin through the Vite proxy and one host in production). Phase 4 settles it.
- **3.8** applies `authenticate` and `requireRole('admin')` to the admin routes, and calls `revokeAllForUser` on deactivation.
