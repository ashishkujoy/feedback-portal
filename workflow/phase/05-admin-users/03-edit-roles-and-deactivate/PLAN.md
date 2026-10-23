# 5.3 Edit roles and deactivate — Plan

**Phase:** 5 — Admin: users
**Status:** Done

## Goal
Edit roles and deactivate

## Done when
- **An admin changes a user's roles from the Users and roles table,** as several roles (design-README decision 3), using the API from 3.8 (`PUT /users/:id/roles`).
- **An admin removes (deactivates) a user, and can reactivate them** (`POST /users/:id/deactivate` and `/reactivate`). Removing keeps their feedback attributable; they're signed out and can't sign in (DATA_MODEL).
- **Changes show immediately:** the row, the tab counts and the Inactive badge update as soon as the API answers, without reloading the list.
- **The API's rules are respected in the UI:** you can't remove your own admin role or yourself, a user keeps at least one role, and the API's refusals (`cannot_remove_own_admin`, `cannot_deactivate_self`, `user_requires_role`, `last_admin`) are shown if they happen anyway.
- Tests cover these. `pnpm check` passes, and the table matches the design's measurements in the browser.

## What the design shows (A12, read from `* Screen.dc.html` and the Kuat bundle)
- **The grid** is `minmax(0,2fr) minmax(0,2fr) 200px minmax(0,2fr) 100px`, gap 16. The Batches column is still left out until Phase 6 (5.1's decision 3), so here it's Name, Email, Role, then the **100px action column**.
- **Role cell: Kuat Select, `sm`, 180px.**
  - **Trigger:** 32px high, padding 0 12px, gap 8, `--input`, a 1px `--border` (`--ring` with a 3px 35% ring when open), `--radius-sm`, 14px `--foreground`, and a 16px chevron in `--muted-foreground` that turns over when open.
  - **List:** 4px under the trigger, as wide as it, `--background`, a 1px `--border`, square, `--shadow-lg`, padding 4, max height 240.
  - **Options:** padding 8px 10px, `--radius-md`, 14px. The chosen one has an `--accent` background and a 15px `--primary` check on the right; the others turn `--muted` on hover.
- **Action cell:** a Kuat Button, **`ghost-muted`, `sm`**, "Remove", right-aligned. `sm` is 32px, padding 0 12px, gap 6, 14/500, `--radius-md`. `ghost-muted` is transparent with `slate-700` text, `slate-100` on hover and `slate-200` when pressed.

## Decisions needed

### (1) Editing several roles in the Role cell
| Option | What it means |
|---|---|
| **A. The design's Select, made multi-select** *(recommended)* | The same trigger (180 × 32) shows the roles, most privileged first ("Admin, Mentor"), cut off with "…" if they don't fit. The full list is in its accessible name and a tooltip. **The list lets you tick several:** each option keeps Kuat's check, and choosing one toggles it **and saves at once** (`PUT /users/:id/roles` with the new set). The list stays open, so you can toggle a few in a row; Escape or a click outside closes it. It's a `listbox` with `aria-multiselectable`, ↑/↓/Home/End to move, and Space/Enter to toggle. The header becomes **"Roles"**. |
| B. A row action that opens an "Edit roles" dialog | It reuses 5.2's three checkboxes with a Save button. That's simpler to build, but it adds a second button per row and a dialog the design doesn't have. |

### (2) What the UI stops you doing (and the API rejects anyway)
- **Your own row:** **Admin** is ticked and disabled in your Select, with the hint "You can't remove your own admin role" (shown as the option's description). Your **Remove** button isn't shown; the cell is empty.
- **A user's last role** can't be unticked: it's disabled, with the hint "A user needs at least one role; remove them instead".
- **Anything the API still refuses** (for example `last_admin` after someone else's change) shows an `issue` Callout above the table, "We couldn't update \<Name\>", with the API's `detail`. The row then shows what the server has. The Callout goes away after the next successful change, or with its close button.

### (3) Removing and reactivating
| Option | What it means |
|---|---|
| **A. "Remove" asks first, in a small Kuat Dialog** *(recommended)* | Title "Remove \<Name\>?". Description: "They're signed out and can't sign in. Their feedback and comments stay, and you can add them back." Buttons: outline **Cancel**, and **Remove** (Kuat's `destructive` button, `red-600`). Removing signs someone out at once, so one confirmation is worth it. **An inactive user's button reads "Reactivate"** (same ghost-muted style), which works straight away with no confirmation, since it's harmless. |
| B. No confirmation | "Remove" deactivates at once, and "Reactivate" undoes it. It's faster, but a mis-click signs someone out. |

- **The words:** the UI says **Remove** as the design does; the API and code say *deactivate*. The "Inactive" badge stays as in 5.1.

### (4) How "immediately" works
**The API's answer updates the list in the cache** (`setQueryData` on `['users']`, replacing that user). There's no refetch. Rows, tab counts and the badge change as soon as the request returns, which is about 50 ms locally. While a row is saving, its Select and button are disabled. **Not optimistic:** showing a change before the server accepts it would need undoing when one of the rules above rejects it.

## Plan
- **`api/users.ts`:** `setUserRoles(id, roles)`, `deactivateUser(id)` and `reactivateUser(id)`, each parsing `AdminUser`. Also `replaceUser(queryClient, user)`, which swaps the user into `['users']`.
- **`ui/button.tsx`:** add the `sm` size, plus the `ghost-muted` and `destructive` variants, from kuat-core's tokens.
- **`ui/multi-select.tsx`:** the Kuat Select trigger and list (decision 1A). Props: `label`, `options` (`{ value, label, disabled?, hint? }`), `value`, `onToggle`, `disabled`. The list is `role="listbox"` with `aria-multiselectable="true"` and options with `aria-selected`. The trigger has `aria-haspopup="listbox"` and `aria-expanded`. Focus goes to the list when it opens and back to the trigger when it closes.
- **`users/user-actions.tsx`:** `useUserChange()`, one mutation per row, for roles, deactivate and reactivate. It writes the response into the cache and reports errors to the page's Callout.
- **`users/remove-user-dialog.tsx`:** the confirmation (decision 3A), on 5.2's `Dialog`.
- **`pages/users-page.tsx`:** the Role cell becomes the multi-select, and the 100px action column and its header cell come back. The signed-in user (`/me`) gets the own-row rules. The column widths become the design's (2fr 2fr 200px 100px, as cells).

### Tests
- **The multi-select** (unit): it opens and closes (click, Escape, outside click); arrow keys, Home and End move; Space and Enter toggle; disabled options can't be toggled; and its accessible name lists the roles.
- **The page** (stubbed API, signed in as an admin):
  - **Ticking Programme manager** for Grace sends `PUT` with `['mentor', 'program_manager']`. The row and the "Programme managers" count update from the response, with no second `GET /users`.
  - **Your own row:** Admin is disabled, and there's no Remove button.
  - **A user's only role** is disabled.
  - **Remove → the dialog → Remove** sends `deactivate`. The row shows "Inactive" and "Reactivate". Cancel sends nothing.
  - **Reactivate** sends `reactivate` with no dialog, and the badge goes.
  - **A 409 `last_admin`** shows the Callout with the detail, and the row is unchanged.
  - **The row is disabled while saving.**
- **Mutations** (on copies, restored with `cp`): no cache update, the own-row admin rule removed, Remove without the dialog, and the wrong role set sent. Each must fail a test.
- **No API change.** The rules are already covered by 3.8's tests.

### Docs
- **design/README.md:** the 5.1 section's "left out" line, plus "as built in 5.3": the multi-select, the own-row rules, Remove's confirmation and Reactivate, and the error Callout.

### Out of scope
- **The Batches column** (Phase 6).
- **Deleting users.** There's no hard delete: removing is deactivating (DATA_MODEL).
- **Showing a removed user's last sign-in or who removed them.** The design has no place for it.

### Steps
1. The API functions and the Button variants.
2. The multi-select, with tests.
3. The row actions, the Remove dialog and the page, with tests.
4. Docs. Run `pnpm check`, do the browser check, and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- **In the browser** (Compose, headless Chrome, a test admin and a few `@browsercheck.test` users):
  - the Select, its list, the Remove button and the dialog match the measurements above;
  - toggling a role updates the row and the counts;
  - removing signs the user out: their test session row is gone, and `/me` with it gives 401;
  - reactivating works;
  - on your own row, Admin is disabled and there's no Remove.
- The test users are deleted afterwards.
