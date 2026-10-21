# 3.6 Google OAuth — Plan

**Phase:** 3 — Identity (users, roles, login)
**Status:** Done

## Goal
`/auth/google` and `/auth/google/callback` using Arctic. Only pre-added, active users can sign in

## Done when
- `GET /auth/google` sends the browser to Google. `GET /auth/google/callback` signs in a pre-added, active user: it creates a session, sets the cookie, and redirects to the web app.
- Every failure redirects to the web app's sign-in page with one generic error, and never says why.
- Route tests with Google faked cover a known user signing in and an unknown user being rejected, plus every other failure path.
- `pnpm check` passes.

## Plan

### The flow
Authorization code flow with **PKCE**, which Arctic's `Google` client requires.

1. **`GET /auth/google`:**
   - Generates `state` and a `codeVerifier` (Arctic).
   - Stores each in a short-lived cookie: HttpOnly, SameSite=Lax, 10 minutes.
   - Responds `302` to Google with the scopes `openid email profile` and `prompt=select_account`, so someone with several Google accounts can pick one.
2. **`GET /auth/google/callback?code&state`:**
   1. Checks that `state` matches its cookie, then clears both cookies **whatever the outcome**.
   2. Exchanges the code (with the verifier) for tokens.
   3. Reads the ID token's claims and checks them with Zod:
      - `iss` is Google;
      - `aud` is our client ID;
      - `exp` is in the future;
      - `sub`, `email`, `email_verified: true`, and the optional `name` and `picture`.

      Arctic decodes the ID token but doesn't check its signature. That's allowed here: OIDC Core §3.1.3.7 permits skipping the check when the token comes **directly from Google's token endpoint over TLS**.
   4. `users.findByEmail(email)`, then the domain's `signIn` from 3.2. That covers inactive users and an email linked to a different Google account.
   5. `users.save`, `sessions.create` (3.5), set the session cookie, then `302` to `WEB_APP_URL`.
3. **Any failure** redirects `302` to `${WEB_APP_URL}/login?error=sign_in_failed`. Failures include:
   - a state mismatch or missing cookie;
   - Google returning `?error=access_denied` (the user cancelled);
   - a failed exchange or invalid claims;
   - an unverified email, an unknown email, an inactive user, or a different Google account.

   Every case looks the same to the browser. The **log** records the specific reason (for example `unknown_email` or `state_mismatch`) and the user ID when known, but **never the email, code or token**.
   - Only *unexpected* errors (Google unreachable, DB down) are logged at error level. The browser still gets the same redirect.

The web app's `/login` page arrives in phase 4. The design project has no sign-in screen yet, so phase 4 will need to raise it. Until then the redirect target is just a URL.

### The Google port (so tests never call Google)
```ts
// application/google-auth.ts
type GoogleIdentity = Readonly<{ sub: string; email: string; emailVerified: boolean; name: string | null; picture: string | null }>;
type GoogleAuth = Readonly<{
  authorizationUrl: (state: string, codeVerifier: string) => URL;
  exchange: (code: string, codeVerifier: string) => Promise<GoogleIdentity>;   // throws on failure
}>;
```
- **`infrastructure/arctic-google-auth.ts`** implements it with Arctic (`arctic@3.7.0`, more than 1 day old; its dependencies are 3 small `@oslojs/*` packages) and does the claim checks.
- The route tests use a fake `GoogleAuth`. A separate unit test runs the Arctic adapter against a stubbed `fetch`, which checks the token request it builds and the claim checks.

### The use case (`application/sign-in-with-google.ts`)
`signInWithGoogle({ users, sessions, now }, { identity, userAgent, ip })` returns `{ ok: true, token, session }` or `{ ok: false, reason }`.
- **Pure orchestration**, tested against the real repositories (integration).
- **The name stays as the admin entered it.** Only `avatarUrl` is taken from Google.
- **The login is linked by email, and then the Google `sub` is fixed.** After the first sign-in, a different Google account with the same email is rejected (the 3.2 rule).

### Config (all optional)
| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The OAuth client. **If either is missing, `/auth/google*` returns 503 `unavailable`**, so `pnpm dev`, the tests and Compose work without credentials. The API logs a warning at start-up. |
| `GOOGLE_REDIRECT_URI` | Default `http://localhost:3000/auth/google/callback`. Must match the URI registered with Google. |
| `WEB_APP_URL` | Where to send the browser afterwards. Default `http://localhost:5173` (Vite). |

`GOOGLE_CLIENT_SECRET` is a secret: it's never logged and never appears in config errors, which list key names only (1.3).

### Smaller decisions
- **The IP comes from the socket** (`getConnInfo` from `@hono/node-server/conninfo`), or `null` when there isn't one, for example in `app.request` tests. `x-forwarded-for` can be forged unless a known proxy sets it, so trusting it waits for deployment (11.x).
- **Cookie attributes are shared.** `session-cookie.ts` from 3.5 gets a small `cookieAttributes(secure)` helper, which the two OAuth cookies reuse. In production they're `__Host-oauth_state` and `__Host-oauth_verifier`.
- **The OAuth `code` and `state` never reach telemetry.**
  - The request logger already logs the path without the query string.
  - For spans, the HTTP instrumentation's `redactedQueryParamsServer` is set to `['code', 'state']`.
  - This settles the redaction note carried since 2.2. A test checks the span's `url.query`.
- **Routes live in `modules/identity/http/auth.routes.ts`.** `createApp` mounts them at `/auth`, and `AppDeps` gains `{ users, sessions, googleAuth, auth config }`. `main.ts` wires the real adapters.

### Tests
- **Route tests** (Hono `app.request` with the real repositories against Testcontainers, and a fake `GoogleAuth`):
  - `/auth/google` responds 302 to the fake's URL and sets the state and verifier cookies with the right attributes.
  - **Known active user:** the callback gives 302 to `WEB_APP_URL` and sets the session cookie. A session row exists for them. `googleSub`, `avatarUrl` and `lastLoginAt` are saved. The OAuth cookies are cleared.
  - **Unknown email: rejected.** 302 to `/login?error=sign_in_failed`, no session, no user created.
  - Also rejected, with the same response:
    - an inactive user;
    - a different Google account for a linked email;
    - an unverified email;
    - a state mismatch, a missing state cookie, or a missing code;
    - `?error=access_denied`;
    - the exchange throwing.
  - **Not configured:** both routes return 503 problem+json.
- **Unit:**
  - The Arctic adapter with a stubbed `fetch`: it posts the code and verifier; it maps the claims; and it rejects a wrong `aud`, a wrong `iss`, an expired token, or a missing email.
  - Config: the defaults, and "configured" only when both the ID and the secret are set.
  - Span redaction: the `createInstrumentations` option.

### Docs
- **README:** "Google sign-in (optional locally)". How to create an OAuth client in Google Cloud Console (type *Web application*, redirect URI `http://localhost:3000/auth/google/callback`), which values go into `apps/api/.env`, and that the email must first be seeded or added (3.4/3.8).
- **`.env.example`:** the four variables, with the two credentials commented out.

### Out of scope
- **The auth middleware, `GET /me` and logout:** 3.7.
- **A `returnTo` after sign-in:** the redirect always goes to the app root. It can be added with the web app if needed.
- **Restricting to a Google Workspace domain (`hd`).** Only emails an admin has added can sign in, which is already a stricter allowlist.

### Steps
1. Add Arctic (with the release-age check), the config, and the shared cookie attributes.
2. The `GoogleAuth` port, the Arctic adapter and its unit tests.
3. The `signInWithGoogle` use case.
4. Routes and wiring, with route tests.
5. Span redaction and its test.
6. README and `.env.example`. Run `pnpm check`. Write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- `curl -i localhost:3000/auth/google` gives 503 without credentials. With credentials, it gives 302 to `accounts.google.com`.
- **Optional, needs your Google client:** a real sign-in in the browser. With no web app yet, the final redirect goes to `localhost:5173` and fails to load, but the `sessions` row and the `Set-Cookie` header show it worked.
