# 5.1 Users list page — Review

## What changed
| File | Notes |
|---|---|
| `apps/web/src/pages/users-page.tsx` | **A12, read-only.** The header (title and the decision-4 description), Kuat Tabs with counts, the search field, and a real `<table>` (with a hidden caption) laid out on the design's grid: Name (28px Avatar, name at 500, plus "Inactive" when inactive), Email (muted), and Role as text (decision 1A, most privileged first). Loading leaves the table empty, an error shows an `issue` Callout, and nothing matching shows a single row (decision 5). |
| `apps/web/src/app/routes.tsx` | `/users` gets `validateSearch` with `role` (a contract `Role`) and `q`. Bad values are dropped (`.catch(undefined)`). |
| `apps/web/src/api/users.ts` | `usersQuery`: `['users']`, `GET /users` parsed as `AdminUser[]` |
| `apps/web/src/users/filter-users.ts` (+ test) | `byRole` (a multi-role user is in each of their tabs), `matches` (name or email, ignoring case and trimmed), `tabCounts` (ignores the search), and **`byName`** (an `Intl.Collator` sort that ignores case and accents; see Deviations) |
| `apps/web/src/ui/tabs.tsx` | **Kuat Tabs:** `tablist` / `tab` / `aria-selected` / `aria-controls`. Only the selected tab is in the tab order, and ←, →, Home and End move and select. Count pills use `ee-blue-100`/`700` when active and Kuat `slate-100`/`600` when idle. There's a visible focus outline (`--ring`). |
| `apps/web/src/ui/search-input.tsx` | **Kuat Input (md)** with a 16px search icon: 260 × 36, `--radius-sm`, and a `--ring` border and 3px ring on focus. `type="search"` with an `aria-label`. |
| `apps/web/src/ui/status-badge.tsx` | **Kuat StatusBadge, `neutral`:** `server-slate-200` / `neutral-950`, flat, 12px/600, 3px 8px |
| `apps/web/src/identity/roles.ts` | `rolesByPrivilege` (Admin, Programme manager, Mentor) |
| `design/README.md` | New section "Users and roles (A12) as built in 5.1" with the five decisions |

## How to verify
```sh
pnpm check     # contracts 54 + web 69 + api 303
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 54 + **69** (+13) + 303. |
| Unit | `byRole`, `matches`, `tabCounts` and `byName` (case and accents) |
| Page tests (12) | Rows with name, email and roles (most privileged first), and "Inactive". Tab counts: All 4, Admins 1, Programme managers 1, Mentors 4. **A tab click filters and sets `?role=`.** **Typing filters and sets `?q=`.** **Typing replaces the history entry**, so Back leaves the page. `/users?role=mentor&q=tur` restores the view. `?role=owner` is ignored. "No users match your search." A 500 shows the error Callout (after Query's one retry). Arrow keys move focus and the selection. |
| Access | **A mentor and a PM** at `/users` land on Batches, and **`/api/users` is never requested.** |
| **Mutations** (a copy of the page, restored with `cp`) | Each is caught: no search filter (3 tests), API role order instead of most-privileged-first, and no Inactive badge. **`replace: true` removed (pushing history per keystroke) wasn't caught at first,** so I added the Back test, which now catches it. |
| **Browser** (the Compose stack rebuilt; headless Chrome over DevTools at 1440 × 900; a throwaway profile; 4 test users and 2 test sessions inserted, **all deleted afterwards**) | **Computed styles match the design:** h1 28/36/600/-0.6px; description 14px muted; tablist gap 4 with a 1px border; active tab 10px 12px, 14/500, `--primary` text and 2px underline; idle tab muted with a transparent underline; pills 18px, 0 5px, 11/600, with the active and idle colours above; search 260 × 36, 0 12px, 1px border, 4px radius; table 1px border on white; header 12px/500 muted on Kuat `slate-50`, padding 10px with 16px at the sides; cells 10px / 16px, 14px; Role column 224px (200 + gaps); Inactive badge `server-slate-200`, 12/600, 3px 8px, flat; content gap 24px. `?role=mentor&q=check` restored the view. **A test mentor at `/users` landed on "My batches"**, with only "My batches" in the nav. I checked two screenshots by eye. |

## Decisions & trade-offs
- **All five decisions taken as recommended:** role text, the Inactive badge, columns and buttons deferred, the new description, and the three states.
- **A `<table>`, not CSS grid rows.** That gives proper semantics for screen readers. The design's grid is reproduced with `table-fixed`, two equal columns, a 224px Role column and cell padding that adds up to the 16px gaps.
- **"Programme manager, Mentor" wraps** in the 200px Role column. That's accepted with decision 1A; 5.3 replaces the column's contents anyway.
- **Counts include inactive users** (decision 2A), so a tab's count matches what it lists.

## Deviations from plan
- **No blank action column.** The plan kept the design's empty 100px column for 5.3's Remove; it now comes with 5.3, since an empty column only adds width.
- **Sorted in the page by `Intl.Collator`.** The browser check showed the API's `ORDER BY name` is case-sensitive, so a lower-case name came after every capitalised one. The page now sorts ignoring case and accents. **Follow-up:** the API's order could be fixed too (`lower(name)` or a collation).
- **Table header weight:** the first browser check found `th` at 700 (the browser default), not 500. It's fixed with `[&>th]:font-medium` and re-checked.
- **Added test:** Back after typing (see Mutations).

## Not done / follow-ups
- **5.2 Add user** (the button in the header row), **5.3** (editing several roles, Remove/deactivate, the action column).
- **The Batches column** in Phase 6.
- **The API's name order** (see above).
