# 5.1 Users list page — Plan

**Phase:** 5 — Admin: users
**Status:** Done

## Goal
Shows each user's roles and active state

## Done when
- **Admins see every user at `/users`** (from 3.8's `GET /users`): name with avatar, email, roles and whether they're active.
- **The design's role tabs and search work:** All, Admins, Programme managers and Mentors, with counts, plus search by name or email.
- **Non-admins can't reach it.** The menu item is hidden and the route redirects (both from 4.4); this task adds a test that a non-admin never calls `GET /users`.
- Tests cover these. `pnpm check` passes, and the page matches the design's measurements in the browser.

## What the design shows (A12, read from `* Screen.dc.html` and the Kuat bundle)
- **Header row** (`flex`, `align-items:flex-end`, `space-between`, gap 16):
  - the `h1` "Users and roles" (the existing PageTitle: 28/36, 600, -0.6px);
  - under it, at gap 4, a description at 14px in `--muted-foreground`;
  - on the right, a primary **Add user** button with a `plus` icon.
- **Kuat Tabs:** an underline bar with a 1px bottom `--border` and gap 4. Each tab is padding 10px 12px, `text-sm`/500, with a 2px bottom border.
  - The active tab is `--primary` text and border; idle tabs are `--muted-foreground` with a transparent border.
  - **Count pill:** min-width 18, height 18, padding 0 5px, fully rounded, 11px/600. Active: `ee-blue-100` / `ee-blue-700`. Idle: `slate-100` / `slate-600`.
  - Tabs: **All, Admins, Programme managers, Mentors**.
- **Search:** the Kuat Input (md), 260px wide, 36px high, padding 0 12px, a 1px `--border` that turns `--ring` with a 3px 35% ring on focus, `--radius-sm`, `--input` background. It has a 16px `search` icon in `--muted-foreground` and the placeholder "Search by name or email".
- **Table:** `--background` with a 1px `--border`, flat.
  - Columns: `minmax(0,2fr) minmax(0,2fr) 200px minmax(0,2fr) 100px`, gap 16.
  - **Header:** padding 10px 16px, 12px/500, `--muted-foreground` on `slate-50`, 1px bottom border. Name, Email, Role, Batches, (blank).
  - **Rows:** padding 10px 16px, 14px, 1px bottom border, centred vertically.
    - Name: a 28px Avatar, gap 10, the name at 500.
    - Email: `--muted-foreground`.
    - Role: a single-value Select (180px).
    - Batches: `--muted-foreground`.
    - A ghost-muted **Remove** button, right-aligned.
- **The page's vertical gap is 24px** (the content area from 4.2).

## Decisions needed (the design and this task don't line up exactly)

### (1) The Role column in a read-only list
The design's Role cell is an editable single-value Select. Editing roles is **5.3**, and design-README decision 3 says users hold **several** roles.

| Option | What it means |
|---|---|
| **A. Plain text, "Admin, Mentor"** *(recommended)* | The role labels (in the order Admin, Programme manager, Mentor) at 14px in `--foreground`, in the 200px column. The least invention. 5.3 replaces it with the multi-role control. |
| B. One Kuat Tag per role | More visual, but the Tag is 37px high (8px 10px padding) and "Programme manager" alone is about 150px, so two or three tags wrap in a 200px column. |

### (2) Showing who is inactive
The design has no inactive users at all.

| Option | What it means |
|---|---|
| **A. A neutral StatusBadge "Inactive" after the name** *(recommended)* | Kuat StatusBadge, `neutral` (`server-slate-200`, flat, 12px/600, padding 3px 8px, no icon). The name also turns `--muted-foreground`. Active users get no badge, so the default case looks exactly like the design. Inactive users stay in their role tabs and counts, and the tab counts include them. |
| B. A fifth tab, "Inactive" | Inactive users are hidden from the other tabs. It's tidier, but someone looking for a person in "Mentors" wouldn't find them. |

### (3) Columns and buttons that belong to later tasks
- **Batches column:** there are no batches until Phase 6. **Recommended: leave the column out** (the grid becomes `2fr 2fr 200px`, then the blank action column) and add it in Phase 6. The alternative is a "—" in every row.
- **Add user** (5.2) and **Remove** (5.3, which deactivates rather than deletes). **Recommended: leave both out** until their tasks, rather than showing buttons that do nothing. The header row keeps its layout, so 5.2 just adds the button.

### (4) The description copy
The design says "Programme managers record and delete feedback". **Deleting feedback isn't allowed** (design-README decision 6). **Recommended:** "Admins manage the portal. Programme managers run their batches and record conversations. Mentors give feedback and comment."

### (5) States the design doesn't draw
- **Loading:** the header, tabs and search render straight away, and the table body is empty (no spinner, as in 4.3's shell).
- **Error:** an `issue` Callout (from 4.4), "We couldn't load users", with the problem's `detail` if there is one.
- **No matches:** a single table row, "No users match your search." at 14px muted. It's also used when a tab is empty.

## Plan
- **`api/users.ts`:** `usersQuery` = `queryOptions({ queryKey: ['users'], queryFn: apiFetch('/users', z.array(AdminUser)) })`. The API already sorts by name, then id.
- **`users/filter-users.ts`** (pure, unit-tested): `byRole(users, tab)`, `matches(user, search)` (case-insensitive on name and email, trimmed) and `tabCounts(users)`.
  - A user with several roles counts in each of their role tabs; All counts everyone.
  - **Counts ignore the search,** as the design's are fixed.
- **The tab and search are kept in the URL** (`validateSearch: { role?: 'admin' | 'program_manager' | 'mentor', q?: string }`), so Back and a shared link keep the view. Typing replaces the history entry instead of pushing one per keystroke.
- **New UI pieces, written to Kuat's specs:**
  - **`ui/tabs.tsx`:** `role="tablist"`, with buttons that have `role="tab"` and `aria-selected`, and arrow-key focus moves between tabs. The table area becomes the `tabpanel`.
  - **`ui/search-input.tsx`:** the Kuat Input with the left icon, `type="search"` and an `aria-label`.
  - **`ui/status-badge.tsx`:** `neutral` now; the other types come later.
- **`pages/users-page.tsx`:** the header and description, Tabs, search, then the table as a real `<table>` styled to the design's grid. That gives correct table semantics for screen readers, with a `<caption>` hidden visually. Rows use the existing Avatar (`sm`, with `avatarUrl`).
- **No API change.**

### Tests
- **Unit:** `filter-users` covers role filtering (a multi-role user is in each tab), search on name and email (case and whitespace), and counts.
- **The page** (stubbed `GET /users`, signed in as admin):
  - every user is listed with email and roles; an inactive user has the "Inactive" badge;
  - the tab counts;
  - clicking "Mentors" filters the rows and sets `?role=mentor`;
  - typing in search filters the rows and sets `?q=`;
  - opening `/users?role=admin&q=ada` restores the view;
  - no matches shows the empty row;
  - a 500 shows the error Callout.
- **Access:** a mentor and a PM going to `/users` land on Batches, and **`GET /users` is never requested.**
- **Tabs:** arrow keys move focus, and `aria-selected` follows the selection.

### Docs
- **design/README.md "Differences / gaps":** the decisions above (role text, the Inactive badge, columns and buttons deferred to later tasks, the description copy, and the states).

### Out of scope
- **Add user (5.2), editing roles, deactivating and reactivating (5.3).**
- **The Batches column** (Phase 6).
- **Pagination.** The design has none, and the user count is small (tens).

### Steps
1. `usersQuery` and `filter-users`, with tests.
2. Tabs, SearchInput and StatusBadge.
3. The page, with URL state, and tests.
4. Docs. Run `pnpm check`, then do the browser check (Compose or `pnpm dev:web`, with test users inserted into the DB) against the design's measurements, and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- **In the browser,** using headless Chrome if the extension is still unavailable:
  - signed in as a test admin, with a few test users (one inactive, one with several roles);
  - computed styles match the measurements above;
  - the tabs and search filter the list;
  - as a test mentor, `/users` lands on Batches.
- The test users are deleted afterwards.
