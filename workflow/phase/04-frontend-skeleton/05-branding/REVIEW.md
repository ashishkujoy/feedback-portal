# 4.5 Branding — Review

## What changed
| File | Notes |
|---|---|
| `packages/contracts/src/settings.ts` (+ test) | **`SettingsResponse`**: `{ programName, orgName }`, both non-empty strings |
| `apps/api/src/shared/http/settings.routes.ts` (+ test) | **`GET /settings`** returns `config.branding` parsed through the contract, with `Cache-Control: public, max-age=300`. **Public**, mounted next to `/health`. `AppDeps` gains `branding`, `main.ts` passes `config.branding`, and the test deps use neutral `testBranding`. |
| `apps/web/src/api/settings.ts` | **`settingsQuery`**: `['settings']`, `staleTime: Infinity`, **`retry: false`** (see Deviations) |
| `apps/web/src/app/routes.tsx` | **The root route's `beforeLoad`** awaits `ensureQueryData(settingsQuery)`, so the names are there on the first render. A failure is caught, and the app renders without them. |
| `apps/web/src/branding/use-settings.ts`, `root-layout.tsx` | `useSettings()`. **`RootLayout`** renders the `Outlet` and sets `document.title` to "\<Program\> · Mentor portal" once settings load. `index.html` keeps the neutral "Feedback portal" until then. |
| `apps/web/src/shell/sidebar.tsx` | **The program name** joins the brand block above "Mentor portal" (16px/600, white, tracking -0.2px, gap 2px, from 4.2's measurements). Nothing renders without settings. |
| `apps/web/src/pages/login-page.tsx` | **Decision 1A:** the sidebar's brand pair, recoloured for the light card (the program name at 16px/600 in `--foreground`, "Mentor portal" at 12px muted). **Decision 2A:** the hint reads "Use the \<Org\> Google account an admin added for you.", or the earlier generic wording without settings. |
| `apps/web/src/test/stub-api.ts` | `/settings` answers with **`testSettings`** ("Test Programme", "Test Org") by default; a test can override it |
| Tests | **`branding/branding.test.tsx`** (7 new). In `login-flow.test.tsx`, the hint now names the org, and after sign-out the cache holds `me` plus the reloaded `settings` and nothing else. |
| `README.md`, `design/README.md` | `GET /settings` is under the API endpoints. "Web app" says where the names show. The design README covers the brand block and the sign-in card's branding. |

## How to verify
```sh
pnpm check                              # contracts 54 + web 49 + api 295
curl -i localhost:5173/api/settings     # API and pnpm dev:web running
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 54 + **49** + **295** tests (+2, +7, +2). |
| Contract tests | Both names are accepted. An empty or missing name is rejected. |
| API tests | 200 without a session, `cache-control: public, max-age=300`, and the body matches the contract. **Only** the two names are returned (`toStrictEqual`). |
| Web tests | The program name sits directly above "Mentor portal" in the sidebar, and shows on the sign-in card. The hint names the org. The tab title is "Test Programme · Mentor portal". **Other names from `/settings` show instead** (nothing comes from the code). **With `/settings` returning 503,** Batches still renders with no name in the sidebar, and the sign-in hint uses the generic wording. **`/settings` is fetched once** across Batches → Users and roles → Batches. |
| Through the proxy (curl, the Compose API rebuilt with this change, plus `pnpm dev:web`) | `GET /api/settings` with **no cookie**: **200**, `cache-control: public, max-age=300`, and the names from `apps/api/.env`. |
| No names in the web app | I took the names the API served and `grep`ped `apps/web/src`, `apps/web/index.html` and the production build in `apps/web/dist`: **no matches** for either. |
| **Not done: browser** | The Chrome extension is still not connected, so there's no screenshot or computed-style check of the brand block and the sign-in card, and no "change `PROGRAM_NAME`, restart, and see it change" by hand. The tests cover the behaviour, but not the look. |
| **Not done: design re-check** | DesignSync needs `/design-login` again. The brand block uses 4.2's recorded measurements. |

## Decisions & trade-offs
- **Decisions taken: 1A** (the brand pair on the sign-in card) **and 2A** (the org in the sign-in hint).
- **No `app_settings` table.** The template's goal said so, but ROADMAP and TECH_STACK say config only.
- **The first page waits for `/settings`.** That avoids the names popping in. The cost is one extra request in front of the first render, after which settings are cached for the session.
- **A failed `/settings` is retried on the next navigation, not straight away** (`retry: false`, and no data means `ensureQueryData` fetches again). While the API is answering errors, each navigation pays for one failed request.
- **Sign-out still clears the whole cache**, and the root route reloads `settings` before the sign-in page renders. The names aren't user data, but one rule ("clear everything") is simpler than a list of exceptions.
- **5-minute HTTP caching** means a renamed program can take up to 5 minutes to show in an open browser after the API restarts. The web app's own cache lasts until a reload.

## Deviations from plan
- **`settingsQuery` doesn't retry.** The plan kept the default (one retry on 5xx). The tests showed that the retry's back-off holds the first page for about a second when `/settings` fails, and a late retry from one test leaked into the next test's fetch stub.
- **Browser and design checks weren't done** (see above).

## Not done / follow-ups
- **Browser check** of the brand block, the sign-in card and the title, when the extension is reconnected.
- **A design re-check** after `/design-login`.
- **4.6:** nginx must forward `/api/settings` like any other `/api` path. Nothing special is needed.
