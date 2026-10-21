# 4.2 Router + Query — Plan

**Phase:** 4 — Frontend skeleton
**Status:** Done

## Goal
TanStack Router and TanStack Query providers, plus a layout shell

## Done when
- The app runs inside TanStack Router and TanStack Query providers.
- Every page sits in the **design's desktop shell**: the sidebar and the top bar.
- Clicking **Batches** and **Users and roles** in the sidebar changes the page, the URL and the breadcrumb, and marks the active item. Back and forward work, and an unknown URL shows a not-found page inside the shell.
- Tests cover the navigation. `pnpm check` passes.

## What the design shows (read from the project's `* Screen.dc.html`, desktop)
- **The page:** full height, `display:flex`. The sidebar sits next to a `main` that has a `--muted` background.
- **The sidebar:** **240px**, `--tech-blue-500`, padding 20px 12px, a flex column.
  - **The brand block** (padding 4px 8px 24px, gap 12px):
    - the **logo mark**, 24px high, white (see decision 1);
    - the **program name**: 16px, weight 600, white, tracking -0.2px;
    - **"Mentor portal"** below it: 12px, `--tech-blue-100`.
  - **"Workspace":** 11px, uppercase, tracking 0.08em, `--tech-blue-200`, padding 8px 10px.
  - **Nav items:** an 18px Lucide icon, gap 10px, padding 9px 10px, `--radius-md`, 14px, weight 500.
    - The active item is white on `rgba(255,255,255,0.14)`; the others are `--tech-blue-100`.
    - The items are **Batches** (Lucide `layers`) and **Users and roles** (Lucide `users`). Users and roles is admin-only.
    - For mentors, Batches is labelled "My batches".
  - **The user block** at the bottom (`margin-top:auto`, padding 12px 8px, 1px top border at `rgba(255,255,255,0.14)`): a 28px initials Avatar, the name (13px, weight 500, white) and the role label (12px, `--tech-blue-100`).
- **The top bar:** 56px high, `--background`, a 1px bottom `--border`, padding 0 28px, `space-between`.
  - Left: the **Breadcrumb**. Earlier items are links in `--muted-foreground`, the last is `--foreground` with weight 500, and a 14px `chevron-right` in `--slate-400` sits between them (`text-sm`).
  - Right: **"Viewing as \<Tag\>"** (13px, `--muted-foreground`), using the Kuat Tag in `base` colour.
- **The content area:** padding 28px, a flex column with gap 24px. A page title `h1` is 28px/36px, weight 600, tracking -0.6px.

## Plan

### Decision needed (1): the logo mark in the sidebar
The design uses the **Kuat `Logo` mark**, which is Equal Experts' "bracket" brand mark. But the program and organisation names are **sample content that comes from config**, and the organisation running the program may not be Equal Experts.

| Option | What it means |
|---|---|
| **A. Leave the mark out for now** *(recommended)* | The brand block shows the program name and "Mentor portal" only, with the same spacing. A configurable logo (for example an optional `LOGO_URL` served by `GET /settings`) can be added in 4.5 if you want one. No organisation's mark is hard-coded. |
| B. Use the EE mark as designed | Matches the mockup pixel for pixel, but hard-codes one organisation's brand into the app. |

### Decision needed (2): how routes are defined
| Option | What it means |
|---|---|
| **A. Code-based routes** (`createRoute` in a few `.tsx` files) *(recommended)* | No generated file and no extra Vite plugin. With about a dozen routes in the whole product, the tree stays easy to read. Types are just as strict, through `declare module '@tanstack/react-router' { interface Register … }`. |
| B. File-based routes (`@tanstack/router-plugin` generates `routeTree.gen.ts`) | TanStack's default for large apps. It adds a code generator, and a generated file to format, lint and keep out of reviews. |

The rest of the plan assumes **A** for both.

### What's real in 4.2, and what waits
| Part | 4.2 | Later |
|---|---|---|
| Sidebar, top bar, content area | Built to the design | |
| Nav items and the active state | Real `<Link>`s, with `aria-current="page"` | 4.4 hides **Users and roles** for non-admins and labels Batches "My batches" for mentors, using `/me` |
| Breadcrumb | Built from the matched routes (each route declares its crumb) | Batch and intern names join it when those pages exist |
| Program name | **Not shown yet** (left empty, no placeholder text) | 4.5 (`GET /settings`) |
| User block and "Viewing as" | **Not rendered** until a user is known | 4.4 (from `/me`): Avatar, name, role label, Tag |
| Pages | `/batches` and `/users` show only their `h1` ("Batches", "Users and roles"). `/` redirects to `/batches`. | Phase 5 onward |
| Not found | "Page not found" as the page `h1`, inside the shell, with a link back to Batches | The design has no 404 screen; this is the minimum, using the page-title style |
| Mobile shell (390px, Tech Blue top bar) | Out of scope | The mentor mobile screens (MM1–MM5) bring it |

### Code
```
apps/web/src/
  main.tsx                    # QueryClientProvider + RouterProvider
  app/query-client.ts         # createQueryClient(): sensible defaults (below)
  app/router.tsx              # createAppRouter({ queryClient, history? }) + Register typing
  app/routes.tsx              # root (shell) → index redirect, /batches, /users, notFound
  shell/app-shell.tsx         # sidebar + top bar + <Outlet/>
  shell/sidebar.tsx, shell/nav-item.tsx, shell/top-bar.tsx
  ui/breadcrumb.tsx           # the Kuat Breadcrumb in Tailwind, with Router links
  pages/batches-page.tsx, pages/users-page.tsx, pages/not-found-page.tsx
```
- **Styling:**
  - Tailwind utilities on Kuat tokens: `bg-sidebar`, `text-muted-foreground`, `rounded-md` and the `tech-blue-*` ramp.
  - The design's exact pixel values (240px, 56px, 28px, 18px) use Tailwind's spacing scale where it matches (`w-60`, `h-14`, `p-7`), and arbitrary values only where it doesn't.
  - No inline `style`.
- **Icons:** `lucide-react@1.60.0` (1.61.0 is from today, too new), at 18px with a 2px stroke, as the design specifies.
- **Query defaults:**
  - `staleTime` 30s, so moving between pages doesn't refetch everything.
  - `refetchOnWindowFocus` on, as the default.
  - The retry policy (don't retry 4xx) needs the API's error type, so it comes with the API client in 4.3.
- **Versions:** `@tanstack/react-router@1.170.45`, `@tanstack/react-query@5.104.5`, `lucide-react@1.60.0`, and the test dependency `@testing-library/user-event@14.6.8`. All are more than 1 day old.
- **No devtools in 4.2.** They can come later behind `import.meta.env.DEV` if wanted.

### Tests (Vitest + Testing Library, memory history)
- **`/` redirects to `/batches`.** The page shows "Batches" as the `h1`, the breadcrumb is "Batches", and the Batches nav item has `aria-current="page"`.
- **Clicking "Users and roles"** (user-event) changes the URL to `/users`, the `h1` and breadcrumb to "Users and roles", and moves `aria-current`.
- **Back** returns to Batches.
- **An unknown path** shows "Page not found" inside the shell, and its link goes back to Batches.
- **Accessibility:**
  - The sidebar is a `<nav aria-label="Main">` and the breadcrumb is a `<nav aria-label="Breadcrumb">`.
  - The content area is the page's single `<main>`. The design's outer `main` wraps the top bar too, so `<main>` goes on the content area and the outer element becomes a `div`.
- `app.test.tsx` from 4.1 is replaced by these.

### Docs
- **design/README.md:** a short "Shell" note with the measurements above, so later tasks don't need to re-read the file. It records measurements only, no copied markup or names.
- The two decisions are recorded in this task's REVIEW.

### Out of scope
- **The API client and `/me`:** 4.3. **Sign-in, the route guard, the user menu and logout:** 4.4. **`GET /settings`:** 4.5.
- **The mobile shell:** see above.
- **Real page content** (batch cards, the users table): Phase 5 onward.

### Steps
1. Add the dependencies (with the release-age check). Write `query-client.ts`, the router and the routes.
2. Shell: the sidebar, nav items, top bar and Breadcrumb, built to the design.
3. The pages and not-found. Wire up `main.tsx`.
4. Tests. `pnpm check`, then a browser check against the design: a side-by-side screenshot at 1440 wide, checking the measurements with computed styles. Write `REVIEW.md`.

### Verification
- `pnpm check` exits 0, and `pnpm build:web` succeeds.
- In the browser at 1440 wide:
  - the sidebar is 240px and Tech Blue, the top bar is 56px, and the content padding is 28px;
  - the active item has the 14% white fill;
  - clicking between the two pages updates the URL, the breadcrumb and the active item;
  - back and forward work, and `/nope` shows the not-found page.
