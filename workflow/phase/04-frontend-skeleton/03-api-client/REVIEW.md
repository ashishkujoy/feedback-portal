# 4.3 API client — Review

## What changed
| File | Notes |
|---|---|
| `apps/web/vite.config.ts` | **`/api` proxy (decision A).** It forwards to `http://localhost:3000` with the prefix stripped, with `changeOrigin: false` so the API's CSRF check sees the web origin. It's shared by `server` and `preview`. |
| `apps/web/src/api/api-fetch.ts` | **`apiFetch(path, { schema, method, body, signal })`** parses a success with the contract. **`apiSend(path, …)`** is for 204s. Both add `/api`, `credentials: 'same-origin'` and `accept: application/json`, and add `content-type: application/json` only when there's a body. Two arrow functions instead of overloads, to match the codebase's style. |
| `apps/web/src/api/errors.ts` | **`ApiError`** (`status`, `code`, `detail`, `errors`, `requestId`) is built from problem+json, or code `internal` when the body isn't problem+json, or `unavailable` with status 0 when the request fails. **`ApiContractError`** (`path`, Zod `issues`) covers a success that breaks its contract. **`isApiError(error, code?)`**. An abort passes through unchanged so Query can cancel. |
| `apps/web/src/api/me.ts` | **`meQuery`**: `['me']`, a 5-minute `staleTime`, and **401 resolves to `null`** (signed out) |
| `apps/web/src/app/query-client.ts` | **`shouldRetry`**: never retries a 4xx `ApiError`; retries anything else once |
| `apps/web/src/identity/roles.ts` | `roleLabels` ("Admin", "Programme manager", "Mentor") and `primaryRole` (the most privileged one) |
| `apps/web/src/ui/avatar.tsx`, `ui/tag.tsx` | **Kuat Avatar:** a round image (`alt=""`, `referrerPolicy="no-referrer"`), or initials on `ee-blue-100` / `ee-blue-700` at 40% size, weight 600. **Kuat Tag** in display mode, `base` colour. |
| `apps/web/src/shell/user-block.tsx`, `viewing-as.tsx`, `use-me.ts` | **The sidebar foot** (avatar, name, role label) and the top bar's **"Viewing as \<Tag\>"**, both from `/me`. Neither is rendered while loading or when signed out. |
| `apps/web/src/test/stub-api.ts`, `render-app.tsx` | `stubApi({ '/me': … })` stubs `fetch` (unknown paths give a 404 problem). `renderApp(path)` renders the real router, shell and Query on a memory history. |
| Tests | `api/api-fetch.test.ts` (9), `api/me.test.ts` (8), `shell/signed-in-user.test.tsx` (4). The navigation tests now run against a signed-out API stub. |
| `apps/web/package.json` | + `@feedback-portal/contracts` (workspace) and `zod@4.6.5`, the same as the API |
| `README.md`, `TECH_STACK.md` | The `/api` proxy and the error model |

## How to verify
```sh
pnpm check                                   # contracts 52 + web 25 + api 293
pnpm --filter @feedback-portal/api dev & pnpm dev:web
curl -i localhost:5173/api/health            # 200 from the API
curl -i localhost:5173/api/me                # 401 problem+json
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 52 + **25** + 293 tests (web up from 4). |
| `apiFetch` / `apiSend` tests | The exact `fetch` call, both bodyless and JSON. Parsing, `ApiContractError` with the issue path, `ApiError` with every problem field (and `isApiError` by code), an HTML 502 giving `internal`, a network failure giving `unavailable`, an abort passed through, a 204 giving `undefined`, and a 403 on `apiSend`. |
| `meQuery` / retry tests | 200 gives the user, 401 gives `null`, 500 rejects. 401, 403, 404 and 409 are never retried; 503, status 0 and other errors are retried once. |
| Shell tests | An admin gets initials "AL", name, "Admin" and "Viewing as Admin". `avatarUrl` gives an `<img alt="">` instead of initials. `['mentor','program_manager']` shows as "Programme manager". **Signed out:** no user block and no "Viewing as", the page renders, and `/api/me` was called **once** (a 401 isn't retried). |
| Through the proxy (curl) | `/api/health` gives **200** `{"status":"ok"}`. `/api/me` gives **401** problem+json. |
| Browser, dev server | **Signed out:** no user block and no "Viewing as". **With a session** (a test admin and mentor inserted into the DB, with the cookie set for `localhost`): the sidebar foot shows **"MW · Manual Webcheck · Admin"**. The avatar is 28px on `ee-blue-100` with `ee-blue-700` text at 11.2px/600, the block has a 1px top border at 14% white and padding 12px 8px, and the name is 13px/500. The top bar reads **"Viewing as Admin"**, with a Tag of padding 8px 10px at 14px/21px, weight 500. |
| Browser, production build (`vite preview`) | **One** `/api/me` per page load. Dev shows two, 2ms apart, because React StrictMode mounts twice and Query cancels the first request (its `signal` is passed to `fetch`). **Logout through the proxy:** `POST /api/auth/logout` from the page passed CSRF with **204**, the cookie was cleared, `/api/me` then gave 401, and a reload showed the signed-out shell. The test user was deleted afterwards. |

## Decisions & trade-offs
- **Decision taken (A):** the API stays at `/`, and the proxy strips `/api`. No API changes.
- **`apiFetch` and `apiSend` instead of one overloaded function.** Overloads need function declarations, and the codebase uses arrow functions throughout. Two names also make "this call has no response body" explicit at the call site.
- **A 401 on `/me` is data (`null`), not an error.** 4.4's guard can then branch without try/catch, and the signed-out shell doesn't flash an error.
- **Google avatars load from Google's image host.** That's the one third-party request, and only for users who have a Google photo. `referrerPolicy="no-referrer"` keeps our URLs out of it. A future CSP will need `img-src` to allow `lh3.googleusercontent.com`.
- **The most privileged role is shown.** The design shows one role and has no switcher; this is a display rule only, so access is still decided by the API.

## Deviations from plan
- **`vite preview` gets the proxy too.** I needed it to check the production build. It's the same config object, so dev and preview can't drift.
- **`apiSend` was added.** The plan had one `apiFetch` returning `undefined` without a schema; see above.

## Not done / follow-ups
- **4.4:** the sign-in page, the route guard (on `meQuery` → `null`), logout in the user menu, invalidating `['me']`, role-based nav, and Google sign-in through the proxy (`GOOGLE_REDIRECT_URI=http://localhost:5173/api/auth/google/callback`).
- **The Compose API (production mode)** uses the `__Host-session` cookie, which a browser only accepts over HTTPS or on localhost. 4.6 confirms the full Compose stack.
