# 4.4 Login flow — Plan

**Phase:** 4 — Frontend skeleton
**Status:** Done

## Goal
Login page with the Google button, route guard, user menu, and logout

## Done when
- **Signing in:** a signed-out visit to any page goes to `/login`. **Sign in with Google** runs 3.6's flow **through the web origin**, and the user lands in the app with the session cookie set on that origin.
- **Signing out** returns to `/login`, and the session is gone on the server.
- **Navigation follows the user's roles:** "Users and roles" is visible to, and reachable by, admins only, and mentors see "My batches".
- **A session that expires mid-use** sends the user to `/login`.
- Tests cover each of these. `pnpm check` passes. A real Google round trip is checked by hand (see Verification).

## The design gaps (CLAUDE.md: ask before improvising)
The design project has **no sign-in screen and no sign-out control.** The shell's user block is display-only. Both need your decision.

### Decision needed (1): the sign-in screen
**Recommended (A): build it from Kuat's own authentication pattern**, which ships in `@equal-experts/kuat-core`'s agent docs as `scenarios/authentication.md`, using only tokens and components the design already uses:

```
┌──────────────────────────── bg-muted, full height ───────────────────────────┐
│                                                                              │
│                    ┌──────── card: max 400px, p-8 ────────┐                  │
│                    │  Mentor portal          (12px, muted) │  ← program name │
│                    │                                       │    joins in 4.5 │
│                    │  Sign in               (24px, 600)    │                  │
│                    │  Use the Google account an admin      │                  │
│                    │  added for you.     (muted, 14px)     │                  │
│                    │                                       │                  │
│                    │  ┌ Callout · issue ─────────────────┐ │  ← only after a  │
│                    │  │ ⊗ We couldn't sign you in        │ │    failed sign-in│
│                    │  │   Check you chose the right      │ │                  │
│                    │  │   Google account, or ask an admin│ │                  │
│                    │  │   to add your email.             │ │                  │
│                    │  └──────────────────────────────────┘ │                  │
│                    │                                       │                  │
│                    │  [ G  Sign in with Google          ]  │  ← full width    │
│                    └───────────────────────────────────────┘                  │
└──────────────────────────────────────────────────────────────────────────────┘
```
- **The card** is `bg-card` with a 1px `border` and **flat corners** (`--radius-none`). Kuat's scenario doc suggests 6px, but the design system's own rule, and every card in the design, is flat for static surfaces, so the design wins.
- **The heading** is 24px at weight 600 with tight tracking, as all Kuat headings are; the scenario's "bold" would break the design's type rules.
- **The button** is a full-width **outline** button (`--radius-md`, white background, 1px `border`, `text-sm` weight 500, 40px high) with Google's official multicolour "G" mark (inline SVG) and the text "Sign in with Google". That follows Google's branding rules for custom buttons, and it keeps EE Blue for the app's own primary actions.
- **The error Callout** is Kuat's `issue` type: a runtime-red tint, a left accent and the `XCircle` icon. It's shown when the URL has `?error=sign_in_failed`, which is 3.6's generic failure redirect. The copy doesn't say *why* sign-in failed, because the API deliberately doesn't either.
- **No logo, header or footer.** That's consistent with 4.2's no-logo decision, and there are no legal pages to link to.

**B. Add a sign-in screen to the Claude Design project first** (you or the designer), and build 4.4 from it. Everything else in this plan stays the same; only the screen waits.

### Decision needed (2): signing out
| Option | What it looks like |
|---|---|
| **A. A sign-out icon button in the sidebar's user block** *(recommended)* | Lucide `log-out`, 18px, at the right end of the user block. It's `tech-blue-100`, white on hover with the nav items' 8% white fill, `--radius-md`, a 32px hit area, `aria-label="Sign out"` and a tooltip-style `title`. It needs one click, no new dependency and no menu focus management. |
| B. Clicking the user block opens a small menu with "Sign out" | A flat `bg-card` menu with `--shadow-md`, per Kuat's flat-overlay rule. It needs a menu primitive (Radix or hand-written focus, Escape and outside-click handling) for a single item. |

```
A:  │ (AL)  Ada Lovelace          [⇥] │      B:  │ (AL)  Ada Lovelace       ⌄ │
    │       Admin                     │          │       Admin                │
                                                    ┌──────────────┐
                                                    │ Sign out     │
                                                    └──────────────┘
```
The rest of the plan assumes **A** for both.

## Plan

### Sign-in through the web origin
- **The button is a plain link** to `/api/auth/google`, a full-page navigation rather than `fetch`. Vite (and nginx in 4.6) forwards it to the API's `/auth/google`.
- **The API's `GOOGLE_REDIRECT_URI` default becomes `http://localhost:5173/api/auth/google/callback`**, so Google returns the browser to the web origin. The callback runs on the API through the proxy, and **the session cookie is set on the web origin.** The success redirect (`WEB_APP_URL/`) and the failure redirect (`/login?error=sign_in_failed`) already point at the web app.
- **README "Google sign-in":** register that redirect URI in Google Cloud Console and open http://localhost:5173. This replaces `localhost:3000` in the steps.
- **When Google isn't configured,** `/api/auth/google` answers 503 problem+json. The API now **redirects to `/login?error=unavailable`** instead, so the browser never shows raw JSON. The page then shows a `warning` Callout: "Google sign-in isn't set up. Ask whoever runs this portal to configure it." That's a small change to `auth.routes.ts`, with its test updated. **Is that OK, or should it stay a 503?**

### Routes and guards
```
root
├─ /login                    (no shell)   signed in → redirect to /batches
└─ _app  (pathless, shell)   beforeLoad: me = ensureQueryData(meQuery); null → redirect /login
   ├─ /           → /batches
   ├─ /batches    "Batches" ("My batches" for mentors, in the nav, crumb and title)
   └─ /users      beforeLoad: not admin → redirect /batches
```
- **The guard reads `meQuery`** (from 4.3: `null` means signed out), so the user is fetched once and cached for the shell.
- **There's no "return to the page you wanted".** The API always lands on `/` after Google (3.6 put `returnTo` out of scope), so a deep link opened while signed out lands on Batches after sign-in. It can be added later on both sides.
- **The nav shows "Users and roles" only to admins.** Mentors see **"My batches"**, which matches the design's `bLabel`. Admins and PMs see "Batches".

### Signing out, and sessions that end
- **Sign out:** `apiSend('/auth/logout', { method: 'POST' })` (CSRF passes through the proxy, as verified in 4.3). Then `queryClient.clear()`, so no previous user's data stays in the cache, and `router.navigate({ to: '/login' })`.
- **If logout fails** (the API is down), the cache is still cleared and the user goes to `/login`. The server session then just expires, and a console warning is logged.
- **A session that ends mid-use** (expired, deactivated by an admin, or logged out in another tab) makes any query or mutation return 401. A `QueryCache` / `MutationCache` `onError` hook catches `ApiError` `unauthenticated`, sets `me` to `null` and navigates to `/login`.
- **Login itself never triggers that redirect,** because `/me` returns `null` instead of throwing.

### Code
```
apps/web/src/
  app/routes.tsx                 # + login route, _app layout with the guard, admin guard on /users
  app/query-client.ts            # + onUnauthenticated hook (wired to the router in main.tsx)
  pages/login-page.tsx           # the sign-in screen (decision 1)
  ui/callout.tsx                 # Kuat Callout: issue / warning (info and positive when needed)
  ui/google-sign-in-button.tsx   # outline link-button with the G mark
  shell/sign-out-button.tsx      # decision 2
  shell/sidebar.tsx, nav-item.tsx  # role-aware items and labels
  identity/session.ts            # signOut(queryClient, router)
```
- **No new dependencies.** Icons come from `lucide-react`. The Google "G" is an inline SVG, Google's published mark.

### Tests
- **Guard:**
  - signed out, `/batches` and `/users` go to `/login`;
  - signed in, `/login` goes to `/batches`;
  - a mentor at `/users` goes to `/batches`.
- **Login page:**
  - The heading and copy show, and the Google link's `href` is `/api/auth/google`.
  - `?error=sign_in_failed` shows the issue Callout with its title. `?error=unavailable` shows the warning. No `error` means no Callout.
  - An unknown `error` value shows the generic failure.
- **Role-aware nav:**
  - An admin sees Batches and Users and roles.
  - A PM sees only Batches.
  - A mentor sees only **My batches**, and the page `h1` and crumb say "My batches".
- **Sign out:** clicking the button POSTs `/api/auth/logout`, lands on `/login` with no user, and leaves the cache empty. When logout fails, the user still lands on `/login`.
- **Session ends mid-use:** a query that gets 401 (a stubbed `/api/users`) moves the app to `/login`.
- **API:** the `auth.routes` test for "Google not configured" now expects a redirect to `/login?error=unavailable`, and the config test expects the new redirect URI default.

### Docs
- **README:** "Google sign-in" uses the web-origin redirect URI and http://localhost:5173. "Web app" covers the sign-in page and that `/login` is the only signed-out page.
- **design/README.md:** under "Differences / gaps", the sign-in screen and sign-out control as built in 4.4, so a designer can replace them.

### Out of scope
- **The program name on the sign-in page and in the sidebar:** 4.5. **The web app in Compose:** 4.6.
- **Returning to the requested page after sign-in:** see above.
- **Playwright end-to-end tests:** a real Google login can't run in CI. The flow is covered by route tests with a fake Google (3.6) plus the web tests here.

### Steps
1. API: the redirect-URI default, and the not-configured redirect, with tests.
2. Routes, guards and role-aware nav, with tests.
3. The login page, Callout and Google button, with tests.
4. Sign out and the 401 handling, with tests.
5. Docs. Run `pnpm check`, do the browser checks, and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- **By hand, without Google credentials:**
  - signed out, `/batches` goes to `/login`;
  - the button goes to `/login?error=unavailable` with the warning;
  - with a test session (inserted into the DB), the app shows the user, sign out returns to `/login`, and the session row is gone;
  - as a test mentor, "My batches" shows and Users and roles is hidden;
  - deleting the session row in psql, then clicking a nav item, goes to `/login`.
- **A real Google sign-in needs your OAuth client.** With `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `apps/api/.env`, the redirect URI registered, and your email seeded as admin, sign in at http://localhost:5173. I can drive the browser up to Google's account picker. **You** pick the account and consent, since I don't enter credentials. Then I check the landing page and the session row, sign out, and confirm.
