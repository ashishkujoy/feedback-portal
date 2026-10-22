# 4.4 Login flow — Review

## What changed
| File | Notes |
|---|---|
| `apps/api/src/modules/identity/http/auth.routes.ts` (+ test) | When Google isn't configured, `/auth/google` and `/auth/google/callback` **redirect to `<WEB_APP_URL>/login?error=unavailable`** instead of answering 503 JSON. Both are browser navigations. The `unavailable` error kind stays in `AppError` for other uses. |
| `apps/api/src/shared/config/config.ts` (+ test), `.env.example` | **The `GOOGLE_REDIRECT_URI` default is now `http://localhost:5173/api/auth/google/callback`**, through the web app's proxy, so the session cookie is set on the web origin |
| `apps/api/src/shared/telemetry/telemetry.int.test.ts` | Requests the callback with `redirect: 'manual'` (it now redirects to the web app, which isn't running in that test) |
| `apps/web/src/app/routes.tsx` | **`/login`** (no shell) uses `validateSearch` for `error`, and a signed-in visit goes to `/batches`. **The pathless `app` layout** (the shell) has `beforeLoad: ensureQueryData(meQuery)`: `null` goes to `/login`, otherwise it returns `{ me }` as route context. **`/users`** sends non-admins to `/batches`. **A catch-all `$`** inside the layout shows "Page not found" in the shell, and unknown paths sign in first. The breadcrumb label can depend on the user (`crumb: batchesLabel`). |
| `apps/web/src/app/create-app.ts` | **`createApp({ history? })`** wires the query client and router together. A 401 from any query or mutation (`QueryCache` / `MutationCache` `onError`) sets `me` to `null` and navigates to `/login`. It's used by `main.tsx` and the tests. |
| `apps/web/src/shell/app-shell.tsx` | Renders `<Navigate to="/login">` if `/me` becomes `null` (a refetch finds the session gone) |
| `apps/web/src/pages/login-page.tsx`, `ui/callout.tsx`, `ui/google-sign-in-button.tsx` | **The sign-in screen (decision 1A):** a flat card, max 400px, `p-8`, on `--muted`; "Mentor portal", "Sign in" at 24px/600, and the hint. An `issue` Callout for `sign_in_failed` (and any unknown error); a `warning` Callout for `unavailable`. The **outline Google button** is a link to `/api/auth/google` with Google's four-colour "G". **Kuat Callout:** a `--callout-*` tint, a 4px left accent, a 24px Lucide icon, the title at 16/24 weight 600, and the description at 14/21. |
| `apps/web/src/shell/sign-out-button.tsx`, `identity/sign-out.ts`, `shell/user-block.tsx` | **Sign out (decision 2A):** a `log-out` icon button at the right of the user block. `signOut` POSTs `/auth/logout`, ignores a failure, `clear()`s the cache, sets `me` to `null` and goes to `/login`. |
| `apps/web/src/identity/roles.ts`, `shell/sidebar.tsx`, `pages/batches-page.tsx`, `ui/breadcrumb.tsx` | `isAdmin` and `batchesLabel`. "Users and roles" shows for admins only. **"My batches"** shows for mentors (primary role) in the nav, title and crumb. |
| `.oxlintrc.json` | The web override allows **only TanStack's `Redirect`** for `typescript/only-throw-error` (`{ from: "package", name: "Redirect", package: "@tanstack/router-core" }`), so guards use the idiomatic `throw redirect(…)`. Throwing any other non-Error still fails (checked). |
| `apps/web/src/test/stub-api.ts` | Replies keyed by `"METHOD /path"` or `"/path"`, changeable mid-test. Adds `problem`, `signedInWith(roles)` and `userWith`. |
| Tests | **`app/login-flow.test.tsx`** (18 new). The navigation tests now run as a signed-in admin. The signed-out shell test moved here as guard tests. |
| `README.md`, `design/README.md` | Google setup uses the web-origin redirect URI and http://localhost:5173. "Web app" covers the sign-in, roles and sign out. **New design-README section "Screens the design doesn't have"** describes the sign-in screen, the sign-out button and not found as built, for a designer to replace. |

## How to verify
```sh
pnpm check   # contracts 52 + web 42 + api 293
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 52 + **42** + 293 tests (web up from 25). |
| Guard tests | Signed out, `/batches`, `/users`, `/` and `/nope` all go to `/login`. Signed in, `/login` goes to `/batches`. A mentor or PM at `/users` goes to `/batches`. |
| Sign-in page tests | The heading and hint show, and the Google link's `href` is `/api/auth/google`. No Callout by default. `sign_in_failed` and an unknown error show "We couldn't sign you in"; `unavailable` shows "Google sign-in isn't set up". |
| Role tests | An admin sees `['Batches', 'Users and roles']`. A PM (also a mentor) sees `['Batches']`. A mentor sees `['My batches']`, the `h1` "My batches" and the current crumb "My batches". |
| Sign-out tests | The button POSTs `/api/auth/logout`, lands on `/login`, `me` is `null`, and the cache holds only `['me']`. A 503 from logout still lands on `/login`. |
| Mid-session tests | A 401 from another query goes to `/login`. A refetch of `/me` returning 401 goes to `/login`. |
| Tests catch the bug | **Without both** the layout's guard and the shell's redirect, 5 tests fail. Without only one, nothing fails: they back each other up (the guard prevents rendering; the shell catches a later refetch). |
| API tests | Unconfigured `/auth/google` and `/auth/google/callback` return 302 to `/login?error=unavailable` with no cookies. The config default is the web-origin redirect URI. |
| By hand, through the proxy (curl; local API + `pnpm dev:web`) | `GET /api/auth/google` (Google unconfigured) gave **302 → `http://localhost:5173/login?error=unavailable`**. `/login` gave 200 HTML from the web app. `/api/me` returned the test admin and the test mentor. `POST /api/auth/logout` from the web origin gave **204**, the admin's session row was **deleted**, and the old cookie then got **401**. Test users deleted afterwards. |
| **Not done: browser** | The Chrome extension wasn't connected (the session's account changed), so I didn't check: the sign-in page's computed styles and a screenshot, the sign-out button in the page, a mentor's nav, or a real Google sign-in (which needs your OAuth client anyway). The tests above cover the behaviour, but not how it looks. |

## Decisions & trade-offs
- **Decisions taken (1A, 2A, plus the `unavailable` redirect).**
- **Signing out is enforced twice,** by the route guard (no flash of the shell) and by the shell (a later `/me` refetch). The tests cover the combination; see above.
- **Not found moved into the guarded layout** as a `$` route. A pathless layout's `notFoundComponent` isn't used for unmatched paths, which the existing test caught. As a side effect, a signed-out visitor to an unknown URL is asked to sign in first rather than told the page doesn't exist, which avoids revealing routes.
- **No `returnTo` after sign-in** (the API always lands on `/`). A deep link opened while signed out lands on Batches.
- **Sign-out failures are silent.** The user asked to leave, and the server session expires on its own. `no-console` would otherwise need a suppression.

## Deviations from plan
- **Not found is a `$` route** instead of `notFoundComponent` (see above).
- **The shell's `<Navigate>` on `me === null`** wasn't in the plan; it closes the "refetch finds the session gone" gap.
- **The browser checks weren't done** (see "How to verify").
- **The manual "delete the session row, then click a nav item" check was dropped.** Navigating doesn't refetch `/me` (5-minute `staleTime`), and no page loads data yet, so it wouldn't redirect until the next refetch. The two mid-session tests cover the mechanism.

## Not done / follow-ups
- **Browser checks and a real Google sign-in,** when the extension is reconnected (and you have an OAuth client).
- **4.5:** the program name on the sign-in page and in the sidebar.
- **4.6:** Compose/nginx must forward `/api` the same way, and production's `GOOGLE_REDIRECT_URI` must be `https://<host>/api/auth/google/callback`.
