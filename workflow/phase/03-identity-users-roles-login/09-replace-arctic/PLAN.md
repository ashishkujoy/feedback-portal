# 3.9 Replace Arctic — Plan

**Phase:** 3 — Identity (users, roles, login)
**Status:** Done

## Goal
Replace Arctic, which npm marks as no longer supported, behind the existing `GoogleAuth` port

## Done when
- **The `GoogleAuth` port is unchanged.** `auth.routes`, `sign-in-with-google` and the route tests don't change.
- **The adapter tests keep every assertion,** against the new adapter: the authorization URL, PKCE, state, scopes, the token request body, the claim checks, `code_rejected`, and "throws when Google is unreachable". Only the import name and one Arctic-specific error message change (see Tests).
- **`arctic` and `@oslojs/*` are gone** from `apps/api/package.json` and `pnpm-lock.yaml`.
- `pnpm check` passes, and a real Google sign-in still works.

## Carried over
- Found in 4.1: `arctic@3.7.0` and its `@oslojs/*` dependencies carry npm's "Package no longer supported. Contact Support" deprecation. The registry integrity still matches our lockfile.

## What Arctic does for us today (read from `node_modules/arctic`)
It's a thin layer. With Google, it:
1. **Generates `state` and the PKCE verifier:** 32 random bytes each, base64url without padding (`crypto.getRandomValues`).
2. **Builds the authorization URL:** `https://accounts.google.com/o/oauth2/v2/auth` with `response_type=code`, `client_id`, `redirect_uri`, `state`, `scope`, `code_challenge` (S256) and `code_challenge_method=S256`. We add `prompt=select_account`.
3. **Exchanges the code:** a form POST to `https://oauth2.googleapis.com/token` with `grant_type`, `code`, `redirect_uri` and `code_verifier`. The client ID and secret go in an HTTP Basic `Authorization` header, with `Accept: application/json`.
   - A 400 or 401 with an OAuth `error` body throws `OAuth2RequestError`, which we map to `code_rejected`.
   - A network failure throws `ArcticFetchError` ("Failed to send request").
   - Anything else throws.
4. **Decodes the ID token's payload** (base64url JSON, without checking the signature). Our Zod schema then checks the claims, as it does now.

## Decision needed: what replaces it
| Option | What it means |
|---|---|
| **A. A small hand-written adapter** *(recommended)* | About 100 lines in `google-oauth.ts`: the four steps above with `node:crypto` (`randomBytes`, `createHash('sha256')`), `URL`, `fetch` and Zod for the token response. **No dependency to go stale again.** It's Google-only, with the endpoints as constants, which is all we use. **The behaviour matches Arctic exactly**, so the adapter tests can stay as they are. The ID token check stays exactly as reviewed in 3.6: issuer, audience, expiry, no signature check (OIDC Core §3.1.3.7 allows that for a token received directly from the token endpoint over TLS). |
| B. `oauth4webapi@3.8.8` (zero dependencies, OpenID-certified, by the author of `jose` and `openid-client`) | A maintained, certified library that does PKCE, the code grant and the claim checks. It's lower-level than Arctic, so the adapter stays about the same size. **But it checks `iss` strictly** against the metadata (`https://accounts.google.com`), while Google sometimes issues `accounts.google.com`. That breaks our "issuer without a scheme" case unless we work around it. Its error types also differ, so the error mapping and some test stubs change. |
| C. `openid-client@6.8.8` (on `oauth4webapi` + `jose`) | The fullest option: discovery and JWKS signature checks. It **fetches Google's discovery document at startup** and its keys at sign-in, which the tests would have to stub. That's more moving parts than a single-provider sign-in needs. |

The rest of the plan assumes **A**.

## Plan (option A)

### `apps/api/src/modules/identity/infrastructure/google-oauth.ts`
- **Constants:** the authorization and token endpoints, and the scopes (`openid email profile`).
- **`randomToken()`:** `randomBytes(32).toString('base64url')`, used for both `state` and the PKCE verifier, as Arctic does.
- **`codeChallenge(verifier)`:** `createHash('sha256').update(verifier).digest('base64url')`.
- **`start()`:** builds the URL with the same parameters as today, including `prompt=select_account`.
- **`exchange(code, verifier)`:**
  - **The request:** a form-encoded POST with `grant_type`, `code`, `redirect_uri` and `code_verifier`, Basic credentials, and `Accept: application/json`. Each credential is form-URL-encoded before Basic, as RFC 6749 §2.3.1 asks; Google's IDs and secrets have no reserved characters, so it's the same bytes as Arctic sent.
  - **A network error** throws a `GoogleUnreachableError`, with the cause attached, so the route's 5xx path and logging keep working.
  - **A 400 or 401 with `{ error: string }`** gives `{ ok: false, reason: 'code_rejected' }`. Any other status or body throws.
  - **A 200** is parsed with `z.object({ id_token: z.string() })`. A missing `id_token` throws (a broken response, not a bad code).
  - **The ID token:** split on `.`, base64url-decode the payload, `JSON.parse`, then the **existing `IdTokenClaims` checks unchanged**, giving the same `invalid_id_token` cases. A token that isn't a JWT also gives `invalid_id_token`.
- **The rest is unchanged:** `GoogleConfig`, `now` injection, and the claim-to-identity mapping.
- **The file is renamed** `arctic-google-auth.ts` → `google-oauth.ts`, and `createArcticGoogleAuth` → `createGoogleAuth`. `main.ts` changes its import.

### Tests (`google-oauth.test.ts`, the renamed adapter test)
- **Every existing case stays,** with the same stubbed token endpoint and the same assertions.
- **Two edits:**
  - the import name;
  - "throws when Google is unreachable" expects `GoogleUnreachableError` instead of Arctic's "Failed to send request" message.
- **New cases** for code that used to be Arctic's:
  - **Basic auth and `Accept`:** the `Authorization` header decodes to `client-id:client-secret`.
  - **The challenge:** `code_challenge` equals `base64url(sha256(codeVerifier))`, checked against the verifier `start()` returned. That's a real PKCE check, not only the length.
  - **Randomness:** `state` and the verifier are 43 base64url characters (32 bytes).
  - **Responses that throw rather than reject:** a 500 from Google, and a 200 without `id_token`.
  - **A 400 without an OAuth `error` body throws** (it isn't `code_rejected`).
  - **An ID token that isn't a JWT** (no dots, or a payload that isn't JSON) gives `invalid_id_token`.
- **The route tests** (`auth.routes.int.test.ts`, with the fake `GoogleAuth`) aren't touched.

### Dependencies and docs
- `pnpm --filter @feedback-portal/api remove arctic`. Check that the lockfile has no `arctic` or `@oslojs`, and `diff` `pnpm-workspace.yaml`.
- **TECH_STACK's Auth row:** "Google OAuth 2.0 / OIDC using **Arctic**" becomes "authorization code + PKCE, **hand-written** against Google's endpoints (Arctic was used until 3.9: unsupported upstream)", plus the ID token check.

### Out of scope
- **Checking the ID token signature with JWKS.** It isn't required for a token taken straight from the token endpoint, and it would add a key fetch and cache. It's worth revisiting if ID tokens are ever accepted from the browser.
- **A `nonce`** (PKCE and `state` already bind the code to the session), refresh tokens, and revocation. We use none of them.

### Steps
1. Write `google-oauth.ts`, rename the test, and add the new cases.
2. Switch `main.ts` and remove `arctic`. Check the lockfile.
3. Docs. Run `pnpm check`, do the checks below, and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0. `grep -E 'arctic|oslojs' pnpm-lock.yaml apps/api` finds nothing.
- **Mutations** (on copies, never with `git checkout`):
  - dropping `code_verifier` from the body, or the S256 hash, fails the tests;
  - accepting a 400 without `error` as `code_rejected` fails the tests.
- **Rebuild the Compose stack** and check `/api/auth/google` still gives 302 to Google with the same parameters.
- **You sign in with Google** at http://localhost:5173 (Compose, in Chrome) and land on Batches. The session row exists, and the API logs no errors.
