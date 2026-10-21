# 4.2 Router + Query — Review

## What changed
| File | Notes |
|---|---|
| `apps/web/src/app/routes.tsx` | **New. Code-based routes (decision 2A).** The root route renders `AppShell` and has `notFoundComponent`. `/` redirects to `/batches` with `redirect({ …, throw: true })`, so no lint suppression is needed. `/batches` and `/users` declare `staticData.crumb`, which is typed through `StaticDataRouteOption`. |
| `apps/web/src/app/router.tsx` | `createAppRouter({ queryClient, history? })`, with `defaultPreload: 'intent'` and scroll restoration. `Register` typing makes every `<Link to>` checked against the real routes. |
| `apps/web/src/app/query-client.ts` | `createQueryClient()` with `staleTime` 30s |
| `apps/web/src/main.tsx` | `QueryClientProvider` and `RouterProvider` |
| `apps/web/src/shell/app-shell.tsx`, `sidebar.tsx`, `nav-item.tsx`, `top-bar.tsx` | **The design's desktop shell**, in Tailwind on Kuat tokens with no inline styles. Nav items are router `Link`s, and the active one is styled from `data-status="active"`. The brand block shows "Mentor portal" only: the **logo mark is left out (decision 1A)**, and the program name comes in 4.5. |
| `apps/web/src/ui/breadcrumb.tsx`, `ui/page-title.tsx` | The Kuat Breadcrumb, built from `useMatches()` crumbs: earlier crumbs are links, the last has `aria-current="page"`, and a 14px chevron in `--slate-400` sits between them. The page title is 28/36, weight 600, tracking -0.6px. |
| `apps/web/src/pages/*` | `BatchesPage` and `UsersPage` show only their `h1`. `NotFoundPage` shows "Page not found" with a "Go to batches" link. |
| `apps/web/src/app/navigation.test.tsx` | **New, 4 tests.** It replaces 4.1's placeholder test, and 4.1's `app.tsx` is removed. |
| `apps/web/package.json` | + `@tanstack/react-router@1.170.45`, `@tanstack/react-query@5.104.5`, `lucide-react@1.60.0` (1.61.0 was published today), and the dev dependency `@testing-library/user-event@14.6.8`. No release-age exclusions. |
| `design/README.md` | "Shell measurements" (measurements only), a correction that the avatar is at the foot of the sidebar rather than in the top bar, and the logo decision |

## How to verify
```sh
pnpm check       # contracts 52 + web 4 + api 293
pnpm dev:web     # http://localhost:5173 → /batches
```

| Check | Result |
|---|---|
| `pnpm check`, `pnpm build:web` | **Exit 0.** 52 + 4 + 293 tests. The build is 326 kB JS (105 kB gzip). |
| Navigation tests (memory history, user-event) | `/` redirects to `/batches`, with the `h1`, breadcrumb and active item all "Batches". Clicking "Users and roles" moves the URL, `h1`, breadcrumb and `aria-current`; `history.back()` returns. `/nope` shows "Page not found" inside the shell with no active item, and "Go to batches" works. There's exactly one `<main>`, holding the page. |
| Browser, 1440 wide, computed styles against the design | Sidebar **240px**, `oklch(0.435 0.09 240)` (`--tech-blue-500`), padding **20px 12px**. Top bar **56px**, a 1px bottom border, padding **0 28px**. Content padding **28px**, gap **24px**, on `--muted`. Active item: **14% white** fill, white text, padding **9px 10px**, radius **6px** (`--radius-md`), **14px/500**, gap **10px**. Idle item: `--tech-blue-100`. Icons **18×18, stroke 2**. `h1` **28px/36px, 600, -0.6px**. No third-party requests. |
| Browser, by hand | Clicking Users and roles, then browser back and forward, all update the URL, `h1`, breadcrumb and active item. `/nope` shows the not-found page. Screenshots taken of `/batches` and `/nope`. |

## Decisions & trade-offs
- **Decisions taken (A and A):** no logo mark; code-based routes.
- **Only one hover style is added beyond the design:** `hover:bg-white/8` on idle nav items. The design shows only the active and idle states. Kuat's rules say sidebar hover states use low-alpha white, so this follows the design system rather than inventing a style.
- **`<main>` is the content area, not the design's outer column.** The design's `main` wraps the top bar too. Putting `<main>` around the page content keeps one main landmark that skips the chrome, and the layout is identical.
- **The content area scrolls** (`overflow-auto`). The mockup uses `overflow:hidden` because it's a fixed-size frame.
- **Breadcrumb crumbs come from the routes** (`staticData.crumb`). Later pages (a batch, an intern) can add dynamic crumbs from their loaders.

## Deviations from plan
- None beyond the hover state above.

## Not done / follow-ups
- **4.4:** the user block (avatar, name, role label) and "Viewing as \<role\>" from `/me`; hiding Users and roles from non-admins; and "My batches" for mentors.
- **4.5:** the program name in the brand block, and a configurable logo if you want one.
- **Mobile shell:** with the mentor mobile screens.
