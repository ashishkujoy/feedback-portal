# 5.2 Add user form — Review

## What changed
| File | Notes |
|---|---|
| `apps/web/src/users/add-user-dialog.tsx` | **A13 Add user.** React Hook Form with `zodResolver(CreateUserRequest)` (the shared contract) and defaults `{ name: '', email: '', roles: ['mentor'] }`. Fields: Full name, Email, and **Roles as three checkboxes** (decision 1A). `useMutation(createUser)`: on success it **waits for `['users']` to refetch, then closes**; `email_taken` goes to the email field (focused); any other failure shows an `issue` Callout. The submit is disabled ("Adding…") from the click until the request finishes. The description uses the org name from `GET /settings` (decision 2). |
| `apps/web/src/pages/users-page.tsx` | The primary **Add user** button (16px `plus`) on the right of the header row, opening the dialog |
| `apps/web/src/api/users.ts` | `createUser(body)`: `POST /users`, parsed as `AdminUser` |
| `apps/web/src/ui/button.tsx` | **Kuat Button (md)**, `primary` and `outline`: 36px, 0 16px, gap 8, 14/500, `--radius-md`. Colours (including hover, active and disabled) from kuat-core's `button-variables.css`, now imported in `styles.css`. A focus ring like the inputs'. |
| `apps/web/src/ui/dialog.tsx` | **Kuat Dialog on a native `<dialog>`** with `showModal()`: `slate-900` 55% backdrop, a 1px border, flat, `--shadow-2xl`. The head is 20px 22px 0 (title 20/24/600, description 14px muted, 4px under it) with a 26px close button. The body is 16px 22px 22px. Labelled by the title and described by the description. **An overlay click closes it** (a DOM listener, so no lint suppression), and focus goes back to whatever opened it. Children render only while open, so the form starts fresh. |
| `apps/web/src/ui/text-input.tsx` | **Kuat Input (md)** with `invalid` (a `--destructive` border and `aria-invalid`) and an optional left icon |
| `apps/web/src/ui/search-input.tsx` | Now a `TextInput` with the search icon, so there's one input style. Unchanged in the browser. |
| `apps/web/src/ui/checkbox.tsx` | **Kuat Checkbox:** an 18px box, `slate-300` border, `--primary` with a white check when checked, and a 14px label at gap 8. A real checkbox (visually hidden) underneath, so the keyboard, labels and forms work. |
| `apps/web/src/ui/field.tsx` | **Kuat Field** (label, control, then the error or help at 12px, gap 6), and `FieldSet` for the roles group (`fieldset`/`legend`, described by its message) |
| `apps/web/src/test-setup.ts` | **A small `<dialog>` shim:** jsdom has no `showModal`/`close`. It toggles `open`, and Escape fires `cancel` then `close`. Focus trapping is checked in the browser instead. |
| `apps/api/.../users.routes.int.test.ts` | **"Lets the added user sign in with Google" extended:** after `POST /users` and the callback, **the session cookie works and `GET /me` returns the admin's name and roles**. The test already existed from 3.8; it now covers the whole path. |
| `apps/web/package.json`, `pnpm-lock.yaml` | `react-hook-form@7.90.0`, `@hookform/resolvers@5.9.2`. `pnpm-workspace.yaml` is unchanged (`diff`). |
| `design/README.md`, `TECH_STACK.md` | "Add user (A13) as built in 5.2"; the Forms row gets the versions |

## How to verify
```sh
pnpm check     # contracts 54 + web 78 + api 303
docker compose up -d --build --wait && open http://localhost:5173/users
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 54 + **78** (+9) + 303. `pnpm format:check` is clean. |
| Web tests (9, `add-user.test.tsx`) | **It opens** on Full name, described by the org copy, with only Mentor checked. **Cancel and Escape** close it with no request, and focus goes back to Add user. **It starts empty** after being closed. **Empty submit:** "Name is required" (focused, `aria-invalid`), "Invalid email address", and "At least one role is required" on the Roles group, with no request. **Errors clear as you type.** **Success:** the body is `{ name: 'Grace Hopper', email: 'grace@example.com', roles: ['admin', 'mentor'] }` (trimmed and lower-cased), the dialog closes, Grace is in the list, and focus is on Add user. **`email_taken`:** under Email, focused, values kept. **A 500:** the Callout. **A double click** sends one request, and the button shows "Adding…", disabled. |
| API | The added user signs in, and `/me` has their name and roles |
| **Mutations** (on copies, restored with `cp`) | Each is caught: no `zodResolver` (3 tests), no invalidation, `email_taken` not mapped, no focus return, no initial focus, the submit never disabled, and `mutate` instead of awaiting `mutateAsync`. **The last two weren't caught at first:** the stubbed POST answered instantly, so the clicks never overlapped. The test now holds the POST until both clicks land. |
| **Browser** (the Compose stack rebuilt; headless Chrome at 1440 × 900; a throwaway profile; a test admin and session, **and the 1 user added through the dialog, all deleted afterwards**) | **The button:** 36px, 0 16px, gap 8, 14/500, 6px radius, `ee-blue-500` on white, 16px icon, bottom- and right-aligned in the header. **The dialog:** 480 wide, centred, 1px `--border`, square, `--shadow-2xl`, white; backdrop `slate-900` at 55%. Title 20/24/600 at 20px 22px inside the border; description 14/21 muted, 4px under it; close 26px, muted. Labels 14/500; inputs 36px, 0 12px, 4px radius, `--ring` border and the 3px ring on focus; field gap 6, form gap 16, body padding 16 22 22. Checkboxes 18px, `slate-300` when off, `--primary` when on, label gap 8. Help 12px muted. Footer: 1px top border, 16px above, gap 8, right-aligned; Cancel outline in `ee-blue-500`. **Errors:** a `--destructive` border and a 12px `--destructive` message under each field. **Behaviour:** focus starts on Full name; **Tab stays in the dialog** (name → email → the three roles → Cancel → Add user → close → name); empty submit shows the three errors and focuses the name; adding a user closes the dialog, puts them in the list ("Programme manager, Mentor") and focuses Add user; adding the same email again shows "A user with this email already exists." on the focused email field; **Escape and an overlay click close it** (a click inside doesn't), with focus back on Add user. I looked at two screenshots: the dialog, and its errors. |

## Decisions & trade-offs
- **All four decisions taken as recommended:** checkboxes, the copy, the behaviour, and the versions.
- **The dialog waits for the refetched list before closing,** so the new user is there as it closes. If the refetch fails, it still closes, and the list shows its own error.
- **`mutateAsync` inside `handleSubmit`,** so React Hook Form's `isSubmitting` covers the whole request. Errors are handled in `onError`, and the rejection is dropped there.
- **The backdrop click uses a DOM listener on the `<dialog>`, not `onClick`.** jsx-a11y flags a click handler on a non-interactive element. Escape is the keyboard equivalent, and the browser handles it.
- **The checkbox border is 1.5px as in Kuat,** but Chrome draws it at 1px on a 1× screen; Kuat's own component would too.
- **The description wraps to two lines** at 480px with a long org name. That's accepted.

## Deviations from plan
- **No new API test.** "Lets the added user sign in with Google" already existed (3.8); it now also checks the session and `/me`.
- **`Dialog` takes `widthClass` instead of a numeric `width`,** to avoid an inline style object (react-perf lint). It's still 480px.
- **Added:** "starts empty again after being closed", and the "Adding…" check in the double-click test.

## Not done / follow-ups
- **5.3:** editing roles (the same checkboxes can be reused), deactivating and reactivating, and the action column.
- **Optional:** sign in with a second Google account of yours after adding it.
