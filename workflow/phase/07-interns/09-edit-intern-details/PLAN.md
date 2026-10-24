# 7.9 Edit intern details — Plan

**Phase:** 7 — Interns
**Status:** Done

## Goal
Fix an intern's details from the profile (A15); usernames stay fixed

## Done when
- **`PUT /batches/:batchId/interns/:internId/details`** replaces an intern's details (name, email, phone, diploma branch, parents' names, interview notes) through 7.2's `updateDetails`. **The username can't change.**
- **Only the batch's managers** can do this, never in an archived batch, and never for a read-only intern (409 `intern_read_only`).
- **The profile's Details card has v2's Edit details button and the A15 dialog,** and the profile and roster show the change straight away.
- API and web tests pass, and `pnpm check` passes. In the browser, the dialog matches A15 and a change shows at once.

## What v2 draws (A15)
- **Where:** an outline `sm` **Edit details** at the right of the Details card's header (P22), shown when the user can edit (v2: admins and PMs, not on a final intern).
- **The dialog:** A14's layout (560px):
  - the title **"Edit details"**, the description **"\<Name\> · \<Batch\>"**;
  - **Username disabled**, with the help text "Usernames can't change because imports match on them.";
  - the same fields as Add intern: Full name, Email, Phone, Diploma branch, Parents' names, and Interview notes (mono, 5 rows);
  - Cancel and **Save details**.
- **Errors (A15-errors):** the field's own message, for example under Email.

## Decisions needed

### (1) Who can edit
**Recommended: admins and the batch's current PM,** as v2 and Add intern (7.3) do. Not in an archived batch, and not for a graduated, terminated or withdrawn intern (the domain already refuses, and the button is hidden).

### (2) The email message
v2's A15 shows "Enter a valid email address." Everywhere else (Add user, Add intern) says "Invalid email address", from the shared contracts.

**Recommended: keep "Invalid email address"** so every form says the same thing. A copy pass can change all of them together later.

### (3) Replace or patch
**Recommended: replace.** `PUT` with every field except the username, exactly what the dialog shows and what the domain's `updateDetails` does. A blank optional field clears it.

### (4) Two edits at once
**Recommended: the intern's row is locked while saving** (as in 7.6), so edits are made one after another. The last save wins. Each one saves exactly what its dialog showed.

### (5) Airtable later
Phase 8's import matches on username and updates existing interns. Whether an import overwrites hand edits is **Phase 8's decision**. 7.9 only notes it there.

## Plan

### Contracts
- **`UpdateInternDetailsRequest`:** `CreateInternRequest` without `username`, with the same rules and messages.

### API
- **The `updateInternDetails` use case:**
  - the batch's managers only, not archived (the 7.3 check);
  - lock the intern of that batch (another batch's → 404);
  - `updateDetails` (read-only → 409), with the existing username kept;
  - save, then read the detail back.
- **`PUT …/details`** → 200 `InternDetail`, for admins and PMs by role, with the use case checking the batch. **Logs carry ids only.**

### Web
- **`api/interns.ts`:** `updateInternDetails`.
- **`interns/profile/edit-details-dialog.tsx`:**
  - A14's form, shared rather than copied: the field layout moves into `interns/intern-fields.tsx`, and **Add intern and Edit details both use it**;
  - Username shown but disabled, with its help text;
  - the other fields filled in from the profile;
  - Save details;
  - errors under each field, and any other failure in an `issue` Callout.
- **On success:** the dialog closes, the profile shows the API's answer, and the roster is refreshed (exact key).
- **`intern-details.tsx`:** the card header gains **Edit details** (outline `sm`) when the user can edit.

### Tests
- **Routes:**
  - the PM and an admin → 200 with the new details, normalised (email lower-cased, blank → `null`), **and the username unchanged even if one is sent**;
  - an invalid email → 400;
  - a mentor (a PM elsewhere) → 403; a PM not on the batch → 404; another batch's intern → 404; archived → 409; a graduated intern → 409 `intern_read_only`; signed out → 401.
- **Web:**
  - the button for the PM and an admin; none for a mentor, a final intern or an archived batch;
  - the dialog filled in from the profile, with Username disabled and its help;
  - the contract's errors, with nothing sent;
  - saving sends the fields without the username and shows the change;
  - a 409 in the Callout;
  - Cancel sends nothing;
  - **Add intern still works as in 7.3**, since its form now uses the shared fields.
- **Mutations** (on copies, restored with `cp`):
  - the username taken from the request;
  - the manager check removed;
  - the read-only check skipped;
  - the roster not refreshed.

  Each must fail a test.

### Out of scope
- **Changing a username or moving an intern to another batch.**
- **Editing an intern's history.** Events are append-only.

### Steps
1. Contract, use case and route, with tests.
2. Shared fields, the dialog and the button, with tests (Add intern's included).
3. Run `pnpm check` and the mutations. Do the browser check (Compose, headless Chrome as the PM: open the dialog, measure it against A15, save a change, see it on the profile and roster; an invalid email; as a mentor). Write `REVIEW.md`.

### Verification
- `pnpm check` exits 0.
- In the browser, the dialog matches A15 and a saved change shows at once.
- The test rows are deleted afterwards.
