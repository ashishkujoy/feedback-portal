# 5.3 Edit roles and deactivate — Review

## What changed
| File | Notes |
|---|---|
| `apps/web/src/ui/multi-select.tsx` | **The design's Select (`sm`, 180 × 32), choosing several** (decision 1A). The trigger shows the choice ("Programme manager, Mentor", cut off with "…"), named "\<label\>: \<choice\>", with the full list as a tooltip. **The list is a group of real checkboxes** styled as Kuat's options: 4px under the trigger, 180 wide, 1px `--border`, square, `--shadow-lg`, padding 4; options 8px 10px, `--radius-md`; chosen ones are `--accent` with a 15px `--primary` check. **Ticking one toggles it at once and leaves the list open.** Disabled options show their reason under the label, as their description. Escape (focus back on the trigger), a click outside, or tabbing away close it. While `disabled` (a change is saving) the open list keeps focus but ignores toggles (`aria-busy`). |
| `apps/web/src/users/user-row.tsx` | **One row:** name, email, the Roles multi-select, and the action cell. **The rules up front (decision 2):** your own Admin and a user's only role are disabled, with the reason; **your own row has no Remove.** **Remove** (ghost-muted `sm`) asks first in a Kuat Dialog with a `destructive` Remove (decision 3A); **Reactivate** acts at once. **The API's answer is written into the `['users']` cache (decision 4),** so the row, the counts and the badge update with no reload. On a refusal it reports to the page and refetches. The row's controls are blocked while saving. |
| `apps/web/src/pages/users-page.tsx` | Rows moved to `user-row.tsx`. The **100px action column** is back (2fr 2fr 200px 100px, as cells), and the header reads **"Roles"**, plus a visually hidden "Actions". A refusal shows an `issue` Callout in a `role="alert"`, "We couldn't update \<Name\>", with the API's `detail`; it clears after the next success. |
| `apps/web/src/api/users.ts` | `setUserRoles`, `deactivateUser`, `reactivateUser` (each parsed as `AdminUser`), and `replaceUser(queryClient, user)` |
| `apps/web/src/ui/button.tsx` | **Kuat `sm`** (32px, 0 12px, gap 6), **`ghost-muted`** (`slate-700`, `slate-100` on hover, `slate-200` pressed) and **`destructive`** (`red-600`), from kuat-core's tokens |
| `apps/web/src/pages/users-page.test.tsx` | The list test now expects the action column ("Remove" / "Reactivate") |
| `design/README.md` | "Editing roles and removing users (A12) as built in 5.3"; 5.1's notes updated |

## How to verify
```sh
pnpm check     # contracts 54 + web 91 + api 303
docker compose up -d --build --wait && open http://localhost:5173/users
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 54 + **91** (+13) + 303. `pnpm format:check` is clean. |
| MultiSelect (5) | The trigger's name; it opens on the first option it can change; it toggles and stays open (click and keyboard); a disabled option can't be toggled and is described by its hint; toggles are ignored while disabled, with focus kept; it closes on Escape (focus back), a click outside, or tabbing away. |
| The page (8) | **Ticking** Programme manager for Grace sends `PUT` `['program_manager', 'mentor']`; the trigger and the "Programme managers" count update, **with no second `GET /users`**. **Unticking** Mentor for Alan sends `['program_manager']`. **Your own row:** Admin disabled with its reason, and no Remove. **An only role** is disabled with its reason. **A 409 `last_admin`** shows the alert with the API's reason, the row is unchanged, and the list is reloaded. **While saving** the list is busy and Remove is disabled. **Remove** asks; Cancel sends nothing; Remove sends `deactivate`, the row shows "Inactive", and focus lands on its "Reactivate". **Reactivate** sends `reactivate` with no dialog. |
| **Mutations** (on copies, restored with `cp`) | **12, all caught:** refetching instead of the cache update; no cache update; the own-admin rule removed; Remove on your own row; Remove without the dialog; the wrong set sent on untick; the only-role rule removed; refusals not reported; the Select not blocked while saving; toggles accepted while disabled; Escape not returning focus; tabbing away not closing. **"The wrong set on untick" survived at first:** only ticking was tested, so I added the untick test. |
| **Browser** (Compose rebuilt; headless Chrome at 1440 × 900; a throwaway profile; a test admin with a session, plus three test users, one of them with its own session; **all deleted afterwards**, and your own account is unchanged) | **Columns:** Name 402, Email 402, Roles 216, Actions 124. **Trigger:** 180 × 32, 0 12px, gap 8, 14px, 4px radius, `--border`; when open, `--ring` with the 3px ring; 16px chevron; long choices end in "…". **List:** 4px below, 180 wide, padding 4, 1px border, square, `--shadow-lg`; options 8px 10px, 6px radius, chosen `--accent` with a 15px `--primary` check. **Remove:** 32px, 0 12px, gap 6, 14/500, `slate-700` on transparent, 16px from the table's edge. **Your row** has Admin disabled ("You can't remove your own admin role", 60% opacity) and no button. **Ticking Admin** for a test user saved at once: the trigger and the Admins count (2 → 3) updated and the list stayed open. **Unticking it with Space** set them back. **Escape** closed it with focus on the trigger; a click outside closed it. **Remove:** the dialog (460 wide, the copy above, a `red-600` Remove); after Remove the row shows "Inactive" and "Reactivate", with focus on it. **The removed user is signed out:** their session row was deleted, and `/api/me` with their cookie went from 200 to 401. **Reactivate** worked at once, with no dialog. I looked at three screenshots: the table, the open list, and the Remove dialog. |

## Decisions & trade-offs
- **All four decisions taken as recommended:** the multi-select Select, the rules up front, Remove with a confirmation (Reactivate without), and updating from the API's answer.
- **One change at a time per row,** not across the page: two rows can save at once.
- **A refusal reloads the list** as well as showing the reason, so the page shows what the server has if someone else changed that user.
- **Inactive users' roles can still be edited,** as the API allows. Then reactivating gives them the right roles straight away.
- **"Programme manager" wraps** onto two lines in the 180px list. Kuat's Select would wrap it too at that width.

## Deviations from plan
- **The list is real checkboxes, not a custom `listbox`.** The linter (`jsx-a11y/prefer-tag-over-role`) rejects a hand-made listbox and asks for `<select>`, which can't be styled to the design. With checkboxes, the browser handles focus and checking: **Tab moves between options and Space toggles; there are no arrow keys.** It looks the same, and screen readers announce a group of checkboxes.
- **The refusal Callout has no close button.** It clears after the next successful change. Kuat's Callout has no dismiss in our component, and I didn't want to invent one.
- **The tests found an accessibility bug:** a disabled option's name included its hint ("Admin You can't remove…"). The option is now named by its label alone, and the hint is its description.

## Not done / follow-ups
- **The Batches column** (Phase 6).
- **Phase 5 is complete** with this task.
