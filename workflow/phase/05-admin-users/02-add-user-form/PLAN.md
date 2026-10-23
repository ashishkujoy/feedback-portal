# 5.2 Add user form — Plan

**Phase:** 5 — Admin: users
**Status:** Done

## Goal
Name + email, validated with React Hook Form + Zod

## Done when
- **An admin adds a user from Users and roles:** the design's **Add user** button opens the Add user dialog (A13), with name, email and roles.
- **The form checks its fields with the shared `CreateUserRequest` contract** (React Hook Form + `@hookform/resolvers/zod`, as TECH_STACK chose), and shows the API's errors too (an email that's already taken, or anything else).
- **On success** the dialog closes and the new user is in the list.
- **The new user can then sign in.** A new API test adds a user through `POST /users` and signs them in through the Google callback (with the fake `GoogleAuth`).
- Tests cover these. `pnpm check` passes, and the dialog matches the design's measurements in the browser.

## What the design shows (A13, read from `* Screen.dc.html` and the Kuat bundle)
- **The trigger:** a primary Kuat Button (md: 36px high, padding 0 16px, gap 8, 14px/500, `--radius-md`) with a 16px `plus` icon, "Add user", on the right of the header row. 5.1 already left room for it.
- **Kuat Dialog, 480px wide:**
  - **Overlay:** fixed, `slate-900` at 55%, 24px padding, the dialog centred.
  - **Panel:** `--background`, a 1px `--border`, `--radius-none`, `--shadow-2xl`.
  - **Head:** padding 20px 22px 0. The title is `--text-h4`/600. The description is 14px muted with line-height 1.5, 4px under the title. A close button (an 18px ×, muted, 4px padding) on the right.
  - **Body:** padding 16px 22px 0, then 22px at the bottom.
- **Fields** (a column with gap 16; each field is a column with gap 6):
  - the label at 14px/500;
  - **Full name**, then **Email**: Kuat Input md (36px, padding 0 12px, `--input`, a 1px `--border`, `--radius-sm`, and a `--ring` border with a 3px 35% ring on focus);
  - **Role:** a Select (Admin, Programme manager, Mentor; Mentor chosen), with help text at 12px muted: "Mentors can give feedback and comment. Assign them to a batch from the batch page."
- **Footer:** a 1px top `--border`, padding-top 16, right-aligned with gap 8: an outline **Cancel** and a primary **Send invite**.
- **Kuat Field's error** (the design shows none, but Kuat has it): the Input border turns `--destructive`, and the message replaces the help text at 12px in `--destructive`.

## Decisions needed

### (1) Roles: several, not one
The design has a single Role select. Design-README decision 3 says users hold **several** roles, and the API takes a list.

| Option | What it means |
|---|---|
| **A. Three Kuat Checkboxes** *(recommended)* | A `fieldset` with the legend "Roles" (styled like the other labels): Admin, Programme manager and Mentor, most privileged first, in a row with gap 16. **Mentor is checked by default**, as the design pre-selects Mentor. Kuat Checkbox is 18px, 1.5px border (`slate-300`, `--primary` when checked), `--radius-sm`, 14px label at gap 8. The help text stays under them. "At least one role is required" (the contract's message) if none. |
| B. The design's single Select | One role on creation, more added in 5.3. That's closer to the drawing, but needs a second step for anyone who's both a PM and a mentor. |

### (2) The copy (design-README decision 5: no invite email)
- **Description:** "They sign in with their \<Org\> Google account, using this email." `<Org>` comes from `GET /settings`, as on the sign-in page.
- **The primary button:** "Add user" (while saving: "Adding…", disabled).

### (3) What happens around the form
- **Errors** are shown when you submit, then re-checked as you type (React Hook Form's default). Each field's message is from the contract ("Name is required", "Invalid email address", …), under the field, with the field marked `aria-invalid` and described by the message. Focus goes to the first invalid field.
- **A 409 `email_taken`** becomes the email field's error: "A user with this email already exists."
- **Any other failure** (a 5xx, the network) shows an `issue` Callout above the footer, "We couldn't add this user", with the problem's `detail`. The dialog stays open with what was typed.
- **On success:** the dialog closes, `['users']` is refetched, and focus returns to the Add user button. **No toast:** the design has none, and the new row appears. The form resets the next time it opens.
- **Cancel, ×, Escape or clicking the overlay** closes it without saving. (Kuat's Dialog closes on an overlay click; we keep that.)
- **The dialog is a native `<dialog>` opened with `showModal()`.** The browser then gives us the focus trap, Escape, `inert` behind it, and the top layer. It's styled to Kuat's measurements, with the overlay as `::backdrop`.
- **The dialog isn't in the URL.** It's a short form, and Back shouldn't reopen it.

### (4) Dependencies
`react-hook-form@7.90.0` (12 days old) and `@hookform/resolvers@5.9.2` (6 days old). **Not resolvers 6.0.0:** it's a new major, released 4 days ago. I'll `diff` `pnpm-workspace.yaml` after installing.

## Plan
- **`ui/button.tsx`:** Kuat Button, the `primary` and `outline` variants at `md`, with hover, active, disabled and a visible focus ring. The colours come from `@equal-experts/kuat-core/button-variables.css` (imported in `styles.css`), not copied.
- **`ui/dialog.tsx`:** the Kuat Dialog on `<dialog>`, with `open`, `onClose`, `title`, `description` and `width`, `aria-labelledby` and `aria-describedby`, and the overlay click.
- **`ui/text-input.tsx`:** Kuat Input (md) with `invalid`. 5.1's `SearchInput` is reworked to use it, so there's one input style.
- **`ui/checkbox.tsx`:** Kuat Checkbox, on a real `<input type="checkbox">` that's visually hidden, so it's keyboard- and label-accessible.
- **`ui/field.tsx`:** Kuat Field: label, control, then the error or the help text, with the ids wired up.
- **`api/users.ts`:** `createUser(body)` → `apiFetch('/users', { method: 'POST', body, schema: AdminUser })`.
- **`users/add-user-dialog.tsx`:** `useForm<CreateUserRequest>({ resolver: zodResolver(CreateUserRequest), defaultValues: { name: '', email: '', roles: ['mentor'] } })`, and `useMutation(createUser)` that invalidates `['users']` on success and maps `email_taken` with `setError('email', …)`.
- **`pages/users-page.tsx`:** the Add user button in the header row, which opens the dialog.

### API
- **No change to the endpoint.** One new integration test: **add a user through `POST /users`, then complete the Google callback as them** (the fake `GoogleAuth` returns that email), and get a session and `GET /me` with their roles. That's the "can then sign in" check, end to end in the API.

### Tests (web)
- **The dialog:** opening it focuses the name field; the title and description are its accessible name and description; Escape and Cancel close it without a request.
- **Validation:** submitting empty shows "Name is required" and "Invalid email address" on the right fields, with no request. Unchecking every role shows "At least one role is required".
- **Success:** the request body is the trimmed name, the lower-cased email and the checked roles. The dialog closes, the new user is in the list, and focus is back on Add user.
- **`email_taken`:** the error is under Email and the dialog stays open with the values. **A 500** shows the Callout.
- **The button is disabled while saving,** so a double click sends one request.
- **Mutations** (on copies restored with `cp`): no `zodResolver`, no invalidation, and `email_taken` not mapped must each fail a test.

### Docs
- **design/README.md:** "Add user (A13) as built in 5.2": the roles checkboxes, the copy, the error states and the native dialog.
- **TECH_STACK:** the Forms row gets the versions.

### Out of scope
- **Editing roles and deactivating** (5.3).
- **Sending an email.** There's no invite (decision 5).
- **Checking the email's domain** against the organisation. The API doesn't, and an admin may add someone with another Google account.

### Steps
1. Dependencies. Button, TextInput (and SearchInput on it), Checkbox, Field and Dialog.
2. `createUser`, the dialog and the page's button, with tests.
3. The API sign-in test.
4. Docs. Run `pnpm check`, do the browser check, and write `REVIEW.md`.

### Verification
- `pnpm check` exits 0, and `pnpm-workspace.yaml` is unchanged.
- **In the browser** (the Compose stack, headless Chrome, a test admin):
  - computed styles of the button, dialog, inputs, checkboxes and errors match the measurements above;
  - adding a `@browsercheck.test` user puts them in the list, and adding them again shows the email error;
  - Escape and the overlay close it, and focus returns to the button.
- The test users are deleted afterwards.
- **Optional, needs you:** add a second Google account of yours, then sign in with it.
