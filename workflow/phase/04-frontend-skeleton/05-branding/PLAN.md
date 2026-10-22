# 4.5 Branding — Plan

**Phase:** 4 — Frontend skeleton
**Status:** Done

## Goal
`GET /settings` returns `PROGRAM_NAME` and `ORG_NAME` from config, and the UI shows them

> The task template said "`app_settings` table". ROADMAP and TECH_STACK say branding comes **only from config** (required env vars, served by `GET /settings`), and DATA_MODEL has no such table, so this plan follows them: **no table and no migration.**

## Done when
- **`GET /settings`** returns `{ programName, orgName }` from the API's config. It needs no session, because the sign-in page shows the program name too.
- **The program name shows** in the sidebar's brand block (as the design draws it), on the sign-in card and in the browser tab title.
- **No program or organisation name is hard-coded in the web app.** Tests use neutral placeholder names, and a test checks that the names on screen come from `/settings`.
- `pnpm check` passes.

## The design
- **The sidebar brand block is in the design**, and 4.2 measured it (`design/README.md`): the program name at 16px/600, white, tracking -0.2px, above "Mentor portal" at 12px `tech-blue-100`, gap 2px. 4.2 left the name out until now.
- **The design shows no organisation name anywhere** apart from the logo mark, which 4.2 left out. ROADMAP says the UI shows both names, so decision (2) below is about where the org name goes.
- **I couldn't re-read the design project this time.** DesignSync needs authorization again after your account switch. The measurements above come from 4.2. If you run `/design-login` before I implement, I'll re-check the brand block against the source.

### Decision needed (1): the sign-in card's heading
The sign-in screen is ours (4.4, decision 1A). It currently starts with "Mentor portal" as a 12px muted eyebrow.

| Option | What it looks like |
|---|---|
| **A. The same pair as the sidebar** *(recommended)* | The program name at 16px/600 in `--foreground`, above "Mentor portal" at 12px `--muted-foreground`, then "Sign in" as now. The sign-in page then reads like the app's own brand block, recoloured for a light card. |
| B. One eyebrow line | "\<Program\> · Mentor portal" at 12px muted, where "Mentor portal" sits now. Smaller, and the card stays as it is. |

### Decision needed (2): where the organisation name shows
| Option | What it means |
|---|---|
| **A. In the sign-in hint** *(recommended)* | "Use the **\<Org\>** Google account an admin added for you." It tells people which account to pick, the most common sign-in mistake, and adds no new element to the design. |
| B. In the browser tab title only | "\<Program\> · \<Org\>". It's visible, but easy to miss. |
| C. Nowhere for now | `/settings` returns it, and the UI ignores it until a screen needs it. This doesn't meet ROADMAP's "the UI shows them". |

The rest of the plan assumes **A** for both.

## Plan

### Contract (`packages/contracts`)
- **`settings.ts`:** `SettingsResponse = z.object({ programName: z.string().min(1), orgName: z.string().min(1) })`, exported from the index, with tests (it accepts a valid body and rejects empty or missing names).

### API
- **`shared/http/settings.routes.ts`:** `GET /settings` returns `config.branding` parsed through the contract. It's mounted next to `/health` in `createApp`, and `AppDeps` gains `branding`.
- **It's public**, and it returns only these two names, never other config.
- **`Cache-Control: public, max-age=300`.** The names only change when the API restarts with a new config.
- **Tests** (`app.request`): 200 with the configured names, no session needed, the cache header set, and the body matches the contract.

### Web
- **`api/settings.ts`:** `settingsQuery` = `queryOptions({ queryKey: ['settings'], queryFn: apiFetch('/settings', SettingsResponse), staleTime: Infinity })`.
- **Loaded before the first render:** the root route's `beforeLoad` awaits `ensureQueryData(settingsQuery)`, so the names don't pop in after the page shows.
  - **A failure doesn't block the app.** The error is caught, the names stay hidden (as today), and sign-in still works.
  - Query's retry policy (one retry on 5xx or `unavailable`) still applies.
- **`branding/use-settings.ts`:** returns the settings, or `undefined`.
- **Sidebar:** the program name joins the brand block above "Mentor portal", to the design's measurements. Nothing renders in its place when settings are missing (no placeholder text).
- **Sign-in page:** decisions (1A) and (2A). If settings are missing, the hint falls back to the current wording ("Use the Google account an admin added for you.").
- **Tab title:** `<title>` becomes "\<Program\> · Mentor portal", set by a small `useDocumentTitle` effect in the root component. `index.html` keeps its neutral "Feedback portal" until settings load. Per-page titles are out of scope.

### Tests (web)
- `stubApi` gains a `'/settings'` reply with neutral names ("Test Programme", "Test Org"). Every `renderApp` test gets it by default.
- **Sidebar:** shows "Test Programme" above "Mentor portal".
- **Sign-in page:** shows the program name, and the hint names "Test Org".
- **Title:** `document.title` is "Test Programme · Mentor portal".
- **`/settings` failing (503):** the app still renders, there's no name in the sidebar, and the sign-in hint uses the generic wording.
- **The names come from `/settings`:** one test swaps the stubbed names and sees the new ones.
- **`/settings` is fetched once** across navigating between pages.

### Docs
- **README:** "API endpoints" gains `GET /settings`. The "Web app" section says where the names show.
- **design/README.md:** the brand block note says the program name is now shown, and the sign-in section records decisions (1) and (2).

### Out of scope
- **A configurable logo** (for example `LOGO_URL`): not asked for. It can be added to `/settings` later.
- **Per-page titles** ("Batches · \<Program\>").
- **Web in Compose:** 4.6.

### Steps
1. Contract and tests.
2. The API route and tests.
3. `settingsQuery`, the root `beforeLoad`, the sidebar, the sign-in page and the title, with tests.
4. Docs. Run `pnpm check`, do the checks below, and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- `curl -i localhost:5173/api/settings` (through the proxy) gives 200 with the names from `apps/api/.env`, without a cookie.
- `grep` the web app's source and build output for the configured names: no matches.
- **In the browser,** if the extension is connected: the sidebar brand block and the sign-in card show the configured names (computed styles checked against the design's 16px/600 and 12px), and the tab title. Changing `PROGRAM_NAME` and restarting the API changes all three.
