# 7.9 Edit intern details — Review

## What changed
| File | Notes |
|---|---|
| `packages/contracts/src/intern.ts` (+ test) | **`UpdateInternDetailsRequest`:** `CreateInternRequest` without `username`. It has the same rules and messages, and a username that's sent is dropped. |
| `apps/api/src/modules/intern/application/manage-interns.ts` | **`updateInternDetails`:**<br>• the batch's managers, not archived (7.3's check);<br>• **lock** the intern of that batch (another batch's → 404);<br>• 7.2's `updateDetails` with **the stored username** (read-only → 409);<br>• save, then read back. |
| `intern/http/interns.routes.ts` | **`PUT /batches/:batchId/interns/:internId/details`** → 200 `InternDetail`, for admins and PMs by role, with the use case checking the batch. Logs carry ids only. |
| `apps/web/src/interns/intern-fields.tsx` | **A14's fields, shared:** `InternDetailFields` (the 2-column grid, Parents' names, and Interview notes) and `UsernameField`. **Add intern now uses them;** its 11 tests pass unchanged. |
| `interns/profile/edit-details-dialog.tsx` | **A15:** 560px; "Edit details" · "\<Name\> · \<Batch\>"; **Username disabled** with "Usernames can't change because imports match on them."; the other fields filled in from the profile (blanks for missing ones); focus on Full name; Save details ("Saving…"). Errors under each field, and a refusal in an `issue` Callout. **On success** it shows the API's answer and refreshes the roster (exact key). |
| `interns/profile/section-card.tsx`, `intern-details.tsx`, `pages/intern-page.tsx` | The Details card's header gets **Edit details** (outline `sm`) for the batch's managers while the record isn't read-only. The profile's `canEdit` also gates the photo button (7.7: photos on and `canEdit`). |
| `apps/web/src/ui/text-input.tsx` | **Kuat's disabled Input:** `--muted` at 60% opacity. It was missing until a field was first disabled here. |
| `api/interns.ts`, `README.md`, `design/README.md` | `updateInternDetails`; the endpoint; **"Edit details (A15) as built in 7.9"**. |

## How to verify
```sh
pnpm check     # contracts 69 + web 242 + api 512
```

| Check | Result |
|---|---|
| `pnpm check` | **Exit 0.** 69 (+1) + 242 (+11) + 512 (+4). Format and lint clean, with no suppressions. |
| Routes (4) | **The PM and an admin → 200** with the details normalised (`Ishita R.`, the email lower-cased, a blank phone → `null`, the branch, parents and notes set) and **the username still `ishita.rao` although `someone.else` was sent**. An invalid email → 400 "Invalid email address". **A mentor (a PM elsewhere) 403, a PM not on the batch 404, another batch's intern 404, signed out 401**; once graduated → 409 `intern_read_only`; archived → 409 `batch_archived`. |
| Web (11) | **The button** for the PM and an admin who isn't the PM; none for a mentor, a withdrawn intern or an archived batch. **The dialog** opens on the current values, with Username disabled, filled in and described, and focus on Full name. **An invalid email** shows the contract's message and nothing is sent. **Saving** sends every field but the username (a cleared phone → `null`), closes, and shows the new name. **The roster query is invalidated** after saving (opened from the roster first). A 409 shows "We couldn't save these details". Cancel sends nothing. |
| **Mutations** (on copies, restored with `cp`, checked with `cmp`) | **4, all caught:**<br>• the username taken from the request;<br>• the manager check removed (visibility only);<br>• `updateDetails` bypassed, so the read-only check skipped;<br>• the roster not refreshed. |
| **Browser** (Compose, headless Chrome at 1440, as the batch's PM and one of its mentors) | **Edit details** is 32px, padding 0 12px, outline EE Blue. **The dialog:** 560px; "Edit details · Ishita Rao · Check Batch Main"; Username `ishita.rao`, disabled (`--muted`, 60%), with its help; the fields filled in (notes with their line breaks); focus on Full name. **"nope"** as the email → "Invalid email address". **Saved** with a new name, a mixed-case email, the phone cleared and a branch: the dialog closed; the heading read "Ishita R. Rao"; Details showed `ishita.r@example.com`, Phone "—", Diploma branch Mechanical, the username unchanged; **the roster card** read "Ishita R. Rao". **As the mentor:** no Edit details. |
| Clean-up | Test users, sessions, the batch, intern and events deleted. The trigger was bypassed only inside the cleanup transaction, and is still enabled. Only your account (and its own session) remains. Chrome stopped; tokens and screenshots removed. |

## Decisions & trade-offs
- **All five decisions as recommended.** The Airtable question (decision 5) is left for Phase 8 to decide.
- **The form is shared, not copied,** so Add intern and Edit details can't drift apart.
- **A disabled TextInput now looks like Kuat's.** No other screen disables one yet.

## Deviations from plan
- **The disabled Input style** wasn't in the plan; it was found in the browser check.

## Not done / follow-ups
- **Phase 8:** whether a re-import overwrites hand edits (decision 5).
- **Phase 7 is complete** with this task. Earlier follow-ups (v2 reconciliation, the PRODUCT §10 wording, your Google sign-in and Cloudinary checks) are still open.
