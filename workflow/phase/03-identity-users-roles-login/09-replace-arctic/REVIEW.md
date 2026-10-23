# 3.9 Replace Arctic — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/identity/infrastructure/google-oauth.ts` (renamed from `arctic-google-auth.ts`) | **`createGoogleAuth`, hand-written (decision A).** Same `GoogleAuth` port and same behaviour as Arctic: **`state` and the PKCE verifier** are 32 random bytes in base64url (`node:crypto`). **The S256 challenge** is `sha256(verifier)` in base64url. **The authorization URL** has the same parameters, plus `prompt=select_account`. **The token request** is a form POST with `grant_type`, `code`, `redirect_uri` and `code_verifier`, **Basic client credentials** (each part form-encoded, RFC 6749 §2.3.1) and `Accept: application/json`. **The ID token claim checks are unchanged.** |
| Same file: errors | A network failure throws **`GoogleUnreachableError`** (with `cause`). A 400 or 401 with an OAuth `error` gives `code_rejected`. A 400 or 401 without one, any other status, a non-JSON body or a 200 without `id_token` **throws**, and the route's existing catch logs it and redirects to `sign_in_failed`. An ID token that isn't a JWT, or whose payload isn't JSON, gives `invalid_id_token`. |
| `google-oauth.test.ts` (renamed) | **The 10 existing cases were kept.** Only the import changed, and "unreachable" now expects `GoogleUnreachableError` instead of Arctic's message. **8 new cases:** Basic credentials and headers; the challenge equals `sha256(verifier)`; 43-character tokens; throwing on a 500, a 200 without `id_token`, non-JSON and a 400 without `error`; and a non-JWT or non-JSON ID token giving `invalid_id_token`. |
| `apps/api/src/main.ts` | `createGoogleAuth` instead of `createArcticGoogleAuth` |
| `apps/api/package.json`, `pnpm-lock.yaml` | **`arctic` removed.** The lockfile has **no `arctic` or `@oslojs`** (0 matches). `pnpm-workspace.yaml` is unchanged (`diff`). |
| `TECH_STACK.md` | The Auth row: hand-written code + PKCE (S256), why there's no signature check, and that Arctic was used until 3.9 |

## How to verify
```sh
pnpm check                                       # contracts 54 + web 52 + api 303
grep -cE 'arctic|oslojs' pnpm-lock.yaml          # 0
docker compose up -d --build --wait && open http://localhost:5173   # sign in (Chrome)
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 54 + 52 + **303** (API +8). |
| **The old tests against the new adapter** | Before editing them, with only the import renamed: **9 of 10 passed**. The one failure was the expected Arctic-specific message ("Failed to send request"), now `GoogleUnreachableError`. |
| Route tests | `auth.routes.int.test.ts` and `sign-in-with-google` are **untouched**, and they pass. |
| **Mutations** (on a copy of the file, restored with `cp`, never `git checkout`) | Each fails at least one test: dropping `code_verifier` from the body; a plain (not S256) challenge; treating any 400 as `code_rejected`; skipping the audience check; 16-byte tokens. |
| **Against Google** (from the API container, with your client) | A token request with a bogus code and **your real credentials** gave **`400 invalid_grant`**: the client authenticated and only the code was refused. With a **wrong secret** it gave **`401 invalid_client`**. So the Basic encoding is what Google accepts. The probe script was deleted from the container afterwards. |
| Compose | Rebuilt; all services healthy. `/api/auth/google` gives 302 to `accounts.google.com/o/oauth2/v2/auth` with `response_type=code`, `scope=openid email profile`, `code_challenge_method=S256`, `prompt=select_account`, the web-origin `redirect_uri`, and a 43-character `state` and `code_challenge`. No API errors logged. |
| **Not done: a full Google sign-in** | It needs you to pick the account. In Chrome at http://localhost:5173, sign in and land on Batches. That's the last step of the plan's verification. |

## Decisions & trade-offs
- **Decision taken: A** (hand-written, no dependency).
- **Strictness: a 400 or 401 without an OAuth `error` body now throws.** Arctic threw there too (`UnexpectedErrorResponseBodyError`), so the behaviour is the same; it's just tested now.
- **`GoogleUnreachableError` is a class,** because tests and callers match it with `instanceof`. That's the codebase's rule for when to use classes.
- **No ID token signature check**, as before (OIDC Core §3.1.3.7). It's out of scope, and worth revisiting only if ID tokens ever come from the browser.

## Deviations from plan
- **Colima had stopped** (the machine restarted overnight). I started it, per your standing instruction.
- **Added: the live probe of Google's token endpoint.** It wasn't in the plan, but it's the only check that the Basic encoding is what Google actually accepts.

## Not done / follow-ups
- **Your Google sign-in through Compose** (Chrome).
