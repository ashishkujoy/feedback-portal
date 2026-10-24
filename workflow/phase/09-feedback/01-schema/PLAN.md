# 9.1 Schema — Plan

**Phase:** 9 — Feedback
**Status:** Done

## Goal
`feedback` table

## Done when
- **The `feedback_state` enum** (`draft`, `submitted`, `delivered`) and **the `feedback` table** as DATA_MODEL §3 describes it, with the checks and indexes below, in a new **`feedback` module** (`apps/api/src/modules/feedback/infrastructure/schema.ts`, picked up by `drizzle.config.ts`'s glob).
- **The foreign key promised in 7.1:** `intern_status_events.feedback_id` → `feedback`.
- **A migration** generated with `pnpm db:generate --name feedback` that applies to a fresh database and on top of the current one.
- **Schema tests** (Testcontainers) for the defaults, every check, the indexes' use and the delete rule; `pnpm check` passes. DATA_MODEL is updated to match.

## The table
| Column | Type | Notes |
|---|---|---|
| id | uuid PK, `uuidv7()` | |
| intern_id | uuid FK → interns | |
| author_id | uuid FK → users | |
| period | date | The first day of the month covered |
| body | text, not null | Markdown |
| color_code | `color_code` null | `NULL` means "leave unchanged" |
| previous_color_code | `color_code` null | The intern's code just before submission |
| gives_notice | boolean, default `false` | |
| state | `feedback_state`, default `draft` | |
| conversation_id | uuid null | **No foreign key yet:** `conversations` arrives in 10.1, which adds it (as 7.1 did for `feedback_id`) |
| submitted_at | timestamptz null | |
| created_at / updated_at | timestamptz, default `now()` | |

**Indexes** (DATA_MODEL): (`intern_id`, `period`), and (`intern_id`, `submitted_at`) where `color_code is not null` (the latest coloured feedback, and the colour history). Plus (`author_id`, `state`) for an author's own drafts (M26 "My pending", and 9.3's "drafts visible to the author only").

**No cascades,** as in every other table: deleting an intern or a user with feedback fails.

## Checks
What the database can guarantee whatever the code does; the rules that need the intern's state (one colour code can't go back to none, notice only for an active intern, who may write) stay in the domain (9.2).
- **`period` is the first of a month:** `extract(day from period) = 1`.
- **Submitted means submitted:** `submitted_at` is set exactly when `state <> 'draft'`.
- **Delivered means delivered:** `conversation_id` is set exactly when `state = 'delivered'`.
- **The snapshot is only taken on submit:** a draft has no `previous_color_code`.
- **Submitted feedback has text:** the body may be blank in a draft (saved half-written), but not once submitted (`state = 'draft' or body ~ '[^[:space:]]'`).
- **On `intern_status_events`:** a `feedback_id` only on an event going `on_notice` (the only thing feedback can do to a status).

## Decisions (agreed)

### (1) Deleting drafts: allowed, nothing else
v2's **A26 "Discard this draft?"** deletes a draft, which only its author ever saw. **A trigger rejects deleting any feedback that isn't a draft,** so submitted and delivered feedback are never deleted. DATA_MODEL §6.5 is reworded to say so.

### (2) Delivered feedback can't be changed
**Enforced by the database:** the same trigger **rejects any `UPDATE` of a row that is already `delivered`**. Delivering itself is allowed (that update starts from `submitted`), and so are the author's edits to submitted feedback. The domain (9.2) and API (9.3) refuse it too, with a readable error; the trigger is the last guard.

### (3) Where the table lives: a new `feedback` module
DATA_MODEL §2 already groups `feedback`, `conversations` and `comments` as a "feedback" context. It references `interns` and `users` from their modules, as `interns` references `batches`.

## Plan
- **`modules/feedback/infrastructure/schema.ts`:** `feedbackStateEnum` (values from a new `feedbackStates` in `@feedback-portal/contracts`, as `internStatuses` and `colorCodes` are), `feedback` with its checks and indexes.
- **`modules/intern/infrastructure/schema.ts`:** `feedbackId` references `feedback.id`, and the new events check. (The intern module importing the feedback schema is a schema-only dependency, as the status history's column always pointed there.)
- **Migration** via `pnpm db:generate --name feedback`, plus the trigger written into it by hand (as 0003 did for the append-only trigger): `feedback_protect` rejects deleting a non-draft and updating a delivered row.
- **`DATA_MODEL.md`:** the table as built (the third index, the checks), §6.5 reworded (decision 1), and the `feedback_id` note.

### Tests (`modules/feedback/infrastructure/schema.int.test.ts`)
- **Defaults:** id (uuid v7), `state = 'draft'`, `gives_notice = false`, the timestamps.
- **Each check** accepts the valid case and rejects the invalid one: a period on the 2nd; a draft with `submitted_at`, a submitted one without; `delivered` without `conversation_id`, and `conversation_id` on a submitted one; a draft with `previous_color_code`; a submitted blank body (a draft's is fine).
- **Unknown values:** an unknown intern, author, state or colour is rejected.
- **Deleting:** a draft can be deleted; submitted and delivered feedback can't; an intern or user with feedback can't be deleted.
- **Delivered is final:** submitted feedback can be edited and then delivered; any later update to the delivered row (its body, colour, state or conversation) is rejected.
- **Status events:** an `on_notice` event can point at feedback; one pointing at a missing feedback row, or a non-notice event with `feedback_id`, is rejected.
- **Mutations** (on copies, restored with `cp`): the period check removed; the trigger letting submitted feedback be deleted; the trigger letting a delivered row be updated; the `submitted_at` check removed. Each must fail a test.

### Out of scope
- **The domain and its rules** (9.2): who may write, colour codes never going back to none, notice only for an active intern, the one-month notice in the same transaction, and readable errors for changing delivered feedback.
- **`conversations` and `comments`** (10.1), including `conversation_id`'s foreign key.
- **The API and UI** (9.3 onward).

### Steps
1. The contracts enum; the schema, the events change; generate the migration and add the trigger.
2. The schema tests and mutations.
3. DATA_MODEL; `pnpm check`; `REVIEW.md`. No browser check: nothing is visible.

### Verification
- `pnpm check` exits 0, and the migration applies to a fresh database (the Testcontainers run) and to the Compose database.
- The mutations fail tests.
