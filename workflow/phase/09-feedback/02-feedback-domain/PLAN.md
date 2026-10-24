# 9.2 Feedback domain — Plan

**Phase:** 9 — Feedback
**Status:** Done

## Goal
draft → submitted → delivered; submitting snapshots `previous_color_code` and updates the intern's color code; no reset to "none"; feedback marked as notice puts the intern `on_notice` for one month in the same transaction

## Done when
- **A pure `Feedback` aggregate** (`modules/feedback/domain/feedback.ts`) with the lifecycle below, every rule refused with a readable `AppError` (as the intern's are).
- **Submitting is one domain operation over both aggregates:** it returns the submitted feedback and the updated intern (colour, and notice when asked), so 9.3 saves them in one transaction.
- **A repository port and its Drizzle adapter** that save a feedback entry (insert or update) and the intern together, **in one transaction**, and load one by id.
- Unit tests for every rule and an integration test showing the all-or-nothing save; `pnpm check` passes. The roadmap's "Done when": **unit tests pass**.

## The lifecycle
| Operation | Allowed when | What it does |
|---|---|---|
| **`draftFeedback`** | The intern isn't read-only | A new draft: period, body (may be blank), colour (`null` = no colour), notice flag. |
| **`editDraft`** | A draft, by its author | Replaces any of period, body, colour, notice. |
| **`discardDraft`** | A draft, by its author | Allowed (the repository deletes it; 9.1 decision 1). Also allowed once the intern is read-only, so nothing is stuck. |
| **`submitFeedback`** | A draft, by its author; the intern isn't read-only | Checks the submission rules (below), sets `submitted` and `submittedAt`. **If it sets a colour:** snapshots the intern's code as `previousColorCode` and sets the intern's code. **If it gives notice:** the intern goes `on_notice` for one month from the submission day, with an event pointing at the feedback (7.x's `giveNotice`). |
| **`editSubmitted`** | Submitted, by its author; the intern isn't read-only | **The text only.** Period, colour and notice are fixed once submitted. |
| **`deliver`** | Submitted | `delivered` with the conversation's id. Used by 10.2's conversation; built here because it completes the lifecycle. |
| *anything on delivered* | Never | Refused ("Delivered feedback can't be changed."), before the trigger would. |

**Submission rules:** a non-blank body ("Write your feedback before submitting.", v2 A7-errors); a period in range (decision 4); and notice only for an Active intern (decision 2).

**"No reset to none"** holds by construction: a feedback colour of `null` means "leave it", so no operation can set an intern's code back to `null`.

## Decisions (agreed)

### (1) Colour and notice are independent
A feedback entry can **set any colour (or none) and give notice** at the same time; notice doesn't need Red. v2's dialog pre-selecting Red when notice is switched on is only a suggestion (9.5).

### (2) Who can give notice, and when
Any author who may write feedback (mentor or PM of the batch; checked in 9.3). The intern must be **Active**: v2 disables the switch for an intern already on notice or read-only, and the domain refuses both ("… is already on notice"). The notice **starts on the day it's submitted** and ends a calendar month later (7.x's `giveNotice`). The day comes from the caller (9.3 decides the time zone).

### (3) The status history's reason
A fixed sentence, **"Notice given in the October 2026 feedback."** (the period's month). The event points at the feedback (`feedback_id`), so the text isn't copied into the history.

### (4) Which months can be chosen
**From the batch's start month to the current month.** Checked when a draft is saved and again on submit. Several entries for the same month are fine.

### (5) `previousColorCode` only when the colour changes
Recorded **only when the feedback sets a colour** (Orange → Red); feedback with "No colour" leaves it empty. The colour history (9.7) reads it directly.

## Plan
- **`modules/feedback/domain/feedback-id.ts`, `feedback.ts`:** the aggregate (id, internId, authorId, period, body, colorCode, previousColorCode, givesNotice, state, conversationId, submittedAt, createdAt, updatedAt) and the operations above. Inputs parsed with Zod where they come from people (body up to 20,000 characters, as interview notes; period a `YYYY-MM-01`). Errors: `validation` with field issues, `forbidden` for someone else's draft, and `conflict` with new codes (`feedback_not_draft`, `feedback_delivered`, `intern_not_active`) added to the contracts' `ErrorCode`.
- **`submitFeedback(feedback, intern, { actor, eventId, today, now })` → `{ feedback, intern }`**, using the intern module's `giveNotice` and a new intern operation **`setColorCode`** (refused once read-only).
- **`modules/feedback/application/feedback-repository.ts`** (port) and **`infrastructure/drizzle-feedback-repository.ts`:** `findById`, `save(feedback, intern?)` in one transaction (the intern through the intern module's repository, which already appends status events), `delete` for a discarded draft.

### Tests
- **Unit (`feedback.test.ts`):** each row of the lifecycle table, allowed and refused (wrong state, wrong author, read-only intern, delivered); a blank body is fine for a draft and refused on submit; months before the batch or in the future refused; **colour:** the snapshot and the intern's new code, no colour leaves both alone, an intern with a code stays coded; **notice:** Active → On notice for one month from today with the event's feedback id and reason; refused on notice and read-only; **any colour, or none, can go with notice** (decision 1); submitted feedback's period, colour and notice can't change.
- **Integration (Testcontainers):** submit with colour and notice → the feedback, the intern's colour and status, and the status event are all saved; **a failure part-way (a forced error saving the event) leaves none of them**; a draft is deleted; loading returns what was saved.
- **Mutations** (on copies, restored with `cp`): the snapshot skipped; notice allowed on an intern already on notice; submitted colour editable; the intern saved in a separate transaction. Each must fail a test.

### Out of scope
- **Who may write** (a current mentor or the PM of the batch; admins only if assigned) and drafts visible only to their author: access in 9.3's use cases.
- **The API** (9.3), the editor and dialog (9.4, 9.5), the timeline (9.6) and the colour history (9.7).
- **Conversations** (10.2), which call `deliver`.

### Steps
1. The aggregate and its unit tests; the intern's `setColorCode`; the error codes.
2. The repository port and adapter, with the integration test.
3. `pnpm check`, mutations, `REVIEW.md`. No browser check: nothing is visible.

### Verification
- `pnpm check` exits 0; the mutations fail tests.
