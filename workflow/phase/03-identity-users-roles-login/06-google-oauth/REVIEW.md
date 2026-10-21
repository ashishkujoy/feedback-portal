# 3.6 Google OAuth — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/identity/http/auth.routes.ts` | **New.** `GET /auth/google` and `GET /auth/google/callback`, mounted at `/auth`. Every failure redirects to `<WEB_APP_URL>/login?error=sign_in_failed` and logs the reason. The routes return 503 when Google isn't configured. |
| `apps/api/src/modules/identity/application/google-auth.ts` | **New.** The `GoogleAuth` port: `start()` and `exchange()`. Expected failures (`code_rejected`, `invalid_id_token`) are returned; anything else is thrown. |
| `apps/api/src/modules/identity/infrastructure/arctic-google-auth.ts` (+ test) | **New.** The Arctic adapter: PKCE, scopes `openid email profile`, `prompt=select_account`. The ID token claims are checked with Zod (`iss`, `aud`, `exp`, `sub`, `email`, `email_verified`). |
| `apps/api/src/modules/identity/application/sign-in-with-google.ts` | **New.** Verified email → `findByEmail` → the domain's `signIn` → `save` → `sessions.create`. It returns `ok`, or a reason for the log. |
| `apps/api/src/modules/identity/http/session-cookie.ts` | `cookieAttributes()` and `readCookie()` are now exported and shared by the session and OAuth cookies |
| `apps/api/src/shared/http/client-ip.ts` | **New.** The socket's peer address, or `null` outside the Node server. `x-forwarded-for` is ignored. |
| `apps/api/src/shared/errors/app-error.ts`, `error-handler.ts` (+ tests) | A new error kind, `unavailable` → 503 with code `unavailable` |
| `apps/api/src/shared/config/config.ts` (+ test) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `WEB_APP_URL`, exposed as `config.auth` (`google` is `null` unless both credentials are set). `secureCookies` is on in production. |
| `apps/api/src/shared/telemetry/telemetry.ts` | `redactedQueryParamsServer: ['code', 'state']`. The real-process integration test asserts it. |
| `apps/api/src/app.ts`, `main.ts`, `test/app-deps.ts` | `AppDeps` gains `auth`, and `main.ts` wires the real repositories and Arctic. It logs a warning when Google isn't configured. The existing tests use `appDeps(ping)`, with Google off and repositories that are never called. |
| `apps/api/package.json` | **+ `arctic@3.7.0`** (published May 2025). It brings 6 small `@oslojs/*` packages (3 direct, 3 of theirs). No release-age exceptions and no build scripts. |
| `README.md`, `apps/api/.env.example` | "Google sign-in (optional locally)", including how to create the OAuth client. The new variables. |

## How to verify
```sh
pnpm check                                           # 45 contracts + 235 api tests
curl -i localhost:3000/auth/google                   # 503 without credentials
GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=y pnpm --filter @feedback-portal/api dev
curl -i localhost:3000/auth/google                   # 302 to accounts.google.com + 2 cookies
```

| Check | Result |
|---|---|
| `pnpm check` | exit 0: 45 contracts tests; 235 api tests (161 unit + 74 integration), up from 199 |
| Real server, no credentials | `/auth/google` gives **503** problem+json (`unavailable`, "Google sign-in is not configured"). Start-up logs the warning. |
| Real server, placeholder credentials | `/auth/google` gives **302** to `accounts.google.com/o/oauth2/v2/auth` with `client_id`, `redirect_uri`, `state`, `code_challenge` (S256), `scope=openid+email+profile` and `prompt=select_account`, and sets both 10-minute cookies. A callback without cookies gives **302** to `http://localhost:5173/login?error=sign_in_failed`, and the log says `reason: missing_parameters`. Neither the secret nor the `code` appears in the log. |
| **Not done: a real Google sign-in** | It needs your OAuth client (README → "Google sign-in"). Everything up to Google's token endpoint is covered by tests with a stubbed `fetch`. |

### Route tests (Testcontainers, real repositories, Google faked; 20)
- **`/auth/google`:** 302 to the fake's URL, with the exact `Set-Cookie` headers (`Max-Age=600`, HttpOnly, Lax). In production they're `__Host-…` and Secure.
- **A known, active user signs in:**
  - 302 to `WEB_APP_URL/` with the exchange called using the code and the verifier.
  - The session cookie is `session=<43 chars>; Max-Age=604800`, and the DB row is keyed by its hash, with the user agent.
  - Both flow cookies are cleared.
  - `googleSub`, `avatarUrl` and `lastLoginAt` are saved, and **the admin-entered name is kept**.
  - The same works with production `__Host-` cookies.
- **An unknown email is rejected:** the generic redirect, no session cookie, no session row, and **no user created**.
- **Also rejected, with the user left unchanged:**
  - an inactive user;
  - a different Google account;
  - an unverified email;
  - Google rejecting the code;
  - an invalid ID token;
  - Google being unreachable (a thrown error).
- **Rejected without calling Google at all:**
  - a state mismatch;
  - a missing state cookie;
  - a missing verifier cookie;
  - a missing code;
  - `error=access_denied` (the user cancelled);
  - **unprefixed cookies in production**.
- **Flow cookies are cleared on rejection too.**
- **Not configured:** both routes give 503 `unavailable`.

### Unit tests
- **The Arctic adapter, with a stubbed `fetch`** (10):
  - the authorization URL's parameters;
  - a fresh state on every start;
  - the token request (`grant_type`, `code`, `code_verifier`, `redirect_uri`) sent to Google's endpoint;
  - claims mapped to the identity, with `name` and `picture` optional and the `iss` accepted without a scheme;
  - another `aud`, another `iss`, an expired token, no email or an empty `sub` → `invalid_id_token`;
  - a 400 `invalid_grant` → `code_rejected`;
  - a network failure → thrown.
- **Config** (+4), **error kinds** (+2).
- **Span redaction** is checked in the real-process telemetry test: `url.query` is `code=REDACTED&state=REDACTED&x=1`, and the values appear nowhere in the exported spans. I confirmed the test **fails** with the redaction option removed.

## Decisions & trade-offs
- **Expected and unexpected Google failures are kept apart.** The adapter *returns* `code_rejected` and `invalid_id_token`, which are logged at info. Anything else (network, a bug) is *thrown* and logged at error. The browser gets the same redirect either way.
- **The use case returns a specific reason** (`unknown_email`, `inactive`, `google_account_mismatch`, `email_not_verified`) for the log. The domain's `signIn` still throws one generic error. The use case tells `inactive` and `google_account_mismatch` apart by checking `isActive` after catching it.
- **Hono's `deleteCookie` needs the same attributes** (prefix, Secure) to clear a `__Host-` cookie. The shared `cookieAttributes()` guarantees that.
- **`AppDeps` gains `auth`.** Tests that don't sign in use `test/app-deps.ts`, whose repositories throw if they're ever called, so a test can't silently depend on them.
- **`WEB_APP_URL` loses any trailing slash** at config time, so redirect URLs never contain `//`.

## Deviations from plan
- **The port is `start()` instead of `authorizationUrl(state, verifier)`.** The adapter now creates `state` and the verifier with Arctic's helpers, so the routes don't import Arctic at all, and the fake controls both values.
- **Added:** the `unavailable` error kind (the plan's 503 needed one) and `test/app-deps.ts`.
- **Arctic brings 6 `@oslojs/*` packages, not 3** (3 direct, 3 of theirs). pnpm also printed a "deprecated" notice for them: the author has marked the oslo packages as deprecated. Arctic 3.7.0 is still the current release, and the packages are small and stable. Worth checking again when Arctic publishes a new major version.

## Observations
- **The design has no sign-in screen.** Phase 4's `/login` page needs one from the design project before it's built (CLAUDE.md).
